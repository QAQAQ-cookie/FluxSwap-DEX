package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"gorm.io/gorm"
)

var ErrDuplicateOrderEvent = errors.New("duplicate order event")

// ApplyOrderEventParams 是应用层统一消费的标准化链上事件参数。
type ApplyOrderEventParams struct {
	ChainID            int64
	ContractAddress    string
	EventName          string
	TxHash             string
	LogIndex           int64
	BlockNumber        int64
	OrderHash          string
	Maker              string
	Nonce              string
	GrossAmountOut     string
	RecipientAmountOut string
	ExecutorFeeAmount  string
}

// OrderEventService 负责把结算合约事件应用到链下订单数据库。
type OrderEventService struct {
	db *gorm.DB
}

var (
	orderExecutedTransitionStatuses  = []string{"open", "submitting_execute", "pending_execute", "pending_cancel", "expired"}
	orderCancelledTransitionStatuses = []string{"open", "submitting_execute", "pending_execute", "pending_cancel", "expired"}
	orderRevertCancelledStatuses     = []string{"open", "submitting_execute", "pending_execute", "pending_cancel", "cancelled"}
)

// NewOrderEventService 基于共享数据库连接创建事件应用服务。
func NewOrderEventService(db *gorm.DB) *OrderEventService {
	return &OrderEventService{db: db}
}

// Apply 记录订单级事件，并同步更新对应订单状态。
func (s *OrderEventService) Apply(ctx context.Context, params ApplyOrderEventParams) (*domain.Order, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("order event service unavailable")
	}

	var updatedOrder *domain.Order
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		orderRepo := repo.NewOrderRepository(tx)
		orderEventRepo := repo.NewOrderEventRepository(tx)

		order, err := orderRepo.GetByOrderHash(
			ctx,
			params.ChainID,
			normalizeLower(params.ContractAddress),
			normalizeLower(params.OrderHash),
		)
		if err != nil {
			return err
		}

		if err := orderEventRepo.Create(ctx, buildOrderEvent(params)); err != nil {
			if repo.IsDuplicateKeyError(err) {
				return ErrDuplicateOrderEvent
			}
			return err
		}

		updates := map[string]interface{}{
			"last_checked_block": params.BlockNumber,
			"updated_at":         time.Now().UTC(),
		}

		switch strings.TrimSpace(params.EventName) {
		case "OrderExecuted":
			updates["status"] = "executed"
			updates["status_reason"] = buildExecutedStatusReason(order)
			updates["last_block_reason"] = ""
			if strings.TrimSpace(order.Status) != "pending_cancel" {
				updates["cancelled_tx_hash"] = ""
			}
			updates["executed_tx_hash"] = normalizeLower(params.TxHash)
			updates["settled_amount_out"] = strings.TrimSpace(params.GrossAmountOut)
			updates["settled_executor_fee"] = strings.TrimSpace(params.ExecutorFeeAmount)
		default:
			return gorm.ErrInvalidData
		}

		updated, updateErr := orderRepo.UpdateFieldsIfStatusIn(
			ctx,
			order.ChainID,
			order.SettlementAddress,
			order.OrderHash,
			orderExecutedTransitionStatuses,
			updates,
		)
		if updateErr != nil {
			return updateErr
		}
		if !updated {
			refreshedOrder, refreshedErr := orderRepo.GetByOrderHash(
				ctx,
				order.ChainID,
				order.SettlementAddress,
				order.OrderHash,
			)
			if refreshedErr != nil {
				return refreshedErr
			}
			if shouldBackfillExecutedEvent(refreshedOrder) {
				restoredStatusReason := buildExecutedStatusReasonForRestoredEvent(refreshedOrder)
				if err := updateOrderFields(
					ctx,
					tx,
					orderRepo,
					refreshedOrder,
					map[string]interface{}{
						"status":               "executed",
						"status_reason":        restoredStatusReason,
						"last_block_reason":    "",
						"executed_tx_hash":     normalizeLower(params.TxHash),
						"settled_amount_out":   strings.TrimSpace(params.GrossAmountOut),
						"settled_executor_fee": strings.TrimSpace(params.ExecutorFeeAmount),
						"last_checked_block":   params.BlockNumber,
						"updated_at":           time.Now().UTC(),
					},
				); err != nil {
					return err
				}
				if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
					Order:        refreshedOrder,
					ActivityType: domain.OrderActivityTypeChainReconciled,
					FromStatus:   "executed",
					ToStatus:     "executed",
					ReasonCode:   refreshedOrder.StatusReason,
					ReasonDetail: strings.TrimSpace(params.EventName),
					Source:       domain.OrderActivitySourceIndexer,
					TxHash:       params.TxHash,
					BlockNumber:  params.BlockNumber,
					LogIndex:     params.LogIndex,
					DedupeKey:    fmt.Sprintf("indexer:executed:%d:%s:%d", params.ChainID, normalizeLower(params.TxHash), params.LogIndex),
					Payload: map[string]string{
						"grossAmountOut":     strings.TrimSpace(params.GrossAmountOut),
						"recipientAmountOut": strings.TrimSpace(params.RecipientAmountOut),
						"executorFeeAmount":  strings.TrimSpace(params.ExecutorFeeAmount),
					},
					OccurredAt: time.Now().UTC(),
				}); activityErr != nil {
					return activityErr
				}
			}
			updatedOrder = refreshedOrder
			return nil
		}

		updatedOrder, err = orderRepo.GetByOrderHash(
			ctx,
			order.ChainID,
			order.SettlementAddress,
			order.OrderHash,
		)
		if err != nil {
			return err
		}
		if strings.TrimSpace(params.EventName) == "OrderExecuted" {
			activityType := domain.OrderActivityTypeExecutionConfirmed
			if strings.TrimSpace(order.Status) != "pending_execute" && strings.TrimSpace(order.Status) != "submitting_execute" {
				activityType = domain.OrderActivityTypeChainReconciled
			}
			if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
				Order:        updatedOrder,
				ActivityType: activityType,
				FromStatus:   order.Status,
				ToStatus:     updatedOrder.Status,
				ReasonCode:   updatedOrder.StatusReason,
				ReasonDetail: strings.TrimSpace(params.EventName),
				Source:       domain.OrderActivitySourceIndexer,
				TxHash:       params.TxHash,
				BlockNumber:  params.BlockNumber,
				LogIndex:     params.LogIndex,
				DedupeKey:    fmt.Sprintf("indexer:executed:%d:%s:%d", params.ChainID, normalizeLower(params.TxHash), params.LogIndex),
				Payload: map[string]string{
					"grossAmountOut":     strings.TrimSpace(params.GrossAmountOut),
					"recipientAmountOut": strings.TrimSpace(params.RecipientAmountOut),
					"executorFeeAmount":  strings.TrimSpace(params.ExecutorFeeAmount),
				},
				OccurredAt: time.Now().UTC(),
			}); activityErr != nil {
				return activityErr
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return updatedOrder, nil
}

