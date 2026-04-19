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

// NewOrderRepository 基于给定的 Gorm 连接创建订单仓储。
func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

// Create 插入一笔新订单。
func (r *OrderRepository) Create(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Create(order).Error
}

// Update 持久化整笔订单。
func (r *OrderRepository) Update(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Save(order).Error
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

	return r.db.WithContext(ctx).
		Model(&domain.Order{}).
		Where(
			"chain_id = ? AND settlement_address = ? AND order_hash = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(orderHash)),
		).
		Updates(updates).Error
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

	normalizedStatuses := make([]string, 0, len(statuses))
	for _, status := range statuses {
		normalizedStatuses = append(normalizedStatuses, strings.TrimSpace(status))
	}

	result := r.db.WithContext(ctx).
		Model(&domain.Order{}).
		Where(
			"chain_id = ? AND settlement_address = ? AND order_hash = ? AND status IN ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(orderHash)),
			normalizedStatuses,
		).
		Updates(updates)
	if result.Error != nil {
		return false, result.Error
	}

	return result.RowsAffected == 1, nil
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

	result := r.db.WithContext(ctx).
		Model(&domain.Order{}).
		Where(
			"chain_id = ? AND settlement_address = ? AND order_hash = ? AND status = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(orderHash)),
			"open",
		).
		Updates(map[string]interface{}{
			"status":                  "submitting_execute",
			"status_reason":           "claimed_for_submission",
			"last_block_reason":       "",
			"submitted_tx_hash":       "",
			"last_execution_check_at": at.UTC(),
			"updated_at":              at.UTC(),
		})
	if result.Error != nil {
		return false, result.Error
	}

	return result.RowsAffected == 1, nil
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
		Where(
			"chain_id = ? AND settlement_address = ? AND status = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			"open",
		).
		Order("last_execution_check_at ASC").
		Order("updated_at ASC").
		Order("id ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
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

	return orders, nil
}

