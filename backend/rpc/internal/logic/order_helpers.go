package logic

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"strings"

	"fluxswap-backend/internal/app"
	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"

	"github.com/ethereum/go-ethereum/common"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

var (
	addressPattern   = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
	hashPattern      = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)
	signaturePattern = regexp.MustCompile(`^0x[0-9a-fA-F]{130}$`)
	uintPattern      = regexp.MustCompile(`^[0-9]+$`)
)

// buildNotice 构造统一的 RPC 响应提示结构，供前端直接展示。
func buildNotice(success bool, code string, message string, hint string, stage string) *executor.ResponseNotice {
	return &executor.ResponseNotice{
		Success: success,
		Code:    strings.TrimSpace(code),
		Message: strings.TrimSpace(message),
		Hint:    strings.TrimSpace(hint),
		Stage:   strings.TrimSpace(stage),
	}
}

// successNotice 构造成功提示。
func successNotice(code string, message string, hint string, stage string) *executor.ResponseNotice {
	return buildNotice(true, code, message, hint, stage)
}

// failureNotice 构造失败提示。
func failureNotice(code string, message string, hint string, stage string) *executor.ResponseNotice {
	return buildNotice(false, code, message, hint, stage)
}

// orderToResponse 把领域层订单转换成 RPC 层返回结构。
func orderToResponse(order *domain.Order) *executor.GetOrderResponse {
	payload := app.OrderToResponse(order)
	if payload == nil {
		return nil
	}

	return &executor.GetOrderResponse{
		Id:                         payload.ID,
		ChainId:                    payload.ChainID,
		SettlementAddress:          payload.SettlementAddress,
		OrderHash:                  payload.OrderHash,
		Maker:                      payload.Maker,
		InputToken:                 payload.InputToken,
		OutputToken:                payload.OutputToken,
		AmountIn:                   payload.AmountIn,
		MinAmountOut:               payload.MinAmountOut,
		MaxExecutorRewardBps:       payload.ExecutorFee,
		ExecutorFeeToken:           payload.ExecutorFeeToken,
		TriggerPriceX18:            payload.TriggerPriceX18,
		Expiry:                     payload.Expiry,
		Nonce:                      payload.Nonce,
		Recipient:                  payload.Recipient,
		Source:                     payload.Source,
		Status:                     payload.Status,
		StatusReason:               payload.StatusReason,
		EstimatedGasUsed:           payload.EstimatedGasUsed,
		GasPriceAtQuote:            payload.GasPriceAtQuote,
		RewardQuoteAt:              payload.FeeQuoteAt,
		LastRequiredExecutorReward: payload.LastRequiredExecutorFee,
		LastRewardCheckAt:          payload.LastFeeCheckAt,
		LastExecutionCheckAt:       payload.LastExecutionCheckAt,
		LastBlockReason:            payload.LastBlockReason,
		SettledAmountOut:           payload.SettledAmountOut,
		SettledExecutorReward:      payload.SettledExecutorFee,
		SubmittedTxHash:            payload.SubmittedTxHash,
		ExecutedTxHash:             payload.ExecutedTxHash,
		CancelledTxHash:            payload.CancelledTxHash,
		LastCheckedBlock:           payload.LastCheckedBlock,
		CreatedAt:                  payload.CreatedAt,
		UpdatedAt:                  payload.UpdatedAt,
		Notice:                     nil,
	}
}

// buildCreateOrderNotice 根据订单最终落库状态生成更贴近前端的创建结果提示。
func buildCreateOrderNotice(order *domain.Order) *executor.ResponseNotice {
	if order == nil {
		return successNotice(
			"ORDER_CREATED",
			"order stored successfully",
			"the order is now available for executor scanning and later settlement",
			"create_order",
		)
	}

	readinessNotice := buildOrderStatusNotice(order)
	if readinessNotice != nil {
		code := strings.TrimSpace(readinessNotice.Code)
		if code != "" && code != "ORDER_OPEN" {
			return readinessNotice
		}
	}

	return successNotice(
		"ORDER_CREATED",
		"order stored successfully",
		"the order is now available for executor scanning and later settlement",
		"create_order",
	)
}

