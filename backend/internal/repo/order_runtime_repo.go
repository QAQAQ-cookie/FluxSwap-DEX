package repo

import (
	"context"
	"errors"
	"time"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

// OrderRuntimeRepository 封装订单运行态快照表访问。
type OrderRuntimeRepository struct {
	db *gorm.DB
}

// NewOrderRuntimeRepository 创建运行态仓储。
func NewOrderRuntimeRepository(db *gorm.DB) *OrderRuntimeRepository {
	return &OrderRuntimeRepository{db: db}
}

// Create 新增一条运行态记录。
func (r *OrderRuntimeRepository) Create(ctx context.Context, runtime *domain.OrderRuntime) error {
	if r == nil || r.db == nil {
		return errors.New("order runtime repository unavailable")
	}

	return r.db.WithContext(ctx).Create(runtime).Error
}

// Save 持久化整条运行态记录。
func (r *OrderRuntimeRepository) Save(ctx context.Context, runtime *domain.OrderRuntime) error {
	if r == nil || r.db == nil {
		return errors.New("order runtime repository unavailable")
	}

	return r.db.WithContext(ctx).Save(runtime).Error
}

// GetByOrderID 按订单主键读取运行态快照。
func (r *OrderRuntimeRepository) GetByOrderID(ctx context.Context, orderID uint64) (*domain.OrderRuntime, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order runtime repository unavailable")
	}

	var runtime domain.OrderRuntime
	if err := r.db.WithContext(ctx).Where("order_id = ?", orderID).First(&runtime).Error; err != nil {
		return nil, err
	}

	return &runtime, nil
}

// ListByOrderIDs 批量读取多个订单的运行态快照。
func (r *OrderRuntimeRepository) ListByOrderIDs(ctx context.Context, orderIDs []uint64) ([]domain.OrderRuntime, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order runtime repository unavailable")
	}
	if len(orderIDs) == 0 {
		return []domain.OrderRuntime{}, nil
	}

	var runtimes []domain.OrderRuntime
	if err := r.db.WithContext(ctx).Where("order_id IN ?", orderIDs).Find(&runtimes).Error; err != nil {
		return nil, err
	}

	return runtimes, nil
}

// UpdateByOrderID 按订单主键更新运行态字段。
func (r *OrderRuntimeRepository) UpdateByOrderID(ctx context.Context, orderID uint64, updates map[string]interface{}) error {
	if r == nil || r.db == nil {
		return errors.New("order runtime repository unavailable")
	}
	if len(updates) == 0 {
		return errors.New("updates must not be empty")
	}

	result := r.db.WithContext(ctx).
		Model(&domain.OrderRuntime{}).
		Where("order_id = ?", orderID).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}

	now := time.Now().UTC()
	runtime := &domain.OrderRuntime{
		OrderID:                 orderID,
		StatusReason:            "",
		EstimatedGasUsed:        "0",
		GasPriceAtQuote:         "0",
		FeeQuoteAt:              now,
		LastRequiredExecutorFee: "0",
		LastFeeCheckAt:          now,
		LastExecutionCheckAt:    now,
		LastBlockReason:         "",
		SettledAmountOut:        "0",
		SettledExecutorFee:      "0",
		SubmittedTxHash:         "",
		ExecutedTxHash:          "",
		CancelledTxHash:         "",
		LastCheckedBlock:        0,
		CreatedAt:               now,
		UpdatedAt:               now,
	}
	if err := r.db.WithContext(ctx).Create(runtime).Error; err != nil && !IsDuplicateKeyError(err) {
		return err
	}

	return r.db.WithContext(ctx).
		Model(&domain.OrderRuntime{}).
		Where("order_id = ?", orderID).
		Updates(updates).Error
}

func newOrderRuntimeSnapshot(order *domain.Order, now time.Time) *domain.OrderRuntime {
	if order == nil || order.ID == 0 {
		return nil
	}

	createdAt := order.CreatedAt
	if createdAt.IsZero() {
		createdAt = now
	}
	updatedAt := order.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = now
	}

	return &domain.OrderRuntime{
		OrderID:                 order.ID,
		StatusReason:            order.StatusReason,
		EstimatedGasUsed:        numericStringOrZero(order.EstimatedGasUsed),
		GasPriceAtQuote:         numericStringOrZero(order.GasPriceAtQuote),
		FeeQuoteAt:              zeroTimeOr(order.FeeQuoteAt, updatedAt),
		LastRequiredExecutorFee: numericStringOrZero(order.LastRequiredExecutorFee),
		LastFeeCheckAt:          zeroTimeOr(order.LastFeeCheckAt, updatedAt),
		LastExecutionCheckAt:    zeroTimeOr(order.LastExecutionCheckAt, updatedAt),
		LastBlockReason:         order.LastBlockReason,
		SettledAmountOut:        numericStringOrZero(order.SettledAmountOut),
		SettledExecutorFee:      numericStringOrZero(order.SettledExecutorFee),
		SubmittedTxHash:         order.SubmittedTxHash,
		ExecutedTxHash:          order.ExecutedTxHash,
		CancelledTxHash:         order.CancelledTxHash,
		LastCheckedBlock:        order.LastCheckedBlock,
		CreatedAt:               createdAt,
		UpdatedAt:               updatedAt,
	}
}

func numericStringOrZero(value string) string {
	if value == "" {
		return "0"
	}
	return value
}

func zeroTimeOr(value time.Time, fallback time.Time) time.Time {
	if value.IsZero() {
		return fallback
	}
	return value
}
