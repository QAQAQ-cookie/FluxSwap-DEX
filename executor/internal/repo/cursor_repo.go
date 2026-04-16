package repo

import (
	"context"
	"errors"
	"strings"
	"time"

	"fluxswap-executor/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SyncCursorRepository 负责保存和更新索引器断点游标。
type SyncCursorRepository struct {
	db *gorm.DB
}

// NewSyncCursorRepository 基于给定的 Gorm 连接创建游标仓储。
func NewSyncCursorRepository(db *gorm.DB) *SyncCursorRepository {
	return &SyncCursorRepository{db: db}
}

// Get 读取某个消费者在指定链上的当前断点位置。
func (r *SyncCursorRepository) Get(ctx context.Context, cursorName string, chainID int64) (*domain.SyncCursor, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("sync cursor repository unavailable")
	}

	var cursor domain.SyncCursor
	err := r.db.WithContext(ctx).
		Where("cursor_name = ? AND chain_id = ?", strings.TrimSpace(cursorName), chainID).
		First(&cursor).Error
	if err != nil {
		return nil, err
	}

	return &cursor, nil
}

// Upsert 更新某个消费者最近处理到的区块高度。
func (r *SyncCursorRepository) Upsert(ctx context.Context, cursorName string, chainID int64, blockNumber int64) error {
	if r == nil || r.db == nil {
		return errors.New("sync cursor repository unavailable")
	}

	cursor := &domain.SyncCursor{
		CursorName:  strings.TrimSpace(cursorName),
		ChainID:     chainID,
		CursorValue: "",
		BlockNumber: blockNumber,
		UpdatedAt:   time.Now().UTC(),
	}

	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "cursor_name"}, {Name: "chain_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"cursor_value", "block_number", "updated_at"}),
		}).
		Create(cursor).Error
}