// ApplyNonceInvalidated 记录单个 nonce 作废事件，并取消所有受影响的活跃订单。
func (s *OrderEventService) ApplyNonceInvalidated(ctx context.Context, params ApplyOrderEventParams) ([]domain.Order, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("order event service unavailable")
	}

	var updatedOrders []domain.Order
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		orderRepo := repo.NewOrderRepository(tx)
		orderEventRepo := repo.NewOrderEventRepository(tx)

		if err := orderEventRepo.Create(ctx, buildOrderEvent(params)); err != nil {
			if repo.IsDuplicateKeyError(err) {
				return ErrDuplicateOrderEvent
			}
			return err
		}

		orders, err := orderRepo.ListOrdersByMakerAndNonce(
			ctx,
			params.ChainID,
			normalizeLower(params.ContractAddress),
			normalizeLower(params.Maker),
			strings.TrimSpace(params.Nonce),
		)
		if err != nil {
			return err
		}

		candidates := make([]domain.Order, 0, len(orders))
		for i := range orders {
			if !containsStatus(orderCancelledTransitionStatuses, orders[i].Status) &&
				!shouldBackfillCancelledEvent(&orders[i]) {
				continue
			}
			candidates = append(candidates, orders[i])
		}

		for i := range candidates {
			fromStatus := candidates[i].Status
			cancelledStatusReason := buildCancelledStatusReason(&candidates[i])
			activityType := domain.OrderActivityTypeCancelConfirmed
			if shouldBackfillCancelledEvent(&candidates[i]) {
				cancelledStatusReason = buildCancelledStatusReasonForRestoredEvent(&candidates[i])
				activityType = domain.OrderActivityTypeChainReconciled
			}
			updated, updateErr := orderRepo.UpdateFieldsIfStatusIn(
				ctx,
				candidates[i].ChainID,
				candidates[i].SettlementAddress,
				candidates[i].OrderHash,
				orderCancelledTransitionStatuses,
				map[string]interface{}{
					"status":             "cancelled",
					"status_reason":      cancelledStatusReason,
					"cancelled_tx_hash":  normalizeLower(params.TxHash),
					"last_checked_block": params.BlockNumber,
					"last_block_reason":  "",
					"updated_at":         time.Now().UTC(),
				},
			)
			if updateErr != nil {
				return updateErr
			}
			if !updated {
				refreshed, refreshedErr := orderRepo.GetByOrderHash(
					ctx,
					candidates[i].ChainID,
					candidates[i].SettlementAddress,
					candidates[i].OrderHash,
				)
				if refreshedErr != nil {
					return refreshedErr
				}
				if shouldBackfillCancelledEvent(refreshed) {
					refreshedStatusReason := buildCancelledStatusReasonForRestoredEvent(refreshed)
					if err := updateOrderFields(
						ctx,
						tx,
						orderRepo,
						refreshed,
						map[string]interface{}{
							"status":             "cancelled",
							"status_reason":      refreshedStatusReason,
							"cancelled_tx_hash":  normalizeLower(params.TxHash),
							"last_checked_block": params.BlockNumber,
							"last_block_reason":  "",
							"updated_at":         time.Now().UTC(),
						},
					); err != nil {
						return err
					}
					if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
						Order:        refreshed,
						ActivityType: domain.OrderActivityTypeChainReconciled,
						FromStatus:   fromStatus,
						ToStatus:     refreshed.Status,
						ReasonCode:   refreshed.StatusReason,
						ReasonDetail: "NonceInvalidated",
						Source:       domain.OrderActivitySourceIndexer,
						ActorAddress: normalizeLower(params.Maker),
						TxHash:       params.TxHash,
						BlockNumber:  params.BlockNumber,
						LogIndex:     params.LogIndex,
						DedupeKey:    fmt.Sprintf("indexer:cancelled:%d:%s:%s:%d", params.ChainID, normalizeLower(params.TxHash), refreshed.OrderHash, params.LogIndex),
						Payload: map[string]string{
							"nonce": strings.TrimSpace(params.Nonce),
						},
						OccurredAt: time.Now().UTC(),
					}); activityErr != nil {
						return activityErr
					}
				}
				candidates[i] = *refreshed
				continue
			}

			refreshed, refreshedErr := orderRepo.GetByOrderHash(
				ctx,
				candidates[i].ChainID,
				candidates[i].SettlementAddress,
				candidates[i].OrderHash,
			)
			if refreshedErr != nil {
				return refreshedErr
			}
			candidates[i] = *refreshed
			if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
				Order:        &candidates[i],
				ActivityType: activityType,
				FromStatus:   fromStatus,
				ToStatus:     candidates[i].Status,
				ReasonCode:   candidates[i].StatusReason,
				ReasonDetail: "NonceInvalidated",
				Source:       domain.OrderActivitySourceIndexer,
				ActorAddress: normalizeLower(params.Maker),
				TxHash:       params.TxHash,
				BlockNumber:  params.BlockNumber,
				LogIndex:     params.LogIndex,
				DedupeKey:    fmt.Sprintf("indexer:cancelled:%d:%s:%s:%d", params.ChainID, normalizeLower(params.TxHash), candidates[i].OrderHash, params.LogIndex),
				Payload: map[string]string{
					"nonce": strings.TrimSpace(params.Nonce),
				},
				OccurredAt: time.Now().UTC(),
			}); activityErr != nil {
				return activityErr
			}
		}

		updatedOrders = candidates
		return nil
	})
	if err != nil {
		return nil, err
	}

	return updatedOrders, nil
}

