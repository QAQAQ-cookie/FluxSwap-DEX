package indexer

// 这里定义的是当前索引器支持消费的结算合约事件名称。
const (
	EventOrderExecuted        = "OrderExecuted"
	EventNonceInvalidated     = "NonceInvalidated"
)

// OrderEvent 是从订阅层传给 worker 的标准化事件结构。
type OrderEvent struct {
	ChainID         int64
	ContractAddress string
	EventName       string
	Removed         bool
	TxHash          string
	LogIndex        int64
	BlockNumber     int64
	OrderHash       string
	Maker           string
	Nonce           string
	GrossAmountOut  string
	RecipientAmountOut string
	ExecutorFeeAmount string
}
