package repo

import (
	"context"
	"errors"
	"strings"

	"fluxswap-backend/internal/domain"

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

// DeleteByTxHashAndLogIndex 删除一条已记录的链上事件，并返回是否实际删除。
func (r *OrderEventRepository) DeleteByTxHashAndLogIndex(
	ctx context.Context,
	chainID int64,
	txHash string,
	logIndex int64,
) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("order event repository unavailable")
	}

	result := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND tx_hash = ? AND log_index = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(txHash)),
			logIndex,
		).
		Delete(&domain.OrderEvent{})
	if result.Error != nil {
		return false, result.Error
	}

	return result.RowsAffected > 0, nil
}

// ListByOrderHash 查询某笔订单对应的同类历史事件，按区块与日志顺序返回。
func (r *OrderEventRepository) ListByOrderHash(
	ctx context.Context,
	chainID int64,
	contractAddress string,
	eventName string,
	orderHash string,
) ([]domain.OrderEvent, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order event repository unavailable")
	}

	var events []domain.OrderEvent
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND contract_address = ? AND event_name = ? AND order_hash = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(contractAddress)),
			strings.TrimSpace(eventName),
			strings.ToLower(strings.TrimSpace(orderHash)),
		).
		Order("block_number ASC, log_index ASC").
		Find(&events).Error
	if err != nil {
		return nil, err
	}

	return events, nil
}

// ListByMakerAndNonce 查询同一 maker/nonce 下的同类历史事件，按区块与日志顺序返回。
func (r *OrderEventRepository) ListByMakerAndNonce(
	ctx context.Context,
	chainID int64,
	contractAddress string,
	eventName string,
	maker string,
	nonce string,
) ([]domain.OrderEvent, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("order event repository unavailable")
	}

	var events []domain.OrderEvent
	err := r.db.WithContext(ctx).
		Where(
			"chain_id = ? AND contract_address = ? AND event_name = ? AND maker = ? AND nonce = ?",
			chainID,
			strings.ToLower(strings.TrimSpace(contractAddress)),
			strings.TrimSpace(eventName),
			strings.ToLower(strings.TrimSpace(maker)),
			strings.TrimSpace(nonce),
		).
		Order("block_number ASC, log_index ASC").
		Find(&events).Error
	if err != nil {
		return nil, err
	}

	return events, nil
}