// Revert 撤销一条已落库的链上事件，并根据剩余事件重建受影响订单状态。
func (s *OrderEventService) Revert(ctx context.Context, params ApplyOrderEventParams) error {
	if s == nil || s.db == nil {
		return errors.New("order event service unavailable")
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		orderRepo := repo.NewOrderRepository(tx)
		orderEventRepo := repo.NewOrderEventRepository(tx)

		deleted, err := orderEventRepo.DeleteByTxHashAndLogIndex(ctx, params.ChainID, params.TxHash, params.LogIndex)
		if err != nil {
			return err
		}
		if !deleted {
			return nil
		}

		switch strings.TrimSpace(params.EventName) {
		case "OrderExecuted":
			order, getErr := orderRepo.GetByOrderHash(
				ctx,
				params.ChainID,
				normalizeLower(params.ContractAddress),
				normalizeLower(params.OrderHash),
			)
			if getErr != nil {
				if errors.Is(getErr, gorm.ErrRecordNotFound) {
					return nil
				}
				return getErr
			}

			remainingEvents, listErr := orderEventRepo.ListByOrderHash(
				ctx,
				params.ChainID,
				params.ContractAddress,
				"OrderExecuted",
				params.OrderHash,
			)
			if listErr != nil {
				return listErr
			}

			if len(remainingEvents) == 0 {
				remainingCancelEvents, cancelErr := orderEventRepo.ListByMakerAndNonce(
					ctx,
					params.ChainID,
					params.ContractAddress,
					"NonceInvalidated",
					order.Maker,
					order.Nonce,
				)
				if cancelErr != nil {
					return cancelErr
				}

				if len(remainingCancelEvents) > 0 {
					latestCancel := remainingCancelEvents[len(remainingCancelEvents)-1]
					cancelledStatusReason := buildCancelledStatusReasonForRestoredEvent(order)
					if err := updateOrderFields(
						ctx,
						tx,
						orderRepo,
						order,
						map[string]interface{}{
							"status":               "cancelled",
							"status_reason":        cancelledStatusReason,
							"last_block_reason":    "",
							"executed_tx_hash":     "",
							"settled_amount_out":   "0",
							"settled_executor_fee": "0",
							"cancelled_tx_hash":    latestCancel.TxHash,
							"last_checked_block":   latestCancel.BlockNumber,
							"updated_at":           time.Now().UTC(),
						},
					); err != nil {
						return err
					}
					return RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
						Order:        order,
						ActivityType: domain.OrderActivityTypeReorgRestored,
						FromStatus:   "executed",
						ToStatus:     "cancelled",
						ReasonCode:   "revert_order_executed_event",
						ReasonDetail: "restored_latest_nonce_invalidated_event",
						Source:       domain.OrderActivitySourceIndexer,
						TxHash:       latestCancel.TxHash,
						BlockNumber:  latestCancel.BlockNumber,
						LogIndex:     latestCancel.LogIndex,
						DedupeKey:    fmt.Sprintf("reorg:restore:executed_to_cancelled:%d:%s:%s:%s", order.ChainID, normalizeLower(order.SettlementAddress), order.OrderHash, normalizeLower(params.TxHash)),
						Payload: map[string]string{
							"revertedTxHash":     normalizeLower(params.TxHash),
							"restoredTxHash":     latestCancel.TxHash,
							"restoredStatusReason": cancelledStatusReason,
						},
						OccurredAt: time.Now().UTC(),
					})
				}

				if strings.TrimSpace(order.Status) == "executed" &&
					strings.TrimSpace(order.StatusReason) == "updated_by_order_executed_event_after_pending_cancel" &&
					strings.TrimSpace(order.CancelledTxHash) != "" {
					if err := updateOrderFields(
						ctx,
						tx,
						orderRepo,
						order,
						map[string]interface{}{
							"status":               "pending_cancel",
							"status_reason":        "cancel_tx_submitted_by_user",
							"last_block_reason":    "",
							"executed_tx_hash":     "",
							"settled_amount_out":   "0",
							"settled_executor_fee": "0",
							"last_checked_block":   0,
							"updated_at":           time.Now().UTC(),
						},
					); err != nil {
						return err
					}
					return RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
						Order:        order,
						ActivityType: domain.OrderActivityTypeReorgRestored,
						FromStatus:   "executed",
						ToStatus:     "pending_cancel",
						ReasonCode:   "revert_order_executed_event",
						ReasonDetail: "restored_pending_cancel_state",
						Source:       domain.OrderActivitySourceIndexer,
						TxHash:       normalizeLower(order.CancelledTxHash),
						DedupeKey:    fmt.Sprintf("reorg:restore:executed_to_pending_cancel:%d:%s:%s:%s", order.ChainID, normalizeLower(order.SettlementAddress), order.OrderHash, normalizeLower(params.TxHash)),
						Payload: map[string]string{
							"revertedTxHash": normalizeLower(params.TxHash),
						},
						OccurredAt: time.Now().UTC(),
					})
				}

				if strings.TrimSpace(order.Status) == "executed" &&
					strings.TrimSpace(order.StatusReason) == "updated_by_order_executed_event_after_expired" {
					if err := updateOrderFields(
						ctx,
						tx,
						orderRepo,
						order,
						map[string]interface{}{
							"status":               "expired",
							"status_reason":        "expired_by_chain_time",
							"last_block_reason":    "ORDER_EXPIRED",
							"executed_tx_hash":     "",
							"settled_amount_out":   "0",
							"settled_executor_fee": "0",
							"last_checked_block":   0,
							"updated_at":           time.Now().UTC(),
						},
					); err != nil {
						return err
					}
					return RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
						Order:        order,
						ActivityType: domain.OrderActivityTypeReorgRestored,
						FromStatus:   "executed",
						ToStatus:     "expired",
						ReasonCode:   "revert_order_executed_event",
						ReasonDetail: "restored_expired_state",
						Source:       domain.OrderActivitySourceIndexer,
						DedupeKey:    fmt.Sprintf("reorg:restore:executed_to_expired:%d:%s:%s:%s", order.ChainID, normalizeLower(order.SettlementAddress), order.OrderHash, normalizeLower(params.TxHash)),
						Payload: map[string]string{
							"revertedTxHash": normalizeLower(params.TxHash),
						},
						OccurredAt: time.Now().UTC(),
					})
				}

				fromStatus := strings.TrimSpace(order.Status)
				if shouldClearExecutedStatusReason(order.StatusReason) {
					if order.Status != "open" {
						order.Status = "open"
					}
					order.StatusReason = ""
					if fromStatus == "cancelled" {
						order.CancelledTxHash = ""
					}
				}
				if err := updateOrderFields(
					ctx,
					tx,
					orderRepo,
					order,
					map[string]interface{}{
						"status":               order.Status,
						"status_reason":        order.StatusReason,
						"last_block_reason":    "",
						"executed_tx_hash":     "",
						"cancelled_tx_hash":    order.CancelledTxHash,
						"settled_amount_out":   "0",
						"settled_executor_fee": "0",
						"last_checked_block":   0,
						"updated_at":           time.Now().UTC(),
					},
				); err != nil {
					return err
				}
				return RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
					Order:        order,
					ActivityType: domain.OrderActivityTypeReorgRestored,
					FromStatus:   fromStatus,
					ToStatus:     order.Status,
					ReasonCode:   "revert_order_executed_event",
					ReasonDetail: "cleared_derived_execution_state",
					Source:       domain.OrderActivitySourceIndexer,
					DedupeKey:    fmt.Sprintf("reorg:restore:executed_to_%s:%d:%s:%s:%s", normalizeLower(order.Status), order.ChainID, normalizeLower(order.SettlementAddress), order.OrderHash, normalizeLower(params.TxHash)),
					Payload: map[string]string{
						"revertedTxHash": normalizeLower(params.TxHash),
					},
					OccurredAt: time.Now().UTC(),
				})
			}

			latest := remainingEvents[len(remainingEvents)-1]
			restoredStatusReason := buildExecutedStatusReasonForRestoredEvent(order)
			fromStatus := strings.TrimSpace(order.Status)
			if err := updateOrderFields(
				ctx,
				tx,
				orderRepo,
				order,
				map[string]interface{}{
					"status":               "executed",
					"status_reason":        restoredStatusReason,
					"last_block_reason":    "",
					"executed_tx_hash":     latest.TxHash,
					"settled_amount_out":   latest.GrossAmountOut,
					"settled_executor_fee": latest.ExecutorFeeAmount,
					"last_checked_block":   latest.BlockNumber,
					"updated_at":           time.Now().UTC(),
				},
			); err != nil {
				return err
			}
			return RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
				Order:        order,
				ActivityType: domain.OrderActivityTypeReorgRestored,
				FromStatus:   fromStatus,
				ToStatus:     "executed",
				ReasonCode:   "revert_order_executed_event",
				ReasonDetail: "restored_latest_order_executed_event",
				Source:       domain.OrderActivitySourceIndexer,
				TxHash:       latest.TxHash,
				BlockNumber:  latest.BlockNumber,
				LogIndex:     latest.LogIndex,
				DedupeKey:    fmt.Sprintf("reorg:restore:executed_to_executed:%d:%s:%s:%s", order.ChainID, normalizeLower(order.SettlementAddress), order.OrderHash, normalizeLower(params.TxHash)),
				Payload: map[string]string{
					"revertedTxHash":      normalizeLower(params.TxHash),
					"restoredTxHash":      latest.TxHash,
					"restoredStatusReason": restoredStatusReason,
				},
				OccurredAt: time.Now().UTC(),
			})

		case "NonceInvalidated":
			orders, listErr := orderRepo.ListOrdersByMakerAndNonce(
				ctx,
				params.ChainID,
				normalizeLower(params.ContractAddress),
				normalizeLower(params.Maker),
				strings.TrimSpace(params.Nonce),
			)
			if listErr != nil {
				return listErr
			}

			remainingEvents, eventErr := orderEventRepo.ListByMakerAndNonce(
				ctx,
				params.ChainID,
				params.ContractAddress,
				"NonceInvalidated",
				params.Maker,
				params.Nonce,
			)
			if eventErr != nil {
				return eventErr
			}

			for i := range orders {
				now := time.Now().UTC()
				if len(remainingEvents) == 0 {
					if strings.TrimSpace(orders[i].Status) == "cancelled" &&
						strings.TrimSpace(orders[i].StatusReason) == "confirmed_by_chain_state" {
						remainingExecutedEvents, executedErr := orderEventRepo.ListByOrderHash(
							ctx,
							params.ChainID,
							params.ContractAddress,
							"OrderExecuted",
							orders[i].OrderHash,
						)
						if executedErr != nil {
							return executedErr
						}
						if len(remainingExecutedEvents) > 0 {
							latestExecuted := remainingExecutedEvents[len(remainingExecutedEvents)-1]
							restoredStatusReason := buildExecutedStatusReasonForRestoredEvent(&orders[i])
							if err := updateOrderFields(
								ctx,
								tx,
								orderRepo,
								&orders[i],
								map[string]interface{}{
									"status":               "executed",
									"status_reason":        restoredStatusReason,
									"last_block_reason":    "",
									"executed_tx_hash":     latestExecuted.TxHash,
									"settled_amount_out":   latestExecuted.GrossAmountOut,
									"settled_executor_fee": latestExecuted.ExecutorFeeAmount,
									"last_checked_block":   latestExecuted.BlockNumber,
									"updated_at":           now,
								},
							); err != nil {
								return err
							}
							if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
								Order:        &orders[i],
								ActivityType: domain.OrderActivityTypeReorgRestored,
								FromStatus:   "cancelled",
								ToStatus:     "executed",
								ReasonCode:   "revert_nonce_invalidated_event",
								ReasonDetail: "restored_latest_order_executed_event",
								Source:       domain.OrderActivitySourceIndexer,
								TxHash:       latestExecuted.TxHash,
								BlockNumber:  latestExecuted.BlockNumber,
								LogIndex:     latestExecuted.LogIndex,
								DedupeKey:    fmt.Sprintf("reorg:restore:cancelled_to_executed:%d:%s:%s:%s", orders[i].ChainID, normalizeLower(orders[i].SettlementAddress), orders[i].OrderHash, normalizeLower(params.TxHash)),
								Payload: map[string]string{
									"revertedTxHash":       normalizeLower(params.TxHash),
									"restoredTxHash":       latestExecuted.TxHash,
									"restoredStatusReason": restoredStatusReason,
								},
								OccurredAt: now,
							}); activityErr != nil {
								return activityErr
							}
							continue
						}
					}
					if restoredUpdates, ok := buildCancelledReorgRestoreUpdates(&orders[i], now); ok {
						targetStatus, _ := restoredUpdates["status"].(string)
						targetReason, _ := restoredUpdates["status_reason"].(string)
						applied, err := guardedUpdateOrderStatus(
							ctx,
							tx,
							orderRepo,
							&orders[i],
							[]string{"cancelled"},
							restoredUpdates,
						)
						if err != nil {
							return err
						}
						if !applied {
							continue
						}
						if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
							Order:        &orders[i],
							ActivityType: domain.OrderActivityTypeReorgRestored,
							FromStatus:   "cancelled",
							ToStatus:     strings.TrimSpace(targetStatus),
							ReasonCode:   "revert_nonce_invalidated_event",
							ReasonDetail: strings.TrimSpace(targetReason),
							Source:       domain.OrderActivitySourceIndexer,
							DedupeKey:    fmt.Sprintf("reorg:restore:cancelled_to_%s:%d:%s:%s:%s", normalizeLower(targetStatus), orders[i].ChainID, normalizeLower(orders[i].SettlementAddress), orders[i].OrderHash, normalizeLower(params.TxHash)),
							Payload: map[string]string{
								"revertedTxHash": normalizeLower(params.TxHash),
							},
							OccurredAt: now,
						}); activityErr != nil {
							return activityErr
						}
						continue
					}

					if orders[i].Status == "cancelled" && shouldClearCancelledStatusReason(orders[i].StatusReason) {
						applied, err := guardedUpdateOrderStatus(
							ctx,
							tx,
							orderRepo,
							&orders[i],
							[]string{"cancelled"},
							map[string]interface{}{
								"status":             "open",
								"status_reason":      "",
								"cancelled_tx_hash":  "",
								"last_checked_block": 0,
								"last_block_reason":  "",
								"updated_at":         now,
							},
						)
						if err != nil {
							return err
						}
						if !applied {
							continue
						}
						if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
							Order:        &orders[i],
							ActivityType: domain.OrderActivityTypeReorgRestored,
							FromStatus:   "cancelled",
							ToStatus:     "open",
							ReasonCode:   "revert_nonce_invalidated_event",
							ReasonDetail: "cleared_derived_cancel_state",
							Source:       domain.OrderActivitySourceIndexer,
							DedupeKey:    fmt.Sprintf("reorg:restore:cancelled_to_open:%d:%s:%s:%s", orders[i].ChainID, normalizeLower(orders[i].SettlementAddress), orders[i].OrderHash, normalizeLower(params.TxHash)),
							Payload: map[string]string{
								"revertedTxHash": normalizeLower(params.TxHash),
							},
							OccurredAt: now,
						}); activityErr != nil {
							return activityErr
						}
					}
					continue
				}

				if strings.TrimSpace(orders[i].Status) == "executed" {
					continue
				}

				latest := remainingEvents[len(remainingEvents)-1]
				cancelledStatusReason := buildCancelledStatusReasonForRestoredEvent(&orders[i])
				fromStatus := strings.TrimSpace(orders[i].Status)
				applied, err := guardedUpdateOrderStatus(
					ctx,
					tx,
					orderRepo,
					&orders[i],
					orderRevertCancelledStatuses,
					map[string]interface{}{
						"status":             "cancelled",
						"status_reason":      cancelledStatusReason,
						"cancelled_tx_hash":  latest.TxHash,
						"last_checked_block": latest.BlockNumber,
						"last_block_reason":  "",
						"updated_at":         now,
					},
				)
				if err != nil {
					return err
				}
				if !applied {
					continue
				}
				if activityErr := RecordOrderActivity(ctx, tx, RecordOrderActivityParams{
					Order:        &orders[i],
					ActivityType: domain.OrderActivityTypeReorgRestored,
					FromStatus:   fromStatus,
					ToStatus:     "cancelled",
					ReasonCode:   "revert_nonce_invalidated_event",
					ReasonDetail: "restored_latest_nonce_invalidated_event",
					Source:       domain.OrderActivitySourceIndexer,
					TxHash:       latest.TxHash,
					BlockNumber:  latest.BlockNumber,
					LogIndex:     latest.LogIndex,
					DedupeKey:    fmt.Sprintf("reorg:restore:cancelled_to_cancelled:%d:%s:%s:%s", orders[i].ChainID, normalizeLower(orders[i].SettlementAddress), orders[i].OrderHash, normalizeLower(params.TxHash)),
					Payload: map[string]string{
						"revertedTxHash":      normalizeLower(params.TxHash),
						"restoredTxHash":      latest.TxHash,
						"restoredStatusReason": cancelledStatusReason,
					},
					OccurredAt: now,
				}); activityErr != nil {
					return activityErr
				}
			}
			return nil

		default:
			return nil
		}
	})
}

