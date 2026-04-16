package repo

import (
	"context"
	"errors"

	"fluxswap-executor/internal/domain"

	"gorm.io/gorm"
)

// OrderEventRepository 封装链上事件表的数据库访问逻辑。
type OrderEventRepository struct {
	db *gorm.DB
}

// NewOrderEventRepository 基于给定的 Gorm 连接创建事件仓储。
func NewOrderEventRepository(db *gorm.DB) *OrderEventRepository {
	return &OrderEventRepository{db: db}
}

// Create 记录一条已经观察到的结算事件。
//
// 调用方会依赖数据库唯一索引做幂等控制，因此重复写入会由数据库层去重。
func (r *OrderEventRepository) Create(ctx context.Context, event *domain.OrderEvent) error {
	if r == nil || r.db == nil {
		return errors.New("order event repository unavailable")
	}

	return r.db.WithContext(ctx).Create(event).Error
}
