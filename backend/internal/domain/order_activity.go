package domain

import "time"

const (
	OrderActivityTypeCreated            = "order_created"
	OrderActivityTypeExecutionClaimed   = "execution_claimed"
	OrderActivityTypeExecutionBlocked   = "execution_blocked"
	OrderActivityTypeExecutionSubmitted = "execution_submitted"
	OrderActivityTypeExecutionConfirmed = "execution_confirmed"
	OrderActivityTypeExecutionReverted  = "execution_reverted"
	OrderActivityTypeCancelRequested    = "cancel_requested"
	OrderActivityTypeCancelSubmitted    = "cancel_submitted"
	OrderActivityTypeCancelConfirmed    = "cancel_confirmed"
	OrderActivityTypeOrderExpired       = "order_expired"
	OrderActivityTypeOrderReopened      = "order_reopened"
	OrderActivityTypeOrderFinalized     = "order_finalized"
	OrderActivityTypeChainReconciled    = "chain_state_reconciled"
	OrderActivityTypeReorgRestored      = "reorg_restored"
)

const (
	OrderActivitySourceRPC      = "rpc"
	OrderActivitySourceExecutor = "executor"
	OrderActivitySourceIndexer  = "indexer"
	OrderActivitySourceSystem   = "system"
)

// OrderActivity 记录订单在系统内的业务流转轨迹。
type OrderActivity struct {
	ID                uint64    `gorm:"primaryKey"`
	OrderID           uint64    `gorm:"not null;index"`
	ChainID           int64     `gorm:"not null;index:idx_order_activity_order,priority:1"`
	SettlementAddress string    `gorm:"size:42;not null;index:idx_order_activity_order,priority:2"`
	OrderHash         string    `gorm:"size:66;not null;index:idx_order_activity_order,priority:3"`
	ActivityType      string    `gorm:"size:64;not null;index"`
	FromStatus        string    `gorm:"size:32;not null;default:''"`
	ToStatus          string    `gorm:"size:32;not null;default:''"`
	ReasonCode        string    `gorm:"size:128;not null;default:'';index"`
	ReasonDetail      string    `gorm:"type:text;not null;default:''"`
	Source            string    `gorm:"size:32;not null;default:'';index"`
	ActorAddress      string    `gorm:"size:42;not null;default:''"`
	TxHash            string    `gorm:"size:66;not null;default:'';index"`
	BlockNumber       int64     `gorm:"not null;default:0"`
	LogIndex          int64     `gorm:"not null;default:0"`
	DedupeKey         string    `gorm:"size:191;not null;uniqueIndex"`
	PayloadJSON       string    `gorm:"type:text;not null;default:''"`
	OccurredAt        time.Time `gorm:"not null;index"`
	CreatedAt         time.Time `gorm:"not null"`
}

// TableName 固定 order_activities 表名。
func (OrderActivity) TableName() string {
	return "order_activities"
}