// OrderToResponse 把领域模型转换成 RPC 和 worker 共用的响应结构。
func OrderToResponse(order *domain.Order) *struct {
	ID                      uint64
	ChainID                 int64
	SettlementAddress       string
	OrderHash               string
	Maker                   string
	InputToken              string
	OutputToken             string
	AmountIn                string
	MinAmountOut            string
	ExecutorFee             string
	ExecutorFeeToken        string
	TriggerPriceX18         string
	Expiry                  string
	Nonce                   string
	Recipient               string
	Source                  string
	Status                  string
	StatusReason            string
	EstimatedGasUsed        string
	GasPriceAtQuote         string
	FeeQuoteAt              string
	LastRequiredExecutorFee string
	LastFeeCheckAt          string
	LastExecutionCheckAt    string
	LastBlockReason         string
	SettledAmountOut        string
	SettledExecutorFee      string
	SubmittedTxHash         string
	ExecutedTxHash          string
	CancelledTxHash         string
	LastCheckedBlock        int64
	CreatedAt               string
	UpdatedAt               string
} {
	if order == nil {
		return nil
	}

	return &struct {
		ID                      uint64
		ChainID                 int64
		SettlementAddress       string
		OrderHash               string
		Maker                   string
		InputToken              string
		OutputToken             string
		AmountIn                string
		MinAmountOut            string
		ExecutorFee             string
		ExecutorFeeToken        string
		TriggerPriceX18         string
		Expiry                  string
		Nonce                   string
		Recipient               string
		Source                  string
		Status                  string
		StatusReason            string
		EstimatedGasUsed        string
		GasPriceAtQuote         string
		FeeQuoteAt              string
		LastRequiredExecutorFee string
		LastFeeCheckAt          string
		LastExecutionCheckAt    string
		LastBlockReason         string
		SettledAmountOut        string
		SettledExecutorFee      string
		SubmittedTxHash         string
		ExecutedTxHash          string
		CancelledTxHash         string
		LastCheckedBlock        int64
		CreatedAt               string
		UpdatedAt               string
	}{
		ID:                      order.ID,
		ChainID:                 order.ChainID,
		SettlementAddress:       order.SettlementAddress,
		OrderHash:               order.OrderHash,
		Maker:                   order.Maker,
		InputToken:              order.InputToken,
		OutputToken:             order.OutputToken,
		AmountIn:                order.AmountIn,
		MinAmountOut:            order.MinAmountOut,
		ExecutorFee:             order.ExecutorFee,
		ExecutorFeeToken:        order.ExecutorFeeToken,
		TriggerPriceX18:         order.TriggerPriceX18,
		Expiry:                  order.Expiry,
		Nonce:                   order.Nonce,
		Recipient:               order.Recipient,
		Source:                  order.Source,
		Status:                  order.Status,
		StatusReason:            order.StatusReason,
		EstimatedGasUsed:        order.EstimatedGasUsed,
		GasPriceAtQuote:         order.GasPriceAtQuote,
		FeeQuoteAt:              formatTime(order.FeeQuoteAt),
		LastRequiredExecutorFee: order.LastRequiredExecutorFee,
		LastFeeCheckAt:          formatTime(order.LastFeeCheckAt),
		LastExecutionCheckAt:    formatTime(order.LastExecutionCheckAt),
		LastBlockReason:         order.LastBlockReason,
		SettledAmountOut:        order.SettledAmountOut,
		SettledExecutorFee:      order.SettledExecutorFee,
		SubmittedTxHash:         order.SubmittedTxHash,
		ExecutedTxHash:          order.ExecutedTxHash,
		CancelledTxHash:         order.CancelledTxHash,
		LastCheckedBlock:        order.LastCheckedBlock,
		CreatedAt:               formatTime(order.CreatedAt),
		UpdatedAt:               formatTime(order.UpdatedAt),
	}
}

