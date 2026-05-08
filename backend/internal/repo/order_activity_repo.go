package repo

import (
	"context"
	"errors"
	"strings"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

// OrderActivityRepository 封装订单活动表访问逻辑。
type OrderActivityRepository struct {
	db *gorm.DB
}

// NewOrderActivityRepository 基于给定连接创建活动仓储。
func NewOrderActivityRepository(db *gorm.DB) *OrderActivityRepository {
	return &OrderActivityRepository{db: db}
}

// Create 写入一条订单活动记录。
func (r *OrderActivityRepository) Create(ctx context.Context, activity *domain.OrderActivity) error {
	if r == nil || r.db == nil {
		return errors.New("order activity repository unavailable")
	}

	return r.db.WithContext(ctx).Create(activity).Error
}

// ListByOrderHash 按订单查询活动列表，按发生时间倒序返回。
func (r *OrderActivityRepository) ListByOrderHash(
	ctx context.Context,
	chainID int64,
	settlementAddress string,
	orderHash string,
	limit int,
) ([]domain.OrderActivity, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order activity repository unavailable")
	}

	var activities []domain.OrderActivity
	query := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND settlement_address = ? AND order_hash = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(settlementAddress)),
			strings.ToLower(strings.TrimSpace(orderHash)),
		).
		Order("occurred_at DESC").
		Order("id DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	if err := query.Find(&activities).Error; err != nil {
		return nil, err
	}

	return activities, nil
}
