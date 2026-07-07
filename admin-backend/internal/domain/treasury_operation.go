package domain

import "time"

type TreasuryOperation struct {
	ID                 uint       `gorm:"primaryKey" json:"id"`
	OperationID        string     `gorm:"size:66;not null;uniqueIndex:idx_treasury_operations_operation_id" json:"operationId"`
	ChainID            int64      `gorm:"not null;index:idx_treasury_operations_chain_target" json:"chainId"`
	TreasuryAddress    string     `gorm:"size:42;not null;index:idx_treasury_operations_chain_target" json:"treasuryAddress"`
	OperationTypeCode  string     `gorm:"size:64;not null;index:idx_treasury_operations_type" json:"operationTypeCode"`
	OperationTypeLabel string     `gorm:"size:64;not null" json:"operationTypeLabel"`
	StatusCode         string     `gorm:"size:32;not null;index:idx_treasury_operations_status" json:"statusCode"`
	StatusLabel        string     `gorm:"size:32;not null" json:"statusLabel"`
	ProposerAddress    string     `gorm:"size:42;not null;index:idx_treasury_operations_proposer" json:"proposerAddress"`
	ExecutorAddress    string     `gorm:"size:42" json:"executorAddress,omitempty"`
	CancellerAddress   string     `gorm:"size:42" json:"cancellerAddress,omitempty"`
	ScheduleTxHash     string     `gorm:"size:66;index:idx_treasury_operations_schedule_tx" json:"scheduleTxHash,omitempty"`
	ExecuteTxHash      string     `gorm:"size:66" json:"executeTxHash,omitempty"`
	CancelTxHash       string     `gorm:"size:66" json:"cancelTxHash,omitempty"`
	ReadyAt            *time.Time `gorm:"index:idx_treasury_operations_ready_at" json:"readyAt,omitempty"`
	ExecutedAt         *time.Time `json:"executedAt,omitempty"`
	CancelledAt        *time.Time `json:"cancelledAt,omitempty"`
	Params             JSONMap    `gorm:"type:jsonb;not null;default:'{}'" json:"params"`
	Summary            string     `gorm:"size:512" json:"summary,omitempty"`
	CreatedAt          time.Time  `gorm:"not null;index:idx_treasury_operations_created_at" json:"createdAt"`
	UpdatedAt          time.Time  `gorm:"not null" json:"updatedAt"`
}
