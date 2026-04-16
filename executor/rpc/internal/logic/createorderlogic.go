package logic

import (
	"context"
	"errors"
	"math/big"
	"strings"
	"time"

	"fluxswap-executor/internal/domain"
	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/svc"

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

func NewCreateOrderLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CreateOrderLogic {
	return &CreateOrderLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *CreateOrderLogic) CreateOrder(in *executor.CreateOrderRequest) (*executor.CreateOrderResponse, error) {
	if in.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if !isAddress(in.GetSettlementAddress()) {
		return nil, status.Error(codes.InvalidArgument, "settlementAddress must be a valid address")
	}
	if !isHash(in.GetOrderHash()) {
		return nil, status.Error(codes.InvalidArgument, "orderHash must be a valid bytes32 hex string")
	}
	if !isAddress(in.GetMaker()) {
		return nil, status.Error(codes.InvalidArgument, "maker must be a valid address")
	}
	if !isAddress(in.GetInputToken()) {
		return nil, status.Error(codes.InvalidArgument, "inputToken must be a valid address")
	}
	if !isAddress(in.GetOutputToken()) {
		return nil, status.Error(codes.InvalidArgument, "outputToken must be a valid address")
	}
	if normalizeAddress(in.GetInputToken()) == normalizeAddress(in.GetOutputToken()) {
		return nil, status.Error(codes.InvalidArgument, "inputToken and outputToken must be different")
	}
	if !isPositiveUint(in.GetAmountIn()) {
		return nil, status.Error(codes.InvalidArgument, "amountIn must be a positive integer string")
	}
	if !isPositiveUint(in.GetMinAmountOut()) {
		return nil, status.Error(codes.InvalidArgument, "minAmountOut must be a positive integer string")
	}
	if !isUint(in.GetExecutorFee()) {
		return nil, status.Error(codes.InvalidArgument, "executorFee must be an unsigned integer string")
	}
	if !isPositiveUint(in.GetTriggerPriceX18()) {
		return nil, status.Error(codes.InvalidArgument, "triggerPriceX18 must be a positive integer string")
	}
	if !isPositiveUint(in.GetExpiry()) {
		return nil, status.Error(codes.InvalidArgument, "expiry must be a positive integer string")
	}
	if !isUint(in.GetNonce()) {
		return nil, status.Error(codes.InvalidArgument, "nonce must be an unsigned integer string")
	}
	if !isAddress(in.GetRecipient()) {
		return nil, status.Error(codes.InvalidArgument, "recipient must be a valid address")
	}
	if !isSignature(in.GetSignature()) {
		return nil, status.Error(codes.InvalidArgument, "signature must be a valid 65-byte hex signature")
	}
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}

	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	existingOrder, err := orderRepo.GetByOrderHash(
		l.ctx,
		in.GetChainId(),
		in.GetSettlementAddress(),
		in.GetOrderHash(),
	)
	if err == nil {
		return &executor.CreateOrderResponse{
			Order: orderToResponse(existingOrder),
			Notice: failureNotice(
				"ORDER_ALREADY_EXISTS",
				"订单已存在，未重复创建",
				"请直接复用当前订单记录，不要重复提交同一笔签名订单。",
				"dedupe_check",
			),
		}, status.Error(codes.AlreadyExists, "order already exists")
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		l.Errorf("query existing order failed: %v", err)
		return nil, status.Error(codes.Internal, "query existing order failed")
	}

	source := strings.TrimSpace(in.GetSource())
	if source == "" {
		source = "rpc"
	}

	now := time.Now().UTC()
	executorFee := strings.TrimSpace(in.GetExecutorFee())
	if executorFee == "" {
		executorFee = "0"
	}

	estimatedGasUsed := "0"
	gasPriceAtQuote := "0"
	lastRequiredExecutorFee := "0"
	lastBlockReason := ""

	if chainClient := l.svcCtx.LookupChainClient(in.GetChainId(), in.GetSettlementAddress()); chainClient != nil {
		requiredExecutorFee, gasPrice, quoteErr := chainClient.SuggestExecutorFee(
			l.ctx,
			common.HexToAddress(normalizeAddress(in.GetOutputToken())),
			l.svcCtx.Config.Worker.ExecutorEstimatedGasUsed,
			l.svcCtx.Config.Worker.ExecutorFeeSafetyBps,
		)
		if quoteErr != nil {
			lastBlockReason = strings.TrimSpace("initial_executor_fee_quote_failed: " + quoteErr.Error())
		} else {
			estimatedGasUsed = new(big.Int).SetUint64(l.svcCtx.Config.Worker.ExecutorEstimatedGasUsed).String()
			gasPriceAtQuote = gasPrice.String()
			lastRequiredExecutorFee = requiredExecutorFee.String()
			if mustBigInt(executorFee).Cmp(requiredExecutorFee) < 0 {
				lastBlockReason = "signed_executor_fee_below_initial_required"
			}
		}
	}

	order := &domain.Order{
		ChainID:           in.GetChainId(),
		SettlementAddress: normalizeAddress(in.GetSettlementAddress()),
		OrderHash:         normalizeHash(in.GetOrderHash()),
		Maker:             normalizeAddress(in.GetMaker()),
		InputToken:        normalizeAddress(in.GetInputToken()),
		OutputToken:       normalizeAddress(in.GetOutputToken()),
		AmountIn:          strings.TrimSpace(in.GetAmountIn()),
		MinAmountOut:      strings.TrimSpace(in.GetMinAmountOut()),
		ExecutorFee:       executorFee,
		ExecutorFeeToken:  normalizeAddress(in.GetOutputToken()),
		TriggerPriceX18:   strings.TrimSpace(in.GetTriggerPriceX18()),
		Expiry:            strings.TrimSpace(in.GetExpiry()),
		Nonce:             strings.TrimSpace(in.GetNonce()),
		Recipient:         normalizeAddress(in.GetRecipient()),
		Signature:         normalizeHex(in.GetSignature()),
		Source:            source,
		Status:            "open",
		StatusReason:      "",
		EstimatedGasUsed:  estimatedGasUsed,
		GasPriceAtQuote:   gasPriceAtQuote,
		FeeQuoteAt:        now,
		LastRequiredExecutorFee: lastRequiredExecutorFee,
		LastFeeCheckAt:    now,
		LastExecutionCheckAt: now,
		LastBlockReason:   lastBlockReason,
		SettledAmountOut:  "0",
		SettledExecutorFee: "0",
		SubmittedTxHash:   "",
		ExecutedTxHash:    "",
		CancelledTxHash:   "",
		LastCheckedBlock:  0,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if err := orderRepo.Create(l.ctx, order); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, status.Error(codes.AlreadyExists, "order already exists")
		}
		l.Errorf("create order failed: %v", err)
		return nil, status.Error(codes.Internal, "create order failed")
	}

	return &executor.CreateOrderResponse{
		Order: orderToResponse(order),
		Notice: successNotice(
			"ORDER_CREATED",
			"订单已写入系统，等待执行器检查价格条件",
			"当前订单仍是链下 open 状态，到价后会由执行器发起链上执行。",
			"create_order",
		),
	}, nil
}