func buildOrderEvent(params ApplyOrderEventParams) *domain.OrderEvent {
	return &domain.OrderEvent{
		ChainID:            params.ChainID,
		ContractAddress:    normalizeLower(params.ContractAddress),
		EventName:          strings.TrimSpace(params.EventName),
		TxHash:             normalizeLower(params.TxHash),
		LogIndex:           params.LogIndex,
		BlockNumber:        params.BlockNumber,
		OrderHash:          normalizeLower(params.OrderHash),
		Maker:              normalizeLower(params.Maker),
		Nonce:              strings.TrimSpace(params.Nonce),
		MinValidNonce:      "",
		GrossAmountOut:     numericOrZero(params.GrossAmountOut),
		RecipientAmountOut: numericOrZero(params.RecipientAmountOut),
		ExecutorFeeAmount:  numericOrZero(params.ExecutorFeeAmount),
		ObservedAt:         time.Now().UTC(),
	}
}

func normalizeLower(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func numericOrZero(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "0"
	}
	return trimmed
}

func shouldClearExecutedStatusReason(reason string) bool {
	switch strings.TrimSpace(reason) {
	case "updated_by_order_executed_event",
		"updated_by_order_executed_event_after_pending_cancel",
		"updated_by_order_executed_event_after_expired",
		"confirmed_by_chain_state":
		return true
	default:
		return false
	}
}

