package logic

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"fluxswap-executor/internal/chain"
	"fluxswap-executor/internal/domain"
	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CancelOrdersLogic 统一处理撤单请求，并将 nonce 失效交易提交到链上。
type CancelOrdersLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewCancelOrdersLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CancelOrdersLogic {
	return &CancelOrdersLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *CancelOrdersLogic) CancelOrders(in *executor.CancelOrdersRequest) (*executor.CancelOrdersResponse, error) {
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}
	if len(in.GetOrders()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "orders must not be empty")
	}

	deadline, err := chain.BuildSafeDeadline(in.GetDeadline())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if !chain.DeadlineAfterNow(deadline) {
		return nil, status.Error(codes.InvalidArgument, "deadline must be greater than current unix time")
	}

	cancelSignature, err := chain.DecodeHexSignature(in.GetCancelSignature())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	results := make([]*executor.CancelOrdersResult, 0, len(in.GetOrders()))
	cancelTargets := make([]*domain.Order, 0, len(in.GetOrders()))
	nonces := make([]*big.Int, 0, len(in.GetOrders()))

	var maker string
	var settlementAddress string
	var chainID int64
	for _, item := range in.GetOrders() {
		result := &executor.CancelOrdersResult{
			ChainId:           item.GetChainId(),
			SettlementAddress: normalizeAddress(item.GetSettlementAddress()),
			OrderHash:         normalizeHash(item.GetOrderHash()),
			Cancelled:         false,
			Error:             "",
			Code:              "",
			Message:           "",
			Hint:              "",
			Stage:             "request_validation",
			Order:             nil,
		}

		order, validateErr := cancelOrderByRequest(l.ctx, orderRepo, item)
		if validateErr != nil {
			result.Error = validateErr.Error()
			result.Code, result.Message, result.Hint, result.Stage = mapStatusError(validateErr)
			results = append(results, result)
			continue
		}

		if maker == "" {
			maker = normalizeAddress(order.Maker)
			chainID = order.ChainID
		} else if maker != normalizeAddress(order.Maker) {
			result.Code = "MAKER_MISMATCH_IN_BATCH"
			result.Message = "批量撤单中的订单必须属于同一个 maker"
			result.Hint = "请按 maker 分批发起撤单请求，并使用对应 maker 的签名。"
			result.Stage = "request_validation"
			results = append(results, result)
			continue
		}

		if settlementAddress == "" {
			settlementAddress = normalizeAddress(order.SettlementAddress)
		} else if settlementAddress != normalizeAddress(order.SettlementAddress) {
			result.Code = "SETTLEMENT_MISMATCH_IN_BATCH"
			result.Message = "批量撤单中的订单必须属于同一个结算合约"
			result.Hint = "请按 settlementAddress 分批发起撤单请求。"
			result.Stage = "request_validation"
			results = append(results, result)
			continue
		}

		nonceValue := mustBigInt(order.Nonce)
		if nonceValue.Sign() < 0 {
			result.Code = "INVALID_NONCE"
			result.Message = "订单 nonce 无效"
			result.Hint = "请确认订单中的 nonce 是正确的无符号整数。"
			result.Stage = "request_validation"
			results = append(results, result)
			continue
		}

		result.Order = orderToResponse(order)
		results = append(results, result)
		cancelTargets = append(cancelTargets, order)
		nonces = append(nonces, nonceValue)
	}

	if len(cancelTargets) == 0 {
		return &executor.CancelOrdersResponse{
			Total:          uint32(len(in.GetOrders())),
			CancelledCount: 0,
			Results:        results,
			Notice: failureNotice(
				"CANCEL_ORDERS_REJECTED",
				"撤单请求未通过校验",
				"请根据 results 中的错误提示修正参数后重试。",
				"request_validation",
			),
		}, nil
	}

	chainClient := l.svcCtx.LookupChainClient(chainID, settlementAddress)
	if chainClient == nil {
		return nil, status.Error(codes.FailedPrecondition, "settlement chain client is not initialized for requested chain")
	}

	txHash, err := chainClient.InvalidateNoncesBySig(l.ctx, maker, nonces, deadline, cancelSignature)
	if err != nil {
		l.Errorf("submit invalidateNoncesBySig failed: %v", err)
		for _, result := range results {
			if result.Order != nil && result.Code == "" {
				result.Error = err.Error()
				result.Code = "CANCEL_TX_SUBMIT_FAILED"
				result.Message = "链上撤单交易提交失败"
				result.Hint = "请检查签名、deadline、执行器私钥与链连接配置，然后重试。"
				result.Stage = "submit_cancel_tx"
			}
		}

		return &executor.CancelOrdersResponse{
			Total:          uint32(len(in.GetOrders())),
			CancelledCount: 0,
			Results:        results,
			Notice: failureNotice(
				"CANCEL_TX_SUBMIT_FAILED",
				"链上撤单交易提交失败",
				"请检查 results 中的错误信息，并确认执行器链配置和签名参数正确。",
				"submit_cancel_tx",
			),
		}, nil
	}

	now := time.Now().UTC()
	cancelledCount := uint32(0)
	for _, order := range cancelTargets {
		order.Status = "pending_cancel"
		order.StatusReason = "cancel_tx_submitted_waiting_for_indexer"
		order.CancelledTxHash = txHash
		order.UpdatedAt = now

		if updateErr := orderRepo.Update(l.ctx, order); updateErr != nil {
			l.Errorf("update pending_cancel order %s failed: %v", order.OrderHash, updateErr)
			continue
		}

		for _, result := range results {
			if normalizeHash(result.GetOrderHash()) != normalizeHash(order.OrderHash) {
				continue
			}
			result.Cancelled = true
			result.Code = "CANCEL_TX_SUBMITTED"
			result.Message = "撤单交易已提交到链上，等待索引器确认最终状态"
			result.Hint = "当链上发出 NonceInvalidated 事件后，订单会被正式回写为 cancelled。"
			result.Stage = "submit_cancel_tx"
			result.Order = orderToResponse(order)
			cancelledCount++
			break
		}
	}

	return &executor.CancelOrdersResponse{
		Total:          uint32(len(in.GetOrders())),
		CancelledCount: cancelledCount,
		Results:        results,
		Notice: successNotice(
			"CANCEL_TX_SUBMITTED",
			"撤单交易已提交",
			fmt.Sprintf("当前批次撤单交易哈希为 %s，后续由 indexer 根据链上事件回写最终 cancelled 状态。", txHash),
			"submit_cancel_tx",
		),
	}, nil
}
