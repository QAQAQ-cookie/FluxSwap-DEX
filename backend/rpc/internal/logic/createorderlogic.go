package logic

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/ethereum/go-ethereum/common"
	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type CreateOrderLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

// NewCreateOrderLogic 创建下单逻辑处理器。
func NewCreateOrderLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CreateOrderLogic {
	return &CreateOrderLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// CreateOrder 负责验签、查重、估算执行费并把订单写入数据库。
func (l *CreateOrderLogic) CreateOrder(in *executor.CreateOrderRequest) (*executor.CreateOrderResponse, error) {
	// 校验链 ID 必须是正数，避免订单写入到无效链空间。
	if in.GetChainId() <= 0 {
		// 参数不合法时直接返回 gRPC InvalidArgument，前端应修正请求后再提交。
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	// 校验结算合约地址格式，后续验签和链上执行都依赖这个地址。
	if !isAddress(in.GetSettlementAddress()) {
		// 结算合约地址不是合法 EVM 地址时拒绝创建订单。
		return nil, status.Error(codes.InvalidArgument, "settlementAddress must be a valid address")
	}
	// 校验订单哈希格式，订单哈希必须是 bytes32 的十六进制字符串。
	if !isHash(in.GetOrderHash()) {
		// 哈希格式错误时拒绝请求，避免后续查重和事件匹配失效。
		return nil, status.Error(codes.InvalidArgument, "orderHash must be a valid bytes32 hex string")
	}
	// 校验 maker 地址格式，maker 是订单签名者和资金提供方。
	if !isAddress(in.GetMaker()) {
		// maker 地址非法时无法完成签名校验和资金检查。
		return nil, status.Error(codes.InvalidArgument, "maker must be a valid address")
	}
	// 校验输入代币地址格式，inputToken 是用户支付的资产。
	if !isAddress(in.GetInputToken()) {
		// 输入代币地址非法时无法构造结算订单。
		return nil, status.Error(codes.InvalidArgument, "inputToken must be a valid address")
	}
	if common.HexToAddress(normalizeAddress(in.GetInputToken())) == (common.Address{}) {
		return nil, status.Error(codes.InvalidArgument, "inputToken must be an ERC20 token address")
	}
	// 校验输出代币地址格式，outputToken 是用户希望收到的资产。
	if !isAddress(in.GetOutputToken()) {
		// 输出代币地址非法时无法估算执行费或完成链上结算。
		return nil, status.Error(codes.InvalidArgument, "outputToken must be a valid address")
	}
	// 输入代币和输出代币不能相同，否则限价订单没有实际兑换意义。
	if normalizeAddress(in.GetInputToken()) == normalizeAddress(in.GetOutputToken()) {
		// 相同币种兑换会造成无效订单，因此直接拒绝。
		return nil, status.Error(codes.InvalidArgument, "inputToken and outputToken must be different")
	}
	// 校验输入数量必须是正整数字符串，单位由前端按 token decimals 转为最小单位。
	if !isPositiveUint(in.GetAmountIn()) {
		// amountIn 为 0、负数或非整数时拒绝创建订单。
		return nil, status.Error(codes.InvalidArgument, "amountIn must be a positive integer string")
	}
	// 校验最小输出数量必须是正整数字符串，用于保护用户成交下限。
	if !isPositiveUint(in.GetMinAmountOut()) {
		// minAmountOut 非法时无法保证订单执行后的最小到账数量。
		return nil, status.Error(codes.InvalidArgument, "minAmountOut must be a positive integer string")
	}
	// 校验最大执行奖励比例字段必须是无符号整数字符串，允许为空；空值后面按 0 处理。
	if strings.TrimSpace(in.GetMaxExecutorRewardBps()) != "" && !isUint(in.GetMaxExecutorRewardBps()) {
		// maxExecutorRewardBps 格式非法时拒绝请求，避免写入不可比较的比例值。
		return nil, status.Error(codes.InvalidArgument, "maxExecutorRewardBps must be an unsigned integer string")
	}
	// 最大执行奖励比例使用 bps 表示，10000 表示 100%，不能超过全部 surplus。
	if strings.TrimSpace(in.GetMaxExecutorRewardBps()) != "" &&
		mustBigInt(in.GetMaxExecutorRewardBps()).Cmp(big.NewInt(10_000)) > 0 {
		// 超过 10000 会让执行器奖励比例失去边界，因此在签名前直接拒绝。
		return nil, status.Error(codes.InvalidArgument, "maxExecutorRewardBps must be less than or equal to 10000")
	}
	// 校验触发价格必须是正整数字符串，当前使用 1e18 精度表达价格。
	if !isPositiveUint(in.GetTriggerPriceX18()) {
		// 触发价格非法时订单无法被执行器正确判断。
		return nil, status.Error(codes.InvalidArgument, "triggerPriceX18 must be a positive integer string")
	}
	// 校验过期时间必须是正整数字符串，通常对应链上区块时间戳。
	if !isPositiveUint(in.GetExpiry()) {
		// 过期时间非法时无法判断订单生命周期。
		return nil, status.Error(codes.InvalidArgument, "expiry must be a positive integer string")
	}
	// 校验 nonce 必须是无符号整数字符串，用于订单唯一性和批量撤单。
	if !isUint(in.GetNonce()) {
		// nonce 非法会影响链上作废和签名订单匹配。
		return nil, status.Error(codes.InvalidArgument, "nonce must be an unsigned integer string")
	}
	// 校验收款地址格式，recipient 是最终收到输出代币的地址。
	if !isAddress(in.GetRecipient()) {
		// 收款地址非法时拒绝创建，避免执行成功后资产无法按预期到账。
		return nil, status.Error(codes.InvalidArgument, "recipient must be a valid address")
	}
	// 校验签名格式，EIP-712 签名应为 65 字节十六进制字符串。
	if !isSignature(in.GetSignature()) {
		// 签名格式不完整时无法恢复签名者地址。
		return nil, status.Error(codes.InvalidArgument, "signature must be a valid 65-byte hex signature")
	}
	// 确认服务上下文已经初始化数据库连接。
	if l.svcCtx.DB == nil {
		// 数据库不可用时不能落库，因此返回 FailedPrecondition。
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}

	// 创建订单仓储，用于订单查重和最终写入。
	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	// 按 chainId、settlementAddress、orderHash 查询是否已有同一订单。
	existingOrder, err := orderRepo.GetByOrderHash(
		// 使用当前请求上下文，便于取消和超时控制。
		l.ctx,
		// 使用请求里的链 ID 作为多链隔离条件。
		in.GetChainId(),
		// 使用请求里的结算合约地址作为协议实例隔离条件。
		in.GetSettlementAddress(),
		// 使用订单哈希作为订单唯一标识。
		in.GetOrderHash(),
	)
	// 如果查询没有错误，说明订单已经存在。
	if err == nil {
		// 已存在时不重复创建，直接返回库里的订单快照。
		return &executor.CreateOrderResponse{
			// 把已存在的领域模型转换成 RPC 响应模型。
			Order: orderToResponse(existingOrder),
			// 返回业务失败提示，但不把它当成系统错误。
			Notice: failureNotice(
				// 业务错误码：订单已存在。
				"ORDER_ALREADY_EXISTS",
				// 简短错误信息。
				"order already exists",
				// 给调用方的处理建议。
				"reuse the stored order instead of creating the same signed order again",
				// 当前失败发生在查重阶段。
				"dedupe_check",
			),
		}, nil
	}
	// 如果查询报错且不是“记录不存在”，说明数据库查询本身异常。
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		// 记录内部日志，方便后端排查数据库问题。
		l.Errorf("query existing order failed: %v", err)
		// 对外返回内部错误，不暴露数据库细节。
		return nil, status.Error(codes.Internal, "query existing order failed")
	}

	// 读取来源字段，并去掉前后空格。
	source := strings.TrimSpace(in.GetSource())
	// 如果前端没有传来源，则默认标记为 rpc。
	if source == "" {
		// 默认来源用于后续排查订单从哪个入口创建。
		source = "rpc"
	}

	// 将 RPC 请求转换为结算合约里的订单结构。
	payload, err := buildSettlementOrderFromRequest(in)
	// 如果请求字段无法转换成链上订单结构，则说明参数不合法。
	if err != nil {
		// 把转换失败原因作为 InvalidArgument 返回给调用方。
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	// 按合约一致的规则重新计算订单哈希。
	computedOrderHash, err := chain.ComputeOrderHash(payload)
	// 计算哈希失败通常说明本地编码逻辑或输入数据存在异常。
	if err != nil {
		// 记录计算失败的内部错误。
		l.Errorf("compute order hash failed: %v", err)
		// 对外返回内部错误，避免继续处理不可信订单。
		return nil, status.Error(codes.Internal, "compute order hash failed")
	}
	// 比较前端提交的 orderHash 与后端重新计算的 orderHash。
	if normalizeHash(in.GetOrderHash()) != strings.ToLower(computedOrderHash.Hex()) {
		// 哈希不一致说明签名内容和提交内容不匹配，拒绝落库。
		return &executor.CreateOrderResponse{
			// 返回业务失败提示，方便前端提示用户重新签名。
			Notice: failureNotice(
				// 业务错误码：订单哈希不匹配。
				"ORDER_HASH_MISMATCH",
				// 简短错误信息。
				"order hash does not match payload",
				// 给调用方的处理建议。
				"recompute orderHash from the exact signed payload before submitting",
				// 当前失败发生在请求校验阶段。
				"request_validation",
			),
		}, nil
	}

	// 规范化签名格式，保证后续验签使用标准 65 字节十六进制签名。
	normalizedSignature, err := chain.NormalizeHexSignature(in.GetSignature())
	// 如果签名无法规范化，说明签名格式不符合要求。
	if err != nil {
		// 返回业务失败提示，而不是系统错误。
		return &executor.CreateOrderResponse{
			// 告诉调用方签名格式错误。
			Notice: failureNotice(
				// 业务错误码：签名无效。
				"INVALID_SIGNATURE",
				// 简短错误信息。
				"signature format is invalid",
				// 给调用方的处理建议。
				"submit a complete EIP-712 hex signature",
				// 当前失败发生在请求校验阶段。
				"request_validation",
			),
		}, nil
	}
	// 使用 chainId、settlementAddress、订单 payload 和签名做 EIP-712 验签。
	if err := chain.VerifyOrderSignature(in.GetChainId(), in.GetSettlementAddress(), payload, normalizedSignature); err != nil {
		// 验签失败说明 maker、链、合约地址或订单内容与签名不一致。
		return &executor.CreateOrderResponse{
			// 返回业务失败提示，前端应让用户重新签名。
			Notice: failureNotice(
				// 业务错误码：签名无效。
				"INVALID_SIGNATURE",
				// 简短错误信息。
				"signature verification failed",
				// 给调用方的处理建议。
				"make sure maker, chainId, settlementAddress and payload all match the signature",
				// 当前失败发生在请求校验阶段。
				"request_validation",
			),
		}, nil
	}

	// 记录当前 UTC 时间，后续多个时间字段共用同一个时间点。
	now := time.Now().UTC()
	// 读取并清理最大执行奖励比例字符串。
	maxExecutorRewardBps := strings.TrimSpace(in.GetMaxExecutorRewardBps())
	// maxExecutorRewardBps 允许为空，空值按 0 处理。
	if maxExecutorRewardBps == "" {
		// 用 0 兜底，保证数据库里的数值字段始终可比较。
		maxExecutorRewardBps = "0"
	}
	// 初始化预估 gas 使用量，链客户端不可用时保持为 0。
	estimatedGasUsed := "0"
	// 初始化报价时的 gasPrice，链客户端不可用时保持为 0。
	gasPriceAtQuote := "0"
	// 初始化当前所需执行费，链客户端不可用时保持为 0。
	lastRequiredExecutorFee := "0"
	// 初始化阻塞原因，正常情况下为空。
	lastBlockReason := ""

	// 根据链 ID 和结算合约地址查找对应链客户端。
	chainClient := l.svcCtx.LookupChainClient(in.GetChainId(), in.GetSettlementAddress())
	// 如果找不到链客户端，订单仍可落库，但会记录创建时链客户端不可用。
	if chainClient == nil {
		// 记录阻塞原因，后续订单页和执行器都能看到。
		lastBlockReason = "chain_client_unavailable_at_create"
	} else {
		// 读取当前链上区块时间，用链上时间判断订单是否已经过期。
		currentBlockTimestamp, currentBlockErr := chainClient.CurrentBlockTimestamp(l.ctx)
		// 如果链上时间读取失败，不直接拒绝订单，只记录原因。
		if currentBlockErr != nil {
			// 记录链上时间不可用的具体错误，便于排查 RPC 节点问题。
			lastBlockReason = strings.TrimSpace("chain_time_unavailable_at_create: " + currentBlockErr.Error())
			// 如果读取到了链上时间，并且订单过期时间已经小于等于链上时间，则拒绝创建。
		} else if payload.Expiry.Sign() > 0 && payload.Expiry.Uint64() <= currentBlockTimestamp {
			// 已过期订单没有执行价值，因此不写入 open 订单。
			return &executor.CreateOrderResponse{
				// 返回业务失败提示，让前端重新生成有效期更晚的签名订单。
				Notice: failureNotice(
					// 业务错误码：订单已过期。
					"ORDER_ALREADY_EXPIRED",
					// 简短错误信息。
					"order already expired",
					// 给调用方的处理建议。
					"sign a new order with an expiry later than the current on-chain block time",
					// 当前失败发生在请求校验阶段。
					"request_validation",
				),
			}, nil
		}

		// 按输出代币估算执行器实际需要收取的执行费。
		requiredExecutorFee, gasPrice, quoteErr := chainClient.SuggestExecutorFee(
			// 使用当前请求上下文控制 RPC 调用生命周期。
			l.ctx,
			// 执行费从输出代币里扣，所以这里传 outputToken。
			common.HexToAddress(normalizeAddress(in.GetOutputToken())),
			// 使用配置里的预估执行 gas。
			l.svcCtx.Config.Worker.ExecutorEstimatedGasUsed,
			// 使用配置里的安全系数，避免 gas 波动导致执行费不足。
			l.svcCtx.Config.Worker.ExecutorFeeSafetyBps,
		)
		// 如果执行费报价失败，订单仍可创建，但会记录创建时的报价失败原因。
		if quoteErr != nil {
			// 只有前面没有更重要的阻塞原因时，才写入报价失败原因。
			if lastBlockReason == "" {
				// 保存报价失败信息，供订单页和执行器后续诊断。
				lastBlockReason = strings.TrimSpace("initial_executor_fee_quote_failed: " + quoteErr.Error())
			}
		} else {
			// 把配置里的预估 gas 转成字符串写入订单快照。
			estimatedGasUsed = new(big.Int).SetUint64(l.svcCtx.Config.Worker.ExecutorEstimatedGasUsed).String()
			// 保存本次报价时的 gasPrice。
			gasPriceAtQuote = gasPrice.String()
			// 保存本次报价计算出的最低所需执行费。
			lastRequiredExecutorFee = requiredExecutorFee.String()
		}
	}

	// 构造准备写入数据库的订单领域模型。
	order := &domain.Order{
		// 保存订单所属链 ID。
		ChainID: in.GetChainId(),
		// 规范化保存结算合约地址。
		SettlementAddress: normalizeAddress(in.GetSettlementAddress()),
		// 规范化保存订单哈希。
		OrderHash: normalizeHash(in.GetOrderHash()),
		// 规范化保存 maker 地址。
		Maker: normalizeAddress(in.GetMaker()),
		// 规范化保存输入代币地址。
		InputToken: normalizeAddress(in.GetInputToken()),
		// 规范化保存输出代币地址。
		OutputToken: normalizeAddress(in.GetOutputToken()),
		// 保存输入数量字符串，去掉前后空格。
		AmountIn: strings.TrimSpace(in.GetAmountIn()),
		// 保存最小输出数量字符串，去掉前后空格。
		MinAmountOut: strings.TrimSpace(in.GetMinAmountOut()),
		// 数据库字段仍沿用 executor_fee，业务含义是用户签名允许的最大执行奖励比例。
		ExecutorFee: maxExecutorRewardBps,
		// 当前执行费按输出代币扣除，因此费用币种等于 outputToken。
		ExecutorFeeToken: normalizeAddress(in.GetOutputToken()),
		// 保存 1e18 精度的触发价格。
		TriggerPriceX18: strings.TrimSpace(in.GetTriggerPriceX18()),
		// 保存订单过期时间戳。
		Expiry: strings.TrimSpace(in.GetExpiry()),
		// 保存订单 nonce。
		Nonce: strings.TrimSpace(in.GetNonce()),
		// 规范化保存收款地址。
		Recipient: normalizeAddress(in.GetRecipient()),
		// 保存规范化后的签名，便于后续执行器直接使用。
		Signature: normalizedSignature,
		// 保存订单来源。
		Source: source,
		// 默认新订单为 open，等待执行器扫描。
		Status: "open",
		// 默认状态原因为空，只有异常或事件回写时才填写。
		StatusReason: "",
		// 保存创建时的预估 gas 使用量。
		EstimatedGasUsed: estimatedGasUsed,
		// 保存创建时报价使用的 gasPrice。
		GasPriceAtQuote: gasPriceAtQuote,
		// 保存执行费报价时间。
		FeeQuoteAt: now,
		// 保存创建时计算出的最低所需执行费。
		LastRequiredExecutorFee: lastRequiredExecutorFee,
		// 保存最近一次执行费检查时间。
		LastFeeCheckAt: now,
		// 保存最近一次执行条件检查时间。
		LastExecutionCheckAt: now,
		// 保存创建阶段发现的阻塞原因。
		LastBlockReason: lastBlockReason,
		// 新订单尚未成交，成交输出数量初始化为 0。
		SettledAmountOut: "0",
		// 新订单尚未成交，实际扣除执行费初始化为 0。
		SettledExecutorFee: "0",
		// 新订单尚未提交执行交易，提交交易哈希为空。
		SubmittedTxHash: "",
		// 新订单尚未成交，成交交易哈希为空。
		ExecutedTxHash: "",
		// 新订单尚未撤单，撤单交易哈希为空。
		CancelledTxHash: "",
		// 新订单尚未检查到链上区块，最后检查区块初始化为 0。
		LastCheckedBlock: 0,
		// 保存创建时间。
		CreatedAt: now,
		// 保存更新时间，创建时与创建时间一致。
		UpdatedAt: now,
	}

	// 将构造好的订单写入数据库。
	if err := orderRepo.Create(l.ctx, order); err != nil {
		// 如果并发请求导致唯一键冲突，把它按订单已存在处理。
		if repo.IsDuplicateKeyError(err) {
			// 返回业务失败提示，避免把并发重复提交误报为系统异常。
			return &executor.CreateOrderResponse{
				// 这里只返回 notice，因为并发场景下当前写入对象不一定是最终库内对象。
				Notice: failureNotice(
					// 业务错误码：订单已存在。
					"ORDER_ALREADY_EXISTS",
					// 简短错误信息。
					"order already exists",
					// 给调用方的处理建议。
					"reuse the stored order instead of creating the same signed order again",
					// 当前失败发生在查重阶段。
					"dedupe_check",
				),
			}, nil
		}
		// 记录订单创建失败的内部错误。
		l.Errorf("create order failed: %v", err)
		// 对外返回内部错误，避免暴露数据库实现细节。
		return nil, status.Error(codes.Internal, "create order failed")
	}

	// 订单创建成功后，返回订单详情和基于状态生成的业务提示。
	return &executor.CreateOrderResponse{
		// 把数据库领域模型转换成 RPC 响应结构。
		Order: orderToResponse(order),
		// 根据订单当前状态生成创建结果提示。
		Notice: buildCreateOrderNotice(order),
	}, nil
}