// buildOrderStatusNotice 根据订单状态与阻塞原因生成可直接展示的 notice。
func buildOrderStatusNotice(order *domain.Order) *executor.ResponseNotice {
	if order == nil {
		return successNotice(
			"ORDER_LOADED",
			"订单查询成功",
			"当前订单详情已加载完成。",
			"query",
		)
	}

	status := strings.ToLower(strings.TrimSpace(order.Status))
	statusReason := strings.ToLower(strings.TrimSpace(order.StatusReason))
	lastBlockReason := strings.ToLower(strings.TrimSpace(order.LastBlockReason))

	switch status {
	case "executed":
		if statusReason == "confirmed_by_chain_state" {
			return successNotice(
				"ORDER_EXECUTED",
				"订单已按链上状态确认执行",
				"当前已确认订单终态，但成交数量和实际执行费可能仍在等待事件明细回写；前端应优先展示 executed 状态与交易哈希，不要假设成交明细已经完整。",
				"finalized",
			)
		}
		return successNotice(
			"ORDER_EXECUTED",
			"订单已执行完成",
			"可直接展示成交数量、成交交易哈希和最终执行费。",
			"finalized",
		)
	case "cancelled":
		if statusReason == "confirmed_by_chain_state" {
			return successNotice(
				"ORDER_CANCELLED",
				"订单已按链上状态确认撤销",
				"当前已确认订单终态，但撤单交易哈希可能仍在等待索引补齐；前端应优先展示 cancelled 状态，不要假设 cancelledTxHash 一定存在。",
				"finalized",
			)
		}
		return successNotice(
			"ORDER_CANCELLED",
			"订单已撤销",
			"如需展示撤单进度，可优先使用 cancelledTxHash。",
			"finalized",
		)
	case "expired":
		return successNotice(
			"ORDER_EXPIRED",
			"订单已过期",
			"该订单不会再被执行；如需继续交易，请重新创建订单。",
			"finalized",
		)
	case "submitting_execute":
		return successNotice(
			"ORDER_SUBMITTING_EXECUTION",
			"订单正在提交执行交易",
			"执行器已领取该订单，正在向链上发送执行交易，请稍后刷新。",
			"execution",
		)
	case "pending_execute":
		return buildPendingExecutionNotice(statusReason)
	case "pending_cancel":
		return buildPendingCancelNotice(statusReason)
	case "open":
		return buildOpenOrderNotice(statusReason, lastBlockReason)
	default:
		return successNotice(
			"ORDER_LOADED",
			"订单查询成功",
			"请结合 status、statusReason 和交易哈希字段判断当前进度。",
			"query",
		)
	}
}

// buildPendingExecutionNotice 为 pending_execute 场景生成分阶段提示。
func buildPendingExecutionNotice(statusReason string) *executor.ResponseNotice {
	switch statusReason {
	case "submitted_to_chain", "tx_pending_on_chain":
		return successNotice(
			"ORDER_PENDING_EXECUTION",
			"执行交易已提交，等待链上确认",
			"可展示 submittedTxHash，并提示用户等待区块确认。",
			"execution",
		)
	case "tx_confirmed_waiting_for_indexer":
		return successNotice(
			"ORDER_EXECUTION_CONFIRMING",
			"执行交易已确认，等待索引回写",
			"链上交易已成功，订单状态会在索引同步后切换为 executed。",
			"execution",
		)
	default:
		return successNotice(
			"ORDER_PENDING_EXECUTION",
			"订单执行处理中",
			"可结合 submittedTxHash 和 statusReason 展示当前执行进度。",
			"execution",
		)
	}
}

// buildPendingCancelNotice 为 pending_cancel 场景生成分阶段提示。
func buildPendingCancelNotice(statusReason string) *executor.ResponseNotice {
	switch statusReason {
	case "cancel_tx_submitted_by_user", "cancel_tx_pending_on_chain":
		return successNotice(
			"ORDER_PENDING_CANCELLATION",
			"撤单交易已提交，等待链上确认",
			"可展示 cancelledTxHash，并提示用户等待链上确认。",
			"cancel",
		)
	case "cancel_tx_confirmed_waiting_for_indexer":
		return successNotice(
			"ORDER_CANCELLATION_CONFIRMING",
			"撤单交易已确认，等待索引回写",
			"链上撤单已成功，订单状态会在索引同步后切换为 cancelled。",
			"cancel",
		)
	default:
		return successNotice(
			"ORDER_PENDING_CANCELLATION",
			"订单撤单处理中",
			"可结合 cancelledTxHash 和 statusReason 展示当前撤单进度。",
			"cancel",
		)
	}
}

