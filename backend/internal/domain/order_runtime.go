package domain

import "time"

// OrderRuntime 保存订单当前运行态快照，不承载订单定义本身。
type OrderRuntime struct {
	ID                      uint64    `gorm:"primaryKey"`
	OrderID                 uint64    `gorm:"not null;uniqueIndex"`
	StatusReason            string    `gorm:"type:text;not null;default:''"`
	EstimatedGasUsed        string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	GasPriceAtQuote         string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	FeeQuoteAt              time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	LastRequiredExecutorFee string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	LastFeeCheckAt          time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	LastExecutionCheckAt    time.Time `gorm:"not null;default:CURRENT_TIMESTAMP;index"`
	LastBlockReason         string    `gorm:"type:text;not null;default:''"`
	SettledAmountOut        string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	SettledExecutorFee      string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	SubmittedTxHash         string    `gorm:"size:66;not null;default:''"`
	ExecutedTxHash          string    `gorm:"size:66;not null;default:''"`
	CancelledTxHash         string    `gorm:"size:66;not null;default:''"`
	LastCheckedBlock        int64     `gorm:"not null;default:0"`
	CreatedAt               time.Time `gorm:"not null"`
	UpdatedAt               time.Time `gorm:"not null"`
}

// TableName 固定 order_runtime 表名。
func (OrderRuntime) TableName() string {
	return "order_runtime"
}
