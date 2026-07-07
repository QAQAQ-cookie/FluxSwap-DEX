package domain

import "time"

type AdminOperationLog struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ActorAddress    string    `gorm:"size:42;not null;index:idx_admin_operation_logs_actor" json:"actorAddress"`
	ModuleCode      string    `gorm:"size:64;not null;index:idx_admin_operation_logs_module" json:"moduleCode"`
	ModuleLabel     string    `gorm:"size:64;not null" json:"moduleLabel"`
	ActionCode      string    `gorm:"size:64;not null;index:idx_admin_operation_logs_action" json:"actionCode"`
	ActionLabel     string    `gorm:"size:64;not null" json:"actionLabel"`
	TargetID        string    `gorm:"size:128;index:idx_admin_operation_logs_target" json:"targetId,omitempty"`
	ChainID         int64     `gorm:"index:idx_admin_operation_logs_chain" json:"chainId,omitempty"`
	ContractAddress string    `gorm:"size:42" json:"contractAddress,omitempty"`
	TxHash          string    `gorm:"size:66;index:idx_admin_operation_logs_tx_hash" json:"txHash,omitempty"`
	ResultCode      string    `gorm:"size:32;not null;index:idx_admin_operation_logs_result" json:"resultCode"`
	ResultLabel     string    `gorm:"size:32;not null" json:"resultLabel"`
	RequestData     JSONMap   `gorm:"type:jsonb;not null;default:'{}'" json:"requestData"`
	CreatedAt       time.Time `gorm:"not null;index:idx_admin_operation_logs_created_at" json:"createdAt"`
}
