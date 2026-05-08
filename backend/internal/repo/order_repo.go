package repo

import (
	"context"
	"errors"
	"strings"
	"time"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

// OrderRepository 封装订单表的数据库访问逻辑。
type OrderRepository struct {
	db *gorm.DB
}

var orderRuntimeFieldNames = map[string]struct{}{
	"status_reason":               {},
	"estimated_gas_used":          {},
	"gas_price_at_quote":          {},
	"fee_quote_at":                {},
	"last_required_executor_fee":  {},
	"last_fee_check_at":           {},
	"last_execution_check_at":     {},
	"last_block_reason":           {},
	"settled_amount_out":          {},
	"settled_executor_fee":        {},
	"submitted_tx_hash":           {},
	"executed_tx_hash":            {},
	"cancelled_tx_hash":           {},
	"last_checked_block":          {},
}

// NewOrderRepository 基于给定的 Gorm 连接创建订单仓储。
func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

// Create 插入一笔新订单。
func (r *OrderRepository) Create(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.WithContext(ctx).Create(order).Error; err != nil {
			return err
		}
		runtime := newOrderRuntimeSnapshot(order, time.Now().UTC())
		if runtime == nil {
			return nil
		}
		return NewOrderRuntimeRepository(tx).Create(ctx, runtime)
	})
}

// Update 持久化整笔订单。
func (r *OrderRepository) Update(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.WithContext(ctx).Save(order).Error; err != nil {
			return err
		}
		runtime := newOrderRuntimeSnapshot(order, time.Now().UTC())
		if runtime == nil {
			return nil
		}

		runtimeRepo := NewOrderRuntimeRepository(tx)
		existing, err := runtimeRepo.GetByOrderID(ctx, order.ID)
		if err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			return runtimeRepo.Create(ctx, runtime)
		}

		runtime.ID = existing.ID
		runtime.CreatedAt = existing.CreatedAt
		return runtimeRepo.Save(ctx, runtime)
	})
}

// UpdateFields 按业务唯一键更新订单的部分字段。
func (r *OrderRepository) UpdateFields(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	orderHash string,
	updates map[string]interface{},
) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}
	if len(updates) == 0 {
		return errors.New("updates must not be empty")
	}

	orderUpdates, runtimeUpdates := splitOrderAndRuntimeUpdates(updates)
	if len(orderUpdates) == 0 && len(runtimeUpdates) == 0 {
		return errors.New("updates must not be empty")
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(orderUpdates) > 0 {
			if err := tx.WithContext(ctx).
				Model(&domain.Order{}).
				Where(
					"chain_id = ? AND settlement_address = ? AND order_hash = ?",
					chainID,
					strings.ToLower(strings.TrimSpace(settlementAddress)),
					strings.ToLower(strings.TrimSpace(orderHash)),
				).
				Updates(orderUpdates).Error; err != nil {
				return err
			}
		}

		if len(runtimeUpdates) > 0 {
			order, err := NewOrderRepository(tx).GetByOrderHash(ctx, chainID, settlementAddress, orderHash)
			if err != nil {
				return err
			}
			if err := NewOrderRuntimeRepository(tx).UpdateByOrderID(ctx, order.ID, runtimeUpdates); err != nil {
				return err
			}
		}

		return nil
	})
}

