package domain

import "time"

// SyncCursor 保存后台消费者最近一次处理到的区块位置。
//
// 每个游标由 cursor_name + chain_id 共同限定，便于不同合约或不同 worker 独立断点续跑。
type SyncCursor struct {
	ID          uint64    `gorm:"primaryKey"`
	CursorName  string    `gorm:"size:128;not null;uniqueIndex:idx_sync_cursor_unique,priority:1"`
	ChainID     int64     `gorm:"not null;uniqueIndex:idx_sync_cursor_unique,priority:2"`
	CursorValue string    `gorm:"size:255;not null;default:''"`
	BlockNumber int64     `gorm:"not null;default:0"`
	BlockHash   string    `gorm:"size:66;not null;default:''"`
	UpdatedAt   time.Time `gorm:"not null"`
}

// TableName 固定 sync_cursor 表名，供仓储和迁移统一使用。
func (SyncCursor) TableName() string {
	return "sync_cursor"
}
