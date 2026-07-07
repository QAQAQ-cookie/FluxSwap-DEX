package domain

import "time"

type ChainSyncCursor struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ChainID         int64     `gorm:"not null;uniqueIndex:idx_chain_sync_cursors_target" json:"chainId"`
	ContractAddress string    `gorm:"size:42;not null;uniqueIndex:idx_chain_sync_cursors_target" json:"contractAddress"`
	EventCode       string    `gorm:"size:64;not null;uniqueIndex:idx_chain_sync_cursors_target" json:"eventCode"`
	EventLabel      string    `gorm:"size:64;not null" json:"eventLabel"`
	LastBlockNumber uint64    `gorm:"not null;default:0" json:"lastBlockNumber"`
	LastBlockHash   string    `gorm:"size:66" json:"lastBlockHash,omitempty"`
	UpdatedAt       time.Time `gorm:"not null" json:"updatedAt"`
	CreatedAt       time.Time `gorm:"not null" json:"createdAt"`
}