// UpdateFieldsIfStatusIn 仅在订单当前状态属于给定集合时更新字段。
func (r *OrderRepository) UpdateFieldsIfStatusIn(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	orderHash string,
	statuses []string,
	updates map[string]interface{},
) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("order repository unavailable")
	}
	if len(statuses) == 0 {
		return false, errors.New("statuses must not be empty")
	}
	if len(updates) == 0 {
		return false, errors.New("updates must not be empty")
	}

	orderUpdates, runtimeUpdates := splitOrderAndRuntimeUpdates(updates)
	if len(orderUpdates) == 0 {
		return false, errors.New("status-guarded updates must include order table fields")
	}

	normalizedStatuses := make([]string, 0, len(statuses))
	for _, status := range statuses {
		normalizedStatuses = append(normalizedStatuses, strings.TrimSpace(status))
	}

	updated := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.WithContext(ctx).
			Model(&domain.Order{}).
			Where(
				"chain_id = ? AND settlement_address = ? AND order_hash = ? AND status IN ?",
				chainID,
				strings.ToLower(strings.TrimSpace(settlementAddress)),
				strings.ToLower(strings.TrimSpace(orderHash)),
				normalizedStatuses,
			).
			Updates(orderUpdates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return nil
		}

		if len(runtimeUpdates) > 0 {
			order, getErr := NewOrderRepository(tx).GetByOrderHash(ctx, chainID, settlementAddress, orderHash)
			if getErr != nil {
				return getErr
			}
			if err := NewOrderRuntimeRepository(tx).UpdateByOrderID(ctx, order.ID, runtimeUpdates); err != nil {
				return err
			}
		}

		updated = true
		return nil
	})
	if err != nil {
		return false, err
	}

	return updated, nil
}

// ClaimOpenOrderForExecution 原子地把 open 订单抢占为 submitting_execute。
func (r *OrderRepository) ClaimOpenOrderForExecution(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	orderHash string,
	at time.Time,
) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("order repository unavailable")
	}

	claimed := false
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.WithContext(ctx).
			Model(&domain.Order{}).
			Where(
				"chain_id = ? AND settlement_address = ? AND order_hash = ? AND status = ?",
				chainID,
				strings.ToLower(strings.TrimSpace(settlementAddress)),
				strings.ToLower(strings.TrimSpace(orderHash)),
				"open",
			).
			Updates(map[string]interface{}{
				"status":     "submitting_execute",
				"updated_at": at.UTC(),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return nil
		}

		order, getErr := NewOrderRepository(tx).GetByOrderHash(ctx, chainID, settlementAddress, orderHash)
		if getErr != nil {
			return getErr
		}
		if err := NewOrderRuntimeRepository(tx).UpdateByOrderID(ctx, order.ID, map[string]interface{}{
			"status_reason":           "claimed_for_submission",
			"last_block_reason":       "",
			"submitted_tx_hash":       "",
			"last_execution_check_at": at.UTC(),
			"updated_at":              at.UTC(),
		}); err != nil {
			return err
		}

		claimed = true
		return nil
	})
	if err != nil {
		return false, err
	}

	return claimed, nil
}

// GetByOrderHash 按业务唯一键查询订单。
func (r *OrderRepository) GetByOrderHash(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	orderHash string,
) (*domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var order domain.Order
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND order_hash = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(orderHash)),
		).
		First(&order).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntime(ctx, &order); err != nil {
		return nil, err
	}

	return &order, nil
}

// ListOpenOrdersByMakerAndNonce 查询同一 maker/nonce 下仍活跃的订单。
func (r *OrderRepository) ListOpenOrdersByMakerAndNonce(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	maker string,
	nonce string,
) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND maker = ? AND nonce = ? AND status IN ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(maker)),
			strings.TrimSpace(nonce),
			[]string{"open", "submitting_execute", "pending_execute", "pending_cancel"},
		).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

// ListOrdersByMakerAndNonce 查询同一 maker/nonce 下的全部订单。
func (r *OrderRepository) ListOrdersByMakerAndNonce(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	maker string,
	nonce string,
) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND maker = ? AND nonce = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(maker)),
			strings.TrimSpace(nonce),
		).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

// ListOpenOrdersByMakerAndNonceBelow 查询会被更小 nonce 阈值批量作废的订单。
func (r *OrderRepository) ListOpenOrdersByMakerAndNonceBelow(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	maker string,
	minValidNonce string,
) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND maker = ? AND CAST(nonce AS NUMERIC) < CAST(? AS NUMERIC) AND status IN ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(maker)),
			strings.TrimSpace(minValidNonce),
			[]string{"open", "submitting_execute", "pending_execute", "pending_cancel"},
		).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

