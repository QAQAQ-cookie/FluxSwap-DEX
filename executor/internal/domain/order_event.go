package domain

import "time"

// OrderEvent 记录已经被索引器观察到的一条结算合约事件。
//
// 唯一键为 chain_id + tx_hash + log_index，这样无论是历史回补还是实时重连，都能安全去重。
type OrderEvent struct {
	ID              uint64    `gorm:"primaryKey"`
	ChainID         int64     `gorm:"not null;uniqueIndex:idx_order_events_unique,priority:1"`
	ContractAddress string    `gorm:"size:42;not null"`
	EventName       string    `gorm:"size:64;not null;index"`
	TxHash          string    `gorm:"size:66;not null;uniqueIndex:idx_order_events_unique,priority:2"`
	LogIndex        int64     `gorm:"not null;uniqueIndex:idx_order_events_unique,priority:3"`
	BlockNumber     int64     `gorm:"not null;index"`
	OrderHash       string    `gorm:"size:66;not null;default:'';index"`
	Maker           string    `gorm:"size:42;not null;default:''"`
	Nonce           string    `gorm:"type:numeric(78,0);not null;default:0"`
	MinValidNonce   string    `gorm:"type:numeric(78,0);not null;default:0"`
	ObservedAt      time.Time `gorm:"not null"`
}

// TableName 固定 order_events 表名，供仓储和迁移统一使用。
func (OrderEvent) TableName() string {
	return "order_events"
}
