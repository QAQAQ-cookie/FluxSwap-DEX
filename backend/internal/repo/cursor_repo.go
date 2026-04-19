package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SyncCursorRepository 负责保存和更新索引器断点游标。
type SyncCursorRepository struct {
	db *gorm.DB
}

// CursorPosition 描述索引器已经安全处理完成的精确日志位置。
type CursorPosition struct {
	BlockNumber int64
	BlockHash   string
	LogIndex    int64
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

// GetPosition 读取游标的块高和日志索引位置。
func (r *SyncCursorRepository) GetPosition(ctx context.Context, cursorName string, chainID int64) (*CursorPosition, error) {
	cursor, err := r.Get(ctx, cursorName, chainID)
	if err != nil {
		return nil, err
	}

	position := &CursorPosition{
		BlockNumber: cursor.BlockNumber,
		BlockHash:   strings.ToLower(strings.TrimSpace(cursor.BlockHash)),
		LogIndex:    -1,
	}
	if strings.TrimSpace(cursor.CursorValue) == "" {
		return position, nil
	}

	var logIndex int64
	if _, scanErr := fmt.Sscanf(cursor.CursorValue, "log_index:%d", &logIndex); scanErr != nil {
		return nil, fmt.Errorf("parse cursor value: %w", scanErr)
	}
	position.LogIndex = logIndex
	return position, nil
}

// Upsert 更新某个消费者最近处理到的区块高度。
func (r *SyncCursorRepository) Upsert(ctx context.Context, cursorName string, chainID int64, blockNumber int64) error {
	return r.UpsertPosition(ctx, cursorName, chainID, blockNumber, "", -1)
}

// UpsertPosition 更新游标到某个具体的日志位置，避免同一区块内部分日志丢失。
func (r *SyncCursorRepository) UpsertPosition(
	ctx context.Context,
	cursorName string,
	chainID int64,
	blockNumber int64,
	blockHash string,
	logIndex int64,
) error {
	if r == nil || r.db == nil {
		return errors.New("sync cursor repository unavailable")
	}

	cursorValue := ""
	if logIndex >= 0 {
		cursorValue = fmt.Sprintf("log_index:%d", logIndex)
	}

	cursor := &domain.SyncCursor{
		CursorName:  strings.TrimSpace(cursorName),
		ChainID:     chainID,
		CursorValue: cursorValue,
		BlockNumber: blockNumber,
		BlockHash:   strings.ToLower(strings.TrimSpace(blockHash)),
		UpdatedAt:   time.Now().UTC(),
	}

	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "cursor_name"}, {Name: "chain_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"cursor_value", "block_number", "block_hash", "updated_at"}),
		}).
		Create(cursor).Error
}