func buildExecutedStatusReason(order *domain.Order) string {
	if order == nil {
		return "updated_by_order_executed_event"
	}

	switch strings.TrimSpace(order.Status) {
	case "pending_cancel":
		return "updated_by_order_executed_event_after_pending_cancel"
	case "expired":
		return "updated_by_order_executed_event_after_expired"
	default:
		return "updated_by_order_executed_event"
	}
}

func buildExecutedStatusReasonForRestoredEvent(order *domain.Order) string {
	if order == nil {
		return "updated_by_order_executed_event"
	}

	if strings.TrimSpace(order.CancelledTxHash) != "" {
		return "updated_by_order_executed_event_after_pending_cancel"
	}

	switch strings.TrimSpace(order.StatusReason) {
	case "updated_by_order_executed_event",
		"updated_by_order_executed_event_after_pending_cancel",
		"updated_by_order_executed_event_after_expired",
		"confirmed_by_chain_state":
		return strings.TrimSpace(order.StatusReason)
	default:
		return "updated_by_order_executed_event"
	}
}

func shouldBackfillExecutedEvent(order *domain.Order) bool {
	return order != nil &&
		strings.TrimSpace(order.Status) == "executed" &&
		strings.TrimSpace(order.StatusReason) == "confirmed_by_chain_state"
}