// buildOpenOrderNotice 为 open 状态生成“为什么还没执行”的解释性提示。
func buildOpenOrderNotice(statusReason string, lastBlockReason string) *executor.ResponseNotice {
	switch {
	case statusReason == "insufficient_balance" || strings.HasPrefix(lastBlockReason, "insufficient_balance_required_"):
		return successNotice(
			"ORDER_BLOCKED_BY_BALANCE",
			"订单暂不可执行，输入代币余额不足",
			"请补足 maker 钱包中的输入代币余额，订单会在后续检查中重新进入可执行判断。",
			"readiness",
		)
	case statusReason == "insufficient_allowance" || strings.HasPrefix(lastBlockReason, "insufficient_allowance_required_"):
		return successNotice(
			"ORDER_BLOCKED_BY_ALLOWANCE",
			"订单暂不可执行，授权额度不足",
			"请补足 maker 对结算合约的授权额度，订单会在后续检查中重新进入可执行判断。",
			"readiness",
		)
	case statusReason == "executor_reward_insufficient_for_current_gas" ||
		strings.HasPrefix(lastBlockReason, "max_executor_reward_"):
		return successNotice(
			"ORDER_BLOCKED_BY_EXECUTOR_REWARD",
			"订单暂不可执行，可分配给执行器的奖励不足",
			"当前成交 surplus 不足以覆盖执行奖励，需要等待价格改善、gas 回落或重新下单。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "pair_not_found"):
		return successNotice(
			"ORDER_BLOCKED_BY_PAIR",
			"订单暂不可执行，当前交易对不存在",
			"请先确认对应的流动性池是否已创建，否则该订单不会被执行。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "price_not_reached"):
		return successNotice(
			"ORDER_BLOCKED_BY_PRICE",
			"订单尚未达到目标价格",
			"当前报价还没有达到触发价格，执行器会继续轮询检查。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "insufficient_output"):
		return successNotice(
			"ORDER_BLOCKED_BY_LIQUIDITY",
			"订单暂不可执行，当前池子输出不足",
			"当前池子深度或报价不足以满足最低成交和执行费要求，请等待流动性恢复或重新下单。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "paused"):
		return successNotice(
			"ORDER_BLOCKED_BY_PROTOCOL_PAUSE",
			"订单暂不可执行，结算合约已暂停",
			"需要等待管理员恢复结算合约。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "executor_not_set"):
		return successNotice(
			"ORDER_BLOCKED_BY_EXECUTOR_POLICY",
			"订单暂不可执行，受限执行器尚未配置",
			"当前结算合约已启用受限执行模式，但未配置可用执行器地址。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "nonce_invalidated"):
		return successNotice(
			"ORDER_ALREADY_INVALIDATED",
			"订单已作废，当前不可再执行",
			"该订单对应的 nonce 已在链上失效，请使用最新订单数据。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "order_already_executed"):
		return successNotice(
			"ORDER_ALREADY_EXECUTED_ON_CHAIN",
			"订单已在链上成交",
			"当前链下状态尚未同步完成，请稍后刷新订单或等待索引回写。",
			"readiness",
		)
	case hasReadinessReason(statusReason, lastBlockReason, "order_expired"):
		return successNotice(
			"ORDER_EXPIRED",
			"订单已过期",
			"该订单已无法继续执行，请重新创建新订单。",
			"readiness",
		)
	case statusReason == "submitted_tx_missing_from_chain_retryable",
		statusReason == "tx_reverted_retryable",
		statusReason == "submission_interrupted_before_tx_hash",
		statusReason == "cancel_tx_missing_from_chain_retryable",
		statusReason == "cancel_tx_reverted_retryable":
		return successNotice(
			"ORDER_RETRYABLE",
			"订单已回到可重试状态",
			"之前的链上提交未形成最终结果，执行器会继续按 open 状态重新评估该订单。",
			"recovery",
		)
	case strings.HasPrefix(statusReason, "chain_time_unavailable:"),
		strings.HasPrefix(statusReason, "chain_state_check_failed:"),
		strings.HasPrefix(statusReason, "chain_state_inconclusive:"),
		strings.HasPrefix(statusReason, "can_execute_failed:"),
		strings.HasPrefix(statusReason, "funding_check_failed:"),
		strings.HasPrefix(statusReason, "executor_fee_quote_failed:"),
		lastBlockReason == "chain_client_unavailable_at_create",
		strings.HasPrefix(lastBlockReason, "chain_time_unavailable_at_create:"),
		strings.HasPrefix(lastBlockReason, "initial_executor_fee_quote_failed:"):
		return successNotice(
			"ORDER_CHECK_DEGRADED",
			"订单检查暂时降级，等待下一轮重试",
			"当前是执行器读取链上信息失败，订单本身未失效，后续轮询会继续重试。",
			"readiness",
		)
	case strings.HasPrefix(statusReason, "invalid_signature:"):
		return successNotice(
			"ORDER_INVALID_SIGNATURE",
			"订单签名校验失败，当前无法执行",
			"该订单通常无法自动恢复，建议提示用户重新签名并创建新订单。",
			"readiness",
		)
	case strings.HasPrefix(statusReason, "deadline_invalid:"):
		return successNotice(
			"ORDER_INVALID_DEADLINE",
			"订单截止时间已无效，当前无法执行",
			"该订单通常已接近或达到失效边界，建议提示用户重新创建订单。",
			"readiness",
		)
	case strings.HasPrefix(statusReason, "submit_failed:"):
		return successNotice(
			"ORDER_SUBMIT_RETRYABLE",
			"订单提交执行失败，等待下一轮重试",
			"本次执行交易发送失败，但订单仍保持 open，执行器会继续重试。",
			"execution",
		)
	case statusReason == "invalid_nonce_in_order_record":
		return successNotice(
			"ORDER_RECORD_INVALID_NONCE",
			"订单本地记录里的 nonce 异常，当前无法继续处理",
			"这通常表示链下订单数据已损坏，建议重新创建订单或让管理员核对数据库记录。",
			"recovery",
		)
	case strings.HasPrefix(statusReason, "order_payload_invalid:"):
		return successNotice(
			"ORDER_RECORD_INVALID_PAYLOAD",
			"订单本地记录里的订单参数异常，当前无法继续处理",
			"这通常表示链下订单数据与结算合约需要的订单结构不一致，建议重新创建订单或让管理员核对数据库记录。",
			"recovery",
		)
	case statusReason == "invalid_expiry_in_order_record":
		return successNotice(
			"ORDER_RECORD_INVALID_EXPIRY",
			"订单本地记录里的有效期异常，当前无法继续处理",
			"这通常表示链下订单数据已损坏，建议重新创建订单或让管理员核对数据库记录。",
			"recovery",
		)
	case statusReason == "pending_without_valid_tx_hash":
		return successNotice(
			"ORDER_PENDING_TX_LOST",
			"订单曾进入链上等待态，但本地缺少有效交易哈希",
			"系统无法继续跟踪原交易，已将订单回退到 open 并等待重新评估；前端不要把它当作普通新建订单。",
			"recovery",
		)
	case statusReason == "", statusReason == "open":
		return successNotice(
			"ORDER_OPEN",
			"订单已创建，等待触发执行",
			"当前订单仍然有效，执行器会继续按价格和资金条件轮询检查。",
			"readiness",
		)
	default:
		return successNotice(
			"ORDER_OPEN",
			"订单当前处于开放状态",
			"请结合 statusReason 和 lastBlockReason 展示具体执行阻塞原因。",
			"readiness",
		)
	}
}

// hasReadinessReason 判断 statusReason / lastBlockReason 是否命中给定阻塞原因集合。
func hasReadinessReason(statusReason string, lastBlockReason string, reasons ...string) bool {
	normalizedStatusReason := strings.ToLower(strings.TrimSpace(statusReason))
	normalizedLastBlockReason := strings.ToLower(strings.TrimSpace(lastBlockReason))

	for _, reason := range reasons {
		normalizedReason := strings.ToLower(strings.TrimSpace(reason))
		if normalizedReason == "" {
			continue
		}
		if normalizedStatusReason == normalizedReason || normalizedLastBlockReason == normalizedReason {
			return true
		}
	}

	return false
}

// normalizeAddress 统一地址字符串格式，便于查库和比较。
func normalizeAddress(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// normalizeHash 统一哈希字符串格式。
func normalizeHash(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// normalizeHex 统一十六进制字符串格式。
func normalizeHex(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

// isAddress 做轻量地址格式校验。
func isAddress(value string) bool {
	return addressPattern.MatchString(normalizeAddress(value))
}

// isHash 做 bytes32 哈希格式校验。
func isHash(value string) bool {
	return hashPattern.MatchString(normalizeHash(value))
}

// isSignature 做 65 字节签名格式校验。
func isSignature(value string) bool {
	return signaturePattern.MatchString(normalizeHex(value))
}

// isPositiveUint 校验正整数字符串。
func isPositiveUint(value string) bool {
	trimmed := strings.TrimSpace(value)
	return uintPattern.MatchString(trimmed) && trimmed != "0"
}

// isUint 校验无符号整数字符串。
func isUint(value string) bool {
	return uintPattern.MatchString(strings.TrimSpace(value))
}

// mustBigInt 把十进制字符串转成大整数；失败时回退为 0。
func mustBigInt(value string) *big.Int {
	parsed, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok {
		return big.NewInt(0)
	}
	return parsed
}

// parseUintStrict 严格解析仓库层返回的十进制字符串，失败时返回可映射到 RPC 的错误。
func parseUintStrict(value string, field string) (*big.Int, error) {
	parsed, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok || parsed.Sign() < 0 {
		return nil, status.Errorf(codes.FailedPrecondition, "%s is invalid in stored order", field)
	}
	return parsed, nil
}

// buildSettlementOrderFromRequest 把 CreateOrder 请求转换成链客户端可复用的订单结构。
func buildSettlementOrderFromRequest(req *executor.CreateOrderRequest) (chain.SettlementOrder, error) {
	if req == nil {
		return chain.SettlementOrder{}, errors.New("request is required")
	}
	if !isAddress(req.GetMaker()) {
		return chain.SettlementOrder{}, errors.New("maker must be a valid address")
	}
	if !isAddress(req.GetInputToken()) {
		return chain.SettlementOrder{}, errors.New("inputToken must be a valid address")
	}
	if common.HexToAddress(normalizeAddress(req.GetInputToken())) == (common.Address{}) {
		return chain.SettlementOrder{}, errors.New("inputToken must be an ERC20 token address")
	}
	if !isAddress(req.GetOutputToken()) {
		return chain.SettlementOrder{}, errors.New("outputToken must be a valid address")
	}
	if !isAddress(req.GetRecipient()) {
		return chain.SettlementOrder{}, errors.New("recipient must be a valid address")
	}

	return chain.SettlementOrder{
		Maker:                common.HexToAddress(normalizeAddress(req.GetMaker())),
		InputToken:           common.HexToAddress(normalizeAddress(req.GetInputToken())),
		OutputToken:          common.HexToAddress(normalizeAddress(req.GetOutputToken())),
		AmountIn:             mustBigInt(req.GetAmountIn()),
		MinAmountOut:         mustBigInt(req.GetMinAmountOut()),
		MaxExecutorRewardBps: mustBigInt(req.GetMaxExecutorRewardBps()),
		TriggerPriceX18:      mustBigInt(req.GetTriggerPriceX18()),
		Expiry:               mustBigInt(req.GetExpiry()),
		Nonce:                mustBigInt(req.GetNonce()),
		Recipient:            common.HexToAddress(normalizeAddress(req.GetRecipient())),
	}, nil
}

// cancelOrderByRequest 完成撤单前的单笔订单校验与装载。
func cancelOrderByRequest(
	ctx context.Context,
	orderRepo *repo.OrderRepository,
	req *executor.CancelOrderItem,
) (*domain.Order, error) {
	if req.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if !isAddress(req.GetSettlementAddress()) {
		return nil, status.Error(codes.InvalidArgument, "settlementAddress must be a valid address")
	}
	if !isHash(req.GetOrderHash()) {
		return nil, status.Error(codes.InvalidArgument, "orderHash must be a valid bytes32 hex string")
	}
	if !isAddress(req.GetMaker()) {
		return nil, status.Error(codes.InvalidArgument, "maker must be a valid address")
	}
	if orderRepo == nil {
		return nil, status.Error(codes.FailedPrecondition, "order repository is not initialized")
	}

	order, err := orderRepo.GetByOrderHash(
		ctx,
		req.GetChainId(),
		req.GetSettlementAddress(),
		req.GetOrderHash(),
	)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Error(codes.NotFound, "order not found")
		}
		return nil, status.Error(codes.Internal, "query order failed")
	}

	if normalizeAddress(order.Maker) != normalizeAddress(req.GetMaker()) {
		return nil, status.Error(codes.PermissionDenied, "maker does not match order owner")
	}

	switch strings.ToLower(strings.TrimSpace(order.Status)) {
	case "submitting_execute":
		return nil, status.Error(codes.FailedPrecondition, "order submission is in progress")
	case "pending_execute":
		return nil, status.Error(codes.FailedPrecondition, "order execution is pending on chain")
	case "executed":
		return nil, status.Error(codes.FailedPrecondition, "executed order cannot be cancelled")
	case "cancelled":
		return nil, status.Error(codes.AlreadyExists, "order already cancelled")
	case "expired":
		return nil, status.Error(codes.FailedPrecondition, "expired order cannot be cancelled")
	}

	return order, nil
}

// mapStatusError 把内部错误映射成更适合前端展示的 code/message/hint/stage。
func mapStatusError(err error) (string, string, string, string) {
	if err == nil {
		return "OK", "", "", ""
	}

	text := strings.TrimSpace(err.Error())
	switch {
	case strings.Contains(text, "InvalidArgument"):
		return "INVALID_ARGUMENT", "请求参数不合法", "请检查地址、订单哈希和数值字段后重试。", "request_validation"
	case strings.Contains(text, "FailedPrecondition"):
		if strings.Contains(text, "order submission is in progress") {
			return "ORDER_SUBMISSION_IN_PROGRESS", "订单正在提交执行，暂时不能登记撤单", "请稍后刷新订单状态，等待进入待执行或最终成交状态。", "business_validation"
		}
		if strings.Contains(text, "order execution is pending on chain") {
			return "ORDER_EXECUTION_PENDING", "订单执行交易已在链上等待确认", "当前已不能再登记撤单，请先等待执行交易落最终状态。", "business_validation"
		}
		if strings.Contains(text, "executed order cannot be cancelled") {
			return "ORDER_ALREADY_EXECUTED", "订单无法撤销", "该订单可能已经先一步成交，请刷新状态确认最终结果。", "business_validation"
		}
		if strings.Contains(text, "expired order cannot be cancelled") {
			return "ORDER_ALREADY_EXPIRED", "订单已过期，无法撤销", "该订单已经失效，无需重复撤销。", "business_validation"
		}
		if strings.Contains(text, "database is not initialized") {
			return "DATABASE_UNAVAILABLE", "数据库尚未初始化", "请先检查数据库连接和迁移状态。", "dependency_check"
		}
		return "FAILED_PRECONDITION", "当前状态不允许执行该操作", "请刷新订单状态后再决定是否重试。", "business_validation"
	case strings.Contains(text, "PermissionDenied"):
		return "MAKER_MISMATCH", "当前地址不是该订单的所有者", "请确认使用的是创建该订单的钱包地址。", "permission_check"
	case strings.Contains(text, "NotFound"):
		return "ORDER_NOT_FOUND", "未找到对应订单", "请确认订单哈希、链 ID 和结算合约地址是否正确。", "query"
	case strings.Contains(text, "AlreadyExists"):
		if strings.Contains(text, "order already cancelled") {
			return "ORDER_ALREADY_CANCELLED", "订单已经撤销", "这笔订单已经是撤销状态，无需重复提交。", "business_validation"
		}
		if strings.Contains(text, "order already exists") {
			return "ORDER_ALREADY_EXISTS", "订单已经存在", "请不要重复创建同一笔签名订单。", "dedupe_check"
		}
		return "ALREADY_EXISTS", "数据已存在", "请刷新当前状态后再继续。", "dedupe_check"
	case strings.Contains(text, "Internal"):
		if strings.Contains(text, "query order failed") {
			return "QUERY_FAILED", "查询订单失败", "请稍后重试，或检查数据库服务是否正常。", "query"
		}
		if strings.Contains(text, "create order failed") {
			return "CREATE_ORDER_FAILED", "创建订单失败", "请稍后重试，如持续失败请检查数据库日志。", "write"
		}
		if strings.Contains(text, "update order failed") {
			return "UPDATE_ORDER_FAILED", "更新订单失败", "请稍后重试，如持续失败请检查数据库日志。", "write"
		}
		if strings.Contains(text, "apply order event failed") {
			return "APPLY_EVENT_FAILED", "回写订单事件失败", "请稍后重试，并检查事件是否已被重复处理。", "event_apply"
		}
		return "INTERNAL_ERROR", "服务内部处理失败", "请稍后重试。", "internal"
	default:
		return "UNKNOWN_ERROR", "操作失败", "请刷新状态后重试。", "unknown"
	}
}
