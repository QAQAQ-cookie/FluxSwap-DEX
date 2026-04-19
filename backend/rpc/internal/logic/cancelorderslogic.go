package logic

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CancelOrdersLogic 统一处理撤单登记请求。
//
// 这里不代替用户发链上交易，只登记用户已经提交的 invalidateNoncesBySig 交易哈希。
// 后续由 indexer 事件回写和 worker receipt 对账共同收口最终状态。
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

// CancelOrders 校验批量撤单请求，并把匹配的订单登记到 pending_cancel。
func (l *CancelOrdersLogic) CancelOrders(in *executor.CancelOrdersRequest) (*executor.CancelOrdersResponse, error) {
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}
	if len(in.GetOrders()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "orders must not be empty")
	}
	if !isHash(in.GetCancelTxHash()) {
		return nil, status.Error(codes.InvalidArgument, "cancelTxHash must be a valid transaction hash")
	}

	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	results := make([]*executor.CancelOrdersResult, 0, len(in.GetOrders()))
	cancelTargets := make([]*domain.Order, 0, len(in.GetOrders()))
	seenOrders := make(map[string]struct{})
	cancelTxHash := normalizeHash(in.GetCancelTxHash())
	registeredCount := uint32(0)
	idempotentCount := uint32(0)

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

		orderKey := buildBatchOrderKey(item.GetChainId(), item.GetSettlementAddress(), item.GetOrderHash())
		if _, exists := seenOrders[orderKey]; exists {
			result.Code = "DUPLICATE_ORDER_IN_BATCH"
			result.Message = "批量撤单请求中包含重复订单"
			result.Hint = "请先按订单去重后再提交，避免同一笔订单被重复登记。"
			results = append(results, result)
			continue
		}
		seenOrders[orderKey] = struct{}{}

		order, validateErr := cancelOrderByRequest(l.ctx, orderRepo, item)
		if validateErr != nil {
			result.Error = validateErr.Error()
			result.Code, result.Message, result.Hint, result.Stage = mapStatusError(validateErr)
			results = append(results, result)
			continue
		}

		if normalizeHex(order.Status) == "pending_cancel" {
			if normalizeHash(order.CancelledTxHash) != "" && normalizeHash(order.CancelledTxHash) == cancelTxHash {
				result.Cancelled = true
				result.Code = "CANCEL_TX_ALREADY_REGISTERED"
				result.Message = "当前撤单交易已登记，无需重复提交"
				result.Hint = "系统已记录这笔撤单交易哈希，等待链上确认和状态回写即可。"
				result.Stage = "register_cancel_tx"
				result.Order = orderToResponse(order)
				results = append(results, result)
				idempotentCount++
				continue
			}

			result.Code = "ORDER_CANCELLATION_PENDING"
			result.Message = "订单撤单已在处理中"
			result.Hint = "请先等待当前撤单交易确认或状态回写，不要登记新的撤单交易哈希。"
			result.Stage = "business_validation"
			result.Order = orderToResponse(order)
			results = append(results, result)
			continue
		}

		if maker == "" {
			maker = normalizeAddress(order.Maker)
			chainID = order.ChainID
		} else if chainID != order.ChainID {
			result.Code = "CHAIN_MISMATCH_IN_BATCH"
			result.Message = "批量撤单中的订单必须属于同一条链"
			result.Hint = "请按 chainId 分批提交撤单登记请求。"
			results = append(results, result)
			continue
		} else if maker != normalizeAddress(order.Maker) {
			result.Code = "MAKER_MISMATCH_IN_BATCH"
			result.Message = "批量撤单中的订单必须属于同一 maker"
			result.Hint = "请按 maker 分批提交撤单登记请求。"
			results = append(results, result)
			continue
		}

		if settlementAddress == "" {
			settlementAddress = normalizeAddress(order.SettlementAddress)
		} else if settlementAddress != normalizeAddress(order.SettlementAddress) {
			result.Code = "SETTLEMENT_MISMATCH_IN_BATCH"
			result.Message = "批量撤单中的订单必须属于同一结算合约"
			result.Hint = "请按 settlementAddress 分批提交撤单登记请求。"
			results = append(results, result)
			continue
		}

		result.Order = orderToResponse(order)
		results = append(results, result)
		cancelTargets = append(cancelTargets, order)
	}

	if len(cancelTargets) == 0 {
		if idempotentCount > 0 {
			return &executor.CancelOrdersResponse{
				Total:          uint32(len(in.GetOrders())),
				CancelledCount: idempotentCount,
				Results:        results,
				Notice: successNotice(
					"CANCEL_TX_ALREADY_REGISTERED",
					"撤单交易已登记",
					"当前请求没有写入新的撤单交易哈希，系统会继续等待已登记交易的链上确认。",
					"register_cancel_tx",
				),
			}, nil
		}

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

	now := time.Now().UTC()
	for _, order := range cancelTargets {
		resultKey := buildBatchOrderKey(order.ChainID, order.SettlementAddress, order.OrderHash)
		nonceValue, nonceErr := parseUintStrict(order.Nonce, "nonce")
		if nonceErr != nil {
			if result := findCancelResultByKey(results, resultKey); result != nil {
				result.Error = nonceErr.Error()
				result.Code = "ORDER_NONCE_INVALID_IN_RECORD"
				result.Message = "订单本地记录里的 nonce 无法用于校验撤单交易"
				result.Hint = "这通常表示数据库中的订单记录异常，建议重新创建订单或联系管理员修复数据。"
				result.Stage = "verify_cancel_tx"
			}
			continue
		}

		if _, validateErr := chainClient.ValidateCancelTransaction(l.ctx, cancelTxHash, order.Maker, nonceValue); validateErr != nil {
			if result := findCancelResultByKey(results, resultKey); result != nil {
				result.Error = validateErr.Error()
				result.Stage = "verify_cancel_tx"

				if errors.Is(validateErr, chain.ErrCancelTransactionNotFound) {
					result.Code = "CANCEL_TX_NOT_INDEXED_YET"
					result.Message = "撤单交易暂未被当前 RPC 节点索引到"
					result.Hint = "如果这是刚发出的链上撤单交易，请稍后再次登记同一个 cancelTxHash。"
				} else {
					result.Code = "CANCEL_TX_MISMATCH"
					result.Message = "撤单交易与当前订单不匹配"
					result.Hint = "请确认传入的是这批订单真实对应的 invalidateNoncesBySig 交易哈希。"
				}
			}
			continue
		}

		updated, updateErr := orderRepo.UpdateFieldsIfStatusIn(
			l.ctx,
			order.ChainID,
			order.SettlementAddress,
			order.OrderHash,
			[]string{"open"},
			map[string]interface{}{
				"status":            "pending_cancel",
				"status_reason":     "cancel_tx_submitted_by_user",
				"cancelled_tx_hash": cancelTxHash,
				"updated_at":        now,
			},
		)
		if updateErr != nil {
			l.Errorf("update pending_cancel order %s failed: %v", order.OrderHash, updateErr)
			if result := findCancelResultByKey(results, resultKey); result != nil {
				result.Error = updateErr.Error()
				result.Code = "UPDATE_ORDER_FAILED"
				result.Message = "撤单登记写入失败"
				result.Hint = "请稍后重试，如持续失败请检查数据库状态。"
				result.Stage = "write"
			}
			continue
		}

		if !updated {
			if result := findCancelResultByKey(results, resultKey); result != nil {
				result.Code = "ORDER_STATE_CHANGED"
				result.Message = "订单状态已变化，撤单登记未写入"
				result.Hint = "请先刷新订单状态，再决定是否重新登记撤单。"
				result.Stage = "write"
			}
			continue
		}

		refreshedOrder, refreshErr := orderRepo.GetByOrderHash(l.ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
		if refreshErr == nil {
			order = refreshedOrder
		}

		if result := findCancelResultByKey(results, resultKey); result != nil {
			result.Cancelled = true
			result.Code = "CANCEL_TX_REGISTERED"
			result.Message = "用户已提交撤单交易，等待链上确认"
			result.Hint = "当链上发出 NonceInvalidated 事件后，订单会被正式回写为 cancelled。"
			result.Stage = "register_cancel_tx"
			result.Order = orderToResponse(order)
			registeredCount++
		}
	}

	successfulCount := registeredCount + idempotentCount
	if successfulCount == 0 {
		return &executor.CancelOrdersResponse{
			Total:          uint32(len(in.GetOrders())),
			CancelledCount: 0,
			Results:        results,
			Notice: failureNotice(
				"CANCEL_ORDERS_REJECTED",
				"撤单登记未通过校验",
				"请根据 results 中的错误提示检查 cancelTxHash 与订单是否匹配，然后重新提交。",
				"verify_cancel_tx",
			),
		}, nil
	}

	return &executor.CancelOrdersResponse{
		Total:          uint32(len(in.GetOrders())),
		CancelledCount: successfulCount,
		Results:        results,
		Notice: successNotice(
			"CANCEL_TX_REGISTERED",
			"撤单交易已登记",
			"当前批次撤单交易已记录，后续由 indexer 和回执对账收口最终状态。",
			"register_cancel_tx",
		),
	}, nil
}

// buildBatchOrderKey 生成批量撤单请求内的去重键，避免同一订单被重复登记。
func buildBatchOrderKey(chainID int64, settlementAddress string, orderHash string) string {
	return normalizeHash(fmt.Sprintf("%d:%s:%s", chainID, normalizeAddress(settlementAddress), normalizeHash(orderHash)))
}

// findCancelResultByKey 用批次业务键定位本次请求里的单条结果，避免同 hash 条目串写状态。
func findCancelResultByKey(results []*executor.CancelOrdersResult, resultKey string) *executor.CancelOrdersResult {
	for _, result := range results {
		if result == nil {
			continue
		}
		if buildBatchOrderKey(result.GetChainId(), result.GetSettlementAddress(), result.GetOrderHash()) == resultKey {
			return result
		}
	}
	return nil
}
