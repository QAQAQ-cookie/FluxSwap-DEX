package logic

import (
	"context"
	"errors"
	"math/big"
	"regexp"
	"strings"

	"fluxswap-executor/internal/app"
	"fluxswap-executor/internal/domain"
	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"

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

func buildNotice(success bool, code string, message string, hint string, stage string) *executor.ResponseNotice {
	return &executor.ResponseNotice{
		Success: success,
		Code:    strings.TrimSpace(code),
		Message: strings.TrimSpace(message),
		Hint:    strings.TrimSpace(hint),
		Stage:   strings.TrimSpace(stage),
	}
}

func successNotice(code string, message string, hint string, stage string) *executor.ResponseNotice {
	return buildNotice(true, code, message, hint, stage)
}

func failureNotice(code string, message string, hint string, stage string) *executor.ResponseNotice {
	return buildNotice(false, code, message, hint, stage)
}

func orderToResponse(order *domain.Order) *executor.GetOrderResponse {
	payload := app.OrderToResponse(order)
	if payload == nil {
		return nil
	}

	return &executor.GetOrderResponse{
		Id:                payload.ID,
		ChainId:           payload.ChainID,
		SettlementAddress: payload.SettlementAddress,
		OrderHash:         payload.OrderHash,
		Maker:             payload.Maker,
		InputToken:        payload.InputToken,
		OutputToken:       payload.OutputToken,
		AmountIn:          payload.AmountIn,
		MinAmountOut:      payload.MinAmountOut,
		ExecutorFee:       payload.ExecutorFee,
		ExecutorFeeToken:  payload.ExecutorFeeToken,
		TriggerPriceX18:   payload.TriggerPriceX18,
		Expiry:            payload.Expiry,
		Nonce:             payload.Nonce,
		Recipient:         payload.Recipient,
		Source:            payload.Source,
		Status:            payload.Status,
		StatusReason:      payload.StatusReason,
		EstimatedGasUsed:  payload.EstimatedGasUsed,
		GasPriceAtQuote:   payload.GasPriceAtQuote,
		FeeQuoteAt:        payload.FeeQuoteAt,
		LastRequiredExecutorFee: payload.LastRequiredExecutorFee,
		LastFeeCheckAt:    payload.LastFeeCheckAt,
		LastExecutionCheckAt: payload.LastExecutionCheckAt,
		LastBlockReason:   payload.LastBlockReason,
		SettledAmountOut:  payload.SettledAmountOut,
		SettledExecutorFee: payload.SettledExecutorFee,
		SubmittedTxHash:   payload.SubmittedTxHash,
		ExecutedTxHash:    payload.ExecutedTxHash,
		CancelledTxHash:   payload.CancelledTxHash,
		LastCheckedBlock:  payload.LastCheckedBlock,
		CreatedAt:         payload.CreatedAt,
		UpdatedAt:         payload.UpdatedAt,
		Notice:            nil,
	}
}

func normalizeAddress(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeHash(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeHex(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func isAddress(value string) bool {
	return addressPattern.MatchString(normalizeAddress(value))
}

func isHash(value string) bool {
	return hashPattern.MatchString(normalizeHash(value))
}

func isSignature(value string) bool {
	return signaturePattern.MatchString(normalizeHex(value))
}

func isPositiveUint(value string) bool {
	trimmed := strings.TrimSpace(value)
	return uintPattern.MatchString(trimmed) && trimmed != "0"
}

func isUint(value string) bool {
	return uintPattern.MatchString(strings.TrimSpace(value))
}

func mustBigInt(value string) *big.Int {
	parsed, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok {
		return big.NewInt(0)
	}
	return parsed
}

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
	case "executed":
		return nil, status.Error(codes.FailedPrecondition, "executed order cannot be cancelled")
	case "cancelled":
		return nil, status.Error(codes.AlreadyExists, "order already cancelled")
	case "expired":
		return nil, status.Error(codes.FailedPrecondition, "expired order cannot be cancelled")
	}

	return order, nil
}

func mapStatusError(err error) (string, string, string, string) {
	if err == nil {
		return "OK", "", "", ""
	}

	text := strings.TrimSpace(err.Error())
	switch {
	case strings.Contains(text, "InvalidArgument"):
		return "INVALID_ARGUMENT", "请求参数不合法", "请检查地址、订单哈希和数值字段后重试。", "request_validation"
	case strings.Contains(text, "FailedPrecondition"):
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
			return "CREATE_ORDER_FAILED", "创建订单失败", "请稍后重试，若持续失败请检查数据库日志。", "write"
		}
		if strings.Contains(text, "update order failed") {
			return "UPDATE_ORDER_FAILED", "更新订单失败", "请稍后重试，若持续失败请检查数据库日志。", "write"
		}
		if strings.Contains(text, "apply order event failed") {
			return "APPLY_EVENT_FAILED", "回写订单事件失败", "请稍后重试，并检查事件是否已被重复处理。", "event_apply"
		}
		return "INTERNAL_ERROR", "服务内部处理失败", "请稍后重试。", "internal"
	default:
		return "UNKNOWN_ERROR", "操作失败", "请刷新状态后重试。", "unknown"
	}
}
