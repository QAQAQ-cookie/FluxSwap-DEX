package domain

import "time"

// Order 表示链下保存的一笔签名限价单。
//
// 业务唯一键为 chain_id + settlement_address + order_hash。
// 合约里的大整数统一用十进制字符串保存，避免在 JSON、gRPC、PostgreSQL 和 Go 之间传递时丢失精度。
type Order struct {
	ID                uint64    `gorm:"primaryKey"`
	ChainID           int64     `gorm:"not null;index:idx_order_hash_unique,unique"`
	SettlementAddress string    `gorm:"size:42;not null;index:idx_order_hash_unique,unique"`
	OrderHash         string    `gorm:"size:66;not null;index:idx_order_hash_unique,unique"`
	Maker             string    `gorm:"size:42;not null;index"`
	InputToken        string    `gorm:"size:42;not null"`
	OutputToken       string    `gorm:"size:42;not null"`
	AmountIn          string    `gorm:"type:numeric(78,0);not null"`
	MinAmountOut      string    `gorm:"type:numeric(78,0);not null"`
	ExecutorFee       string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	ExecutorFeeToken  string    `gorm:"size:42;not null;default:''"`
	TriggerPriceX18   string    `gorm:"type:numeric(78,0);not null"`
	Expiry            string    `gorm:"type:numeric(78,0);not null"`
	Nonce             string    `gorm:"type:numeric(78,0);not null"`
	Recipient         string    `gorm:"size:42;not null"`
	Signature         string    `gorm:"type:text;not null"`
	Source            string    `gorm:"size:32;not null;default:'rpc'"`
	Status            string    `gorm:"size:32;not null;index"`
	StatusReason      string    `gorm:"type:text;not null;default:''"`
	EstimatedGasUsed  string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	GasPriceAtQuote   string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	FeeQuoteAt        time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	LastRequiredExecutorFee string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	LastFeeCheckAt    time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	LastExecutionCheckAt time.Time `gorm:"not null;default:CURRENT_TIMESTAMP"`
	LastBlockReason   string    `gorm:"type:text;not null;default:''"`
	SettledAmountOut  string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	SettledExecutorFee string   `gorm:"type:numeric(78,0);not null;default:'0'"`
	SubmittedTxHash   string    `gorm:"size:66;not null;default:''"`
	ExecutedTxHash    string    `gorm:"size:66;not null;default:''"`
	CancelledTxHash   string    `gorm:"size:66;not null;default:''"`
	LastCheckedBlock  int64     `gorm:"not null;default:0"`
	CreatedAt         time.Time `gorm:"not null"`
	UpdatedAt         time.Time `gorm:"not null"`
}

// TableName 固定 orders 表名，避免 Gorm 版本变化带来表名漂移。
func (Order) TableName() string {
	return "orders"
}
