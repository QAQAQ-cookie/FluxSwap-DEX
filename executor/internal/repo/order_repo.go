package repo

import (
	"context"
	"errors"
	"strings"

	"fluxswap-executor/internal/domain"

	"gorm.io/gorm"
)

// OrderRepository 封装订单表的所有数据库访问逻辑。
type OrderRepository struct {
	db *gorm.DB
}

// NewOrderRepository 基于给定的 Gorm 连接创建订单仓储。
func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

// Create 向数据库插入一笔新的签名订单。
func (r *OrderRepository) Create(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Create(order).Error
}

// Update 持久化一笔已有订单的最新状态。
func (r *OrderRepository) Update(ctx context.Context, order *domain.Order) error {
	if r == nil || r.db == nil {
		return errors.New("order repository unavailable")
	}

	return r.db.WithContext(ctx).Save(order).Error
}

// GetByOrderHash 按业务唯一键加载单笔订单。
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

// ListOpenOrdersByMakerAndNonce 查询会被单个 nonce 作废影响到的活跃订单。
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
			[]string{"open", "pending_execute", "pending_cancel"},
		).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	return orders, nil
}

// ListOpenOrdersByMakerAndNonceBelow 查询会被 cancelUpTo 一次性批量作废的活跃订单。
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
			[]string{"open", "pending_execute", "pending_cancel"},
		).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	return orders, nil
}

// ListByStatus 查询指定状态的订单，主要用于调试和诊断。
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

// ListOpenOrdersForSettlement 查询某个结算合约下待执行的 open 订单。
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
		Order("id ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	return orders, nil
}

// ListPendingOrdersForSettlement 查询已经提交链上、但还需要继续跟踪回执的订单。
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
			[]string{"pending_execute", "pending_cancel"},
		).
		Order("updated_at ASC").
		Limit(limit).
		Find(&orders).Error
	if err != nil {
		return nil, err
	}

	return orders, nil
}