// ListByStatus 查询指定状态的订单。
func (r *OrderRepository) ListByStatus(ctx context.Context, status string, limit int) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Where("status = ?", strings.TrimSpace(status)).
		Order("id ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

// ListOpenOrdersForSettlement 查询某个结算合约下的 open 订单。
func (r *OrderRepository) ListOpenOrdersForSettlement(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	limit int,
) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Table("orders").
		Joins("LEFT JOIN order_runtime ON order_runtime.order_id = orders.id").
		Where(
			"orders.chain_id = ? AND orders.settlement_address = ? AND orders.status = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			"open",
		).
		Select("orders.*").
		Order("order_runtime.last_execution_check_at ASC").
		Order("orders.updated_at ASC").
		Order("orders.id ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

// ListPendingOrdersForSettlement 查询仍需继续跟踪回执的订单。
func (r *OrderRepository) ListPendingOrdersForSettlement(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	limit int,
) ([]domain.Order, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order repository unavailable")
	}

	var orders []domain.Order
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND status IN ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			[]string{"pending_execute", "pending_cancel", "submitting_execute"},
		).
		Order("updated_at ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	if err := r.attachRuntimes(ctx, orders); err != nil {
		return nil, err
	}

	return orders, nil
}

func (r *OrderRepository) attachRuntime(ctx context.Context, order *domain.Order) error {
	if order == nil || order.ID == 0 {
		return nil
	}
	runtime, err := NewOrderRuntimeRepository(r.db).GetByOrderID(ctx, order.ID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	applyRuntimeToOrder(order, runtime)
	return nil
}

func (r *OrderRepository) attachRuntimes(ctx context.Context, orders []domain.Order) error {
	if len(orders) == 0 {
		return nil
	}
	orderIDs := make([]uint64, 0, len(orders))
	for i := range orders {
		if orders[i].ID != 0 {
			orderIDs = append(orderIDs, orders[i].ID)
		}
	}

	runtimes, err := NewOrderRuntimeRepository(r.db).ListByOrderIDs(ctx, orderIDs)
	if err != nil {
		return err
	}
	runtimeByOrderID := make(map[uint64]domain.OrderRuntime, len(runtimes))
	for i := range runtimes {
		runtimeByOrderID[runtimes[i].OrderID] = runtimes[i]
	}
	for i := range orders {
		if runtime, ok := runtimeByOrderID[orders[i].ID]; ok {
			applyRuntimeToOrder(&orders[i], &runtime)
		}
	}
	return nil
}

func applyRuntimeToOrder(order *domain.Order, runtime *domain.OrderRuntime) {
	if order == nil || runtime == nil {
		return
	}
	order.StatusReason = runtime.StatusReason
	order.EstimatedGasUsed = runtime.EstimatedGasUsed
	order.GasPriceAtQuote = runtime.GasPriceAtQuote
	order.FeeQuoteAt = runtime.FeeQuoteAt
	order.LastRequiredExecutorFee = runtime.LastRequiredExecutorFee
	order.LastFeeCheckAt = runtime.LastFeeCheckAt
	order.LastExecutionCheckAt = runtime.LastExecutionCheckAt
	order.LastBlockReason = runtime.LastBlockReason
	order.SettledAmountOut = runtime.SettledAmountOut
	order.SettledExecutorFee = runtime.SettledExecutorFee
	order.SubmittedTxHash = runtime.SubmittedTxHash
	order.ExecutedTxHash = runtime.ExecutedTxHash
	order.CancelledTxHash = runtime.CancelledTxHash
	order.LastCheckedBlock = runtime.LastCheckedBlock
}

func splitOrderAndRuntimeUpdates(updates map[string]interface{}) (map[string]interface{}, map[string]interface{}) {
	orderUpdates := make(map[string]interface{})
	runtimeUpdates := make(map[string]interface{})
	for key, value := range updates {
		if _, ok := orderRuntimeFieldNames[key]; ok {
			runtimeUpdates[key] = value
			continue
		}
		orderUpdates[key] = value
	}
	return orderUpdates, runtimeUpdates
}