func shouldClearCancelledStatusReason(reason string) bool {
	switch strings.TrimSpace(reason) {
	case "updated_by_nonce_invalidated_event",
		"updated_by_nonce_invalidated_event_after_pending_cancel",
		"updated_by_nonce_invalidated_event_after_pending_execute",
		"updated_by_nonce_invalidated_event_after_submitting_execute",
		"confirmed_by_chain_state":
		return true
	default:
		return false
	}
}

func buildCancelledStatusReason(order *domain.Order) string {
	if order == nil {
		return "updated_by_nonce_invalidated_event"
	}
	switch strings.TrimSpace(order.Status) {
	case "expired":
		return "updated_by_nonce_invalidated_event_after_expired"
	case "pending_cancel":
		if strings.TrimSpace(order.CancelledTxHash) != "" {
			return "updated_by_nonce_invalidated_event_after_pending_cancel"
		}
	case "pending_execute":
		if strings.TrimSpace(order.SubmittedTxHash) != "" {
			return "updated_by_nonce_invalidated_event_after_pending_execute"
		}
	case "submitting_execute":
		return "updated_by_nonce_invalidated_event_after_submitting_execute"
	}
	return "updated_by_nonce_invalidated_event"
}

func buildCancelledStatusReasonForRestoredEvent(order *domain.Order) string {
	if order == nil {
		return "updated_by_nonce_invalidated_event"
	}

	switch strings.TrimSpace(order.StatusReason) {
	case "updated_by_nonce_invalidated_event",
		"updated_by_nonce_invalidated_event_after_pending_cancel",
		"updated_by_nonce_invalidated_event_after_pending_execute",
		"updated_by_nonce_invalidated_event_after_submitting_execute",
		"updated_by_nonce_invalidated_event_after_expired":
		return strings.TrimSpace(order.StatusReason)
	case "updated_by_order_executed_event_after_pending_cancel":
		return "updated_by_nonce_invalidated_event_after_pending_cancel"
	case "updated_by_order_executed_event_after_expired":
		return "updated_by_nonce_invalidated_event_after_expired"
	}

	switch strings.TrimSpace(order.Status) {
	case "open", "pending_cancel", "pending_execute", "submitting_execute", "expired":
		return buildCancelledStatusReason(order)
	case "executed":
		if strings.TrimSpace(order.CancelledTxHash) != "" {
			return "updated_by_nonce_invalidated_event_after_pending_cancel"
		}
		if strings.TrimSpace(order.SubmittedTxHash) != "" {
			return "updated_by_nonce_invalidated_event_after_pending_execute"
		}
	}
	if strings.TrimSpace(order.SubmittedTxHash) != "" {
		return "updated_by_nonce_invalidated_event_after_pending_execute"
	}
	if strings.TrimSpace(order.CancelledTxHash) != "" {
		return "updated_by_nonce_invalidated_event_after_pending_cancel"
	}
	if strings.TrimSpace(order.LastBlockReason) == "ORDER_EXPIRED" {
		return "updated_by_nonce_invalidated_event_after_expired"
	}

	return "updated_by_nonce_invalidated_event"
}

func shouldBackfillCancelledEvent(order *domain.Order) bool {
	return order != nil &&
		strings.TrimSpace(order.Status) == "cancelled" &&
		strings.TrimSpace(order.StatusReason) == "confirmed_by_chain_state"
}

func buildCancelledReorgRestoreUpdates(order *domain.Order, now time.Time) (map[string]interface{}, bool) {
	if order == nil {
		return nil, false
	}

	switch strings.TrimSpace(order.StatusReason) {
	case "updated_by_nonce_invalidated_event_after_expired":
		return map[string]interface{}{
			"status":             "expired",
			"status_reason":      "expired_by_chain_time",
			"cancelled_tx_hash":  "",
			"last_checked_block": 0,
			"last_block_reason":  "ORDER_EXPIRED",
			"updated_at":         now,
		}, true
	case "updated_by_nonce_invalidated_event_after_pending_cancel":
		if strings.TrimSpace(order.CancelledTxHash) == "" {
			return nil, false
		}
		return map[string]interface{}{
			"status":             "pending_cancel",
			"status_reason":      "cancel_tx_submitted_by_user",
			"last_checked_block": 0,
			"last_block_reason":  "",
			"updated_at":         now,
		}, true
	case "updated_by_nonce_invalidated_event_after_pending_execute":
		if strings.TrimSpace(order.SubmittedTxHash) == "" {
			return nil, false
		}
		return map[string]interface{}{
			"status":             "pending_execute",
			"status_reason":      "submitted_to_chain",
			"cancelled_tx_hash":  "",
			"last_checked_block": 0,
			"last_block_reason":  "",
			"updated_at":         now,
		}, true
	case "updated_by_nonce_invalidated_event_after_submitting_execute":
		return map[string]interface{}{
			"status":             "submitting_execute",
			"status_reason":      "claimed_for_submission",
			"cancelled_tx_hash":  "",
			"last_checked_block": 0,
			"last_block_reason":  "",
			"updated_at":         now,
		}, true
	default:
		return nil, false
	}
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}

	return value.UTC().Format("2006-01-02T15:04:05Z07:00")
}

func updateOrderFields(
	ctx context.Context,
	db *gorm.DB,
	orderRepo *repo.OrderRepository,
	order *domain.Order,
	updates map[string]interface{},
) error {
	if order == nil {
		return errors.New("order is required")
	}
	if len(updates) == 0 {
		return errors.New("updates must not be empty")
	}
	if _, ok := updates["updated_at"]; !ok {
		updates["updated_at"] = time.Now().UTC()
	}

	if err := orderRepo.UpdateFields(
		ctx,
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		updates,
	); err != nil {
		return err
	}

	refreshedOrder, err := orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
	if err != nil {
		return err
	}
	*order = *refreshedOrder
	return nil
}

func guardedUpdateOrderStatus(
	ctx context.Context,
	db *gorm.DB,
	orderRepo *repo.OrderRepository,
	order *domain.Order,
	allowedStatuses []string,
	updates map[string]interface{},
) (bool, error) {
	updated, err := orderRepo.UpdateFieldsIfStatusIn(
		ctx,
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		allowedStatuses,
		updates,
	)
	if err != nil {
		return false, err
	}
	if updated {
		refreshedOrder, refreshedErr := orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
		if refreshedErr != nil {
			return false, refreshedErr
		}
		*order = *refreshedOrder
		return true, nil
	}

	currentOrder, currentErr := orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
	if currentErr != nil {
		return false, currentErr
	}
	if containsStatus(allowedStatuses, currentOrder.Status) {
		if orderMatchesUpdates(currentOrder, updates) {
			*order = *currentOrder
			return true, nil
		}
		return false, fmt.Errorf("guarded update skipped unexpectedly for order %s in status %s", currentOrder.OrderHash, currentOrder.Status)
	}

	return false, nil
}

func containsStatus(statuses []string, target string) bool {
	normalizedTarget := strings.TrimSpace(target)
	for _, status := range statuses {
		if strings.TrimSpace(status) == normalizedTarget {
			return true
		}
	}
	return false
}

func toInt64(value interface{}) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case int32:
		return int64(typed), true
	case uint64:
		return int64(typed), true
	case uint32:
		return int64(typed), true
	default:
		return 0, false
	}
}

func orderMatchesUpdates(order *domain.Order, updates map[string]interface{}) bool {
	if order == nil {
		return false
	}

	for key, value := range updates {
		switch key {
		case "status":
			expected, ok := value.(string)
			if !ok || order.Status != expected {
				return false
			}
		case "status_reason":
			expected, ok := value.(string)
			if !ok || order.StatusReason != expected {
				return false
			}
		case "last_block_reason":
			expected, ok := value.(string)
			if !ok || order.LastBlockReason != expected {
				return false
			}
		case "cancelled_tx_hash":
			expected, ok := value.(string)
			if !ok || order.CancelledTxHash != expected {
				return false
			}
		case "executed_tx_hash":
			expected, ok := value.(string)
			if !ok || order.ExecutedTxHash != expected {
				return false
			}
		case "settled_amount_out":
			expected, ok := value.(string)
			if !ok || order.SettledAmountOut != expected {
				return false
			}
		case "settled_executor_fee":
			expected, ok := value.(string)
			if !ok || order.SettledExecutorFee != expected {
				return false
			}
		case "last_checked_block":
			expected, ok := toInt64(value)
			if !ok || order.LastCheckedBlock != expected {
				return false
			}
		}
	}

	return true
}
