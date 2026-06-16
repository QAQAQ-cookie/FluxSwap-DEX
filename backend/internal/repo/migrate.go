package repo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

var legacyOrderRuntimeColumns = []string{
	"status_reason",
	"estimated_gas_used",
	"gas_price_at_quote",
	"fee_quote_at",
	"last_required_executor_fee",
	"last_fee_check_at",
	"last_execution_check_at",
	"last_block_reason",
	"settled_amount_out",
	"settled_executor_fee",
	"submitted_tx_hash",
	"executed_tx_hash",
	"cancelled_tx_hash",
	"last_checked_block",
}

var postgresTableComments = map[string]string{
	"orders":           "限价订单定义表，保存订单静态定义和主状态",
	"order_runtime":    "订单运行态快照表，保存执行检查、成交和链上跟踪信息",
	"order_activities": "订单活动流转表，保存订单生命周期中的业务活动轨迹",
	"order_events":     "链上订单事件表，保存索引器采集到的结算合约事件",
	"sync_cursor":      "同步游标表，保存各消费者的链上同步进度",
}

var postgresColumnComments = map[string]map[string]string{
	"orders": {
		"id":                 "订单内部主键",
		"chain_id":           "订单所属链ID",
		"settlement_address": "结算合约地址",
		"order_hash":         "订单哈希",
		"maker":              "下单钱包地址",
		"input_token":        "卖出代币地址",
		"output_token":       "买入代币地址",
		"amount_in":          "卖出数量，最小单位整数",
		"min_amount_out":     "最少买入数量，最小单位整数",
		"executor_fee":       "用户签名允许的最大执行奖励BPS",
		"executor_fee_token": "执行奖励结算代币地址",
		"trigger_price_x18":  "触发价格，18位精度整数",
		"expiry":             "订单过期时间戳",
		"nonce":              "订单Nonce，用于去重和批量作废",
		"recipient":          "成交收款钱包地址",
		"signature":          "订单EIP-712签名",
		"source":             "订单来源标记",
		"status":             "订单主状态",
		"created_at":         "订单创建时间",
		"updated_at":         "订单最近更新时间",
	},
	"order_runtime": {
		"id":                         "订单运行态内部主键",
		"order_id":                   "关联订单主键",
		"status_reason":              "当前状态原因",
		"estimated_gas_used":         "最近一次估算Gas使用量",
		"gas_price_at_quote":         "最近一次报价时的Gas价格",
		"fee_quote_at":               "最近一次执行费报价时间",
		"last_required_executor_fee": "最近一次计算出的所需执行奖励",
		"last_fee_check_at":          "最近一次执行费检查时间",
		"last_execution_check_at":    "最近一次可执行性检查时间",
		"last_block_reason":          "最近一次阻塞原因",
		"settled_amount_out":         "实际成交输出数量",
		"settled_executor_fee":       "实际支付执行奖励",
		"submitted_tx_hash":          "最近一次执行提交交易哈希",
		"executed_tx_hash":           "最近一次执行成交交易哈希",
		"cancelled_tx_hash":          "最近一次撤单交易哈希",
		"last_checked_block":         "最近一次链上对账区块号",
		"created_at":                 "运行态创建时间",
		"updated_at":                 "运行态最近更新时间",
	},
	"order_activities": {
		"id":                 "订单活动内部主键",
		"order_id":           "关联订单主键",
		"chain_id":           "订单所属链ID",
		"settlement_address": "结算合约地址",
		"order_hash":         "订单哈希",
		"activity_type":      "活动类型",
		"from_status":        "变更前订单状态",
		"to_status":          "变更后订单状态",
		"reason_code":        "活动原因代码",
		"reason_detail":      "活动原因详情",
		"source":             "活动来源模块",
		"actor_address":      "触发动作的钱包地址",
		"tx_hash":            "关联交易哈希",
		"block_number":       "关联区块号",
		"log_index":          "关联日志索引",
		"dedupe_key":         "活动去重键",
		"payload_json":       "活动附加负载JSON",
		"occurred_at":        "活动发生时间",
		"created_at":         "活动入库时间",
	},
	"order_events": {
		"id":                   "链上事件内部主键",
		"chain_id":             "事件所属链ID",
		"contract_address":     "事件来源合约地址",
		"event_name":           "链上事件名称",
		"tx_hash":              "事件交易哈希",
		"log_index":            "事件日志索引",
		"block_number":         "事件区块号",
		"order_hash":           "关联订单哈希",
		"maker":                "关联下单钱包地址",
		"nonce":                "事件中的订单Nonce",
		"min_valid_nonce":      "事件中的最小有效Nonce",
		"gross_amount_out":     "事件中的总输出数量",
		"recipient_amount_out": "事件中的收款输出数量",
		"executor_fee_amount":  "事件中的执行奖励数量",
		"observed_at":          "事件被索引器观察到的时间",
	},
	"sync_cursor": {
		"id":           "游标内部主键",
		"cursor_name":  "游标名称",
		"chain_id":     "游标所属链ID",
		"cursor_value": "兼容旧逻辑的游标值",
		"block_number": "当前同步到的区块号",
		"block_hash":   "当前同步到的区块哈希",
		"updated_at":   "游标更新时间",
	},
}

var postgresIndexComments = map[string]string{
	"idx_order_hash_unique":           "订单业务唯一索引：同一链、同一结算合约、同一订单哈希只能出现一次",
	"idx_order_activity_order":        "订单活动查询索引：按链、结算合约、订单哈希定位活动流",
	"idx_order_events_unique":         "链上事件唯一索引：同一链上同一交易哈希和日志索引只能入库一次",
	"idx_sync_cursor_unique":          "同步游标唯一索引：同一消费者在同一链上只有一个游标",
	"idx_order_runtime_order_id":      "订单运行态唯一索引：每个订单只允许一条运行态快照",
	"idx_order_activities_dedupe_key": "订单活动唯一索引：同一业务活动只记录一次",
}

func init() {
	postgresIndexComments["idx_order_list_by_maker_created"] = "order list query index by chain, maker, created_at, id"
	postgresIndexComments["idx_order_list_by_maker_settlement_created"] = "order list query index by chain, maker, settlement_address, created_at, id"
}

type legacyOrderRecord struct {
	ID                      uint64    `gorm:"primaryKey"`
	ChainID                 int64     `gorm:"not null;index:idx_order_hash_unique,unique"`
	SettlementAddress       string    `gorm:"size:42;not null;index:idx_order_hash_unique,unique"`
	OrderHash               string    `gorm:"size:66;not null;index:idx_order_hash_unique,unique"`
	Maker                   string    `gorm:"size:42;not null;index"`
	InputToken              string    `gorm:"size:42;not null"`
	OutputToken             string    `gorm:"size:42;not null"`
	AmountIn                string    `gorm:"type:numeric(78,0);not null"`
	MinAmountOut            string    `gorm:"type:numeric(78,0);not null"`
	ExecutorFee             string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	ExecutorFeeToken        string    `gorm:"size:42;not null;default:''"`
	TriggerPriceX18         string    `gorm:"type:numeric(78,0);not null"`
	Expiry                  string    `gorm:"type:numeric(78,0);not null"`
	Nonce                   string    `gorm:"type:numeric(78,0);not null"`
	Recipient               string    `gorm:"size:42;not null"`
	Signature               string    `gorm:"type:text;not null"`
	Source                  string    `gorm:"size:32;not null;default:'rpc'"`
	Status                  string    `gorm:"size:32;not null;index"`
	StatusReason            string    `gorm:"type:text;not null;default:''"`
	EstimatedGasUsed        string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	GasPriceAtQuote         string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	FeeQuoteAt              time.Time `gorm:"not null"`
	LastRequiredExecutorFee string    `gorm:"type:numeric(78,0);not null;default:'0'"`
	LastFeeCheckAt          time.Time `gorm:"not null"`
	LastExecutionCheckAt    time.Time `gorm:"not null;index"`
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

func (legacyOrderRecord) TableName() string {
	return "orders"
}

type legacyOrderRuntimeBackfillRow struct {
	ID                      uint64    `gorm:"column:id"`
	StatusReason            string    `gorm:"column:status_reason"`
	EstimatedGasUsed        string    `gorm:"column:estimated_gas_used"`
	GasPriceAtQuote         string    `gorm:"column:gas_price_at_quote"`
	FeeQuoteAt              time.Time `gorm:"column:fee_quote_at"`
	LastRequiredExecutorFee string    `gorm:"column:last_required_executor_fee"`
	LastFeeCheckAt          time.Time `gorm:"column:last_fee_check_at"`
	LastExecutionCheckAt    time.Time `gorm:"column:last_execution_check_at"`
	LastBlockReason         string    `gorm:"column:last_block_reason"`
	SettledAmountOut        string    `gorm:"column:settled_amount_out"`
	SettledExecutorFee      string    `gorm:"column:settled_executor_fee"`
	SubmittedTxHash         string    `gorm:"column:submitted_tx_hash"`
	ExecutedTxHash          string    `gorm:"column:executed_tx_hash"`
	CancelledTxHash         string    `gorm:"column:cancelled_tx_hash"`
	LastCheckedBlock        int64     `gorm:"column:last_checked_block"`
	CreatedAt               time.Time `gorm:"column:created_at"`
	UpdatedAt               time.Time `gorm:"column:updated_at"`
}

func (legacyOrderRuntimeBackfillRow) TableName() string {
	return "orders"
}

// AutoMigrate 初始化执行器后端所需的最小数据库结构。
func AutoMigrate(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database is required")
	}

	if err := db.AutoMigrate(
		&domain.Order{},
		&domain.OrderRuntime{},
		&domain.OrderActivity{},
		&domain.OrderEvent{},
		&domain.SyncCursor{},
	); err != nil {
		return err
	}
	if err := backfillOrderRuntime(db); err != nil {
		return err
	}
	if err := dropLegacyOrderRuntimeColumns(db); err != nil {
		return err
	}
	if err := applyPostgresMetadataComments(db); err != nil {
		return err
	}
	return nil
}

func backfillOrderRuntime(db *gorm.DB) error {
	ctx := context.Background()
	runtimeRepo := NewOrderRuntimeRepository(db)

	var orders []domain.Order
	if err := db.Find(&orders).Error; err != nil {
		return err
	}

	legacyByID, err := loadLegacyOrderRuntimeRows(db)
	if err != nil {
		return err
	}

	for i := range orders {
		existing, getErr := runtimeRepo.GetByOrderID(ctx, orders[i].ID)
		if getErr == nil && existing != nil {
			continue
		}
		if getErr != nil && getErr != gorm.ErrRecordNotFound {
			return getErr
		}

		now := time.Now().UTC()
		runtime := newOrderRuntimeSnapshot(&orders[i], now)
		if runtime == nil {
			continue
		}

		if legacy, ok := legacyByID[orders[i].ID]; ok {
			runtime.StatusReason = legacy.StatusReason
			runtime.EstimatedGasUsed = numericStringOrZero(legacy.EstimatedGasUsed)
			runtime.GasPriceAtQuote = numericStringOrZero(legacy.GasPriceAtQuote)
			runtime.FeeQuoteAt = zeroTimeOr(legacy.FeeQuoteAt, runtime.UpdatedAt)
			runtime.LastRequiredExecutorFee = numericStringOrZero(legacy.LastRequiredExecutorFee)
			runtime.LastFeeCheckAt = zeroTimeOr(legacy.LastFeeCheckAt, runtime.UpdatedAt)
			runtime.LastExecutionCheckAt = zeroTimeOr(legacy.LastExecutionCheckAt, runtime.UpdatedAt)
			runtime.LastBlockReason = legacy.LastBlockReason
			runtime.SettledAmountOut = numericStringOrZero(legacy.SettledAmountOut)
			runtime.SettledExecutorFee = numericStringOrZero(legacy.SettledExecutorFee)
			runtime.SubmittedTxHash = legacy.SubmittedTxHash
			runtime.ExecutedTxHash = legacy.ExecutedTxHash
			runtime.CancelledTxHash = legacy.CancelledTxHash
			runtime.LastCheckedBlock = legacy.LastCheckedBlock
			runtime.CreatedAt = zeroTimeOr(legacy.CreatedAt, runtime.CreatedAt)
			runtime.UpdatedAt = zeroTimeOr(legacy.UpdatedAt, runtime.UpdatedAt)
		}

		if err := runtimeRepo.Create(ctx, runtime); err != nil && !IsDuplicateKeyError(err) {
			return err
		}
	}

	return nil
}

func loadLegacyOrderRuntimeRows(db *gorm.DB) (map[uint64]legacyOrderRuntimeBackfillRow, error) {
	hasAnyLegacyColumn := false
	for _, column := range legacyOrderRuntimeColumns {
		if db.Migrator().HasColumn(&legacyOrderRecord{}, column) {
			hasAnyLegacyColumn = true
			break
		}
	}
	if !hasAnyLegacyColumn {
		return map[uint64]legacyOrderRuntimeBackfillRow{}, nil
	}

	var legacyRows []legacyOrderRuntimeBackfillRow
	if err := db.Table("orders").Find(&legacyRows).Error; err != nil {
		return nil, err
	}

	legacyByID := make(map[uint64]legacyOrderRuntimeBackfillRow, len(legacyRows))
	for i := range legacyRows {
		legacyByID[legacyRows[i].ID] = legacyRows[i]
	}

	return legacyByID, nil
}

func dropLegacyOrderRuntimeColumns(db *gorm.DB) error {
	for _, column := range legacyOrderRuntimeColumns {
		if !db.Migrator().HasColumn(&legacyOrderRecord{}, column) {
			continue
		}
		if err := db.Migrator().DropColumn(&legacyOrderRecord{}, column); err != nil {
			return err
		}
	}
	return nil
}

func applyPostgresMetadataComments(db *gorm.DB) error {
	if !isPostgresDialect(db) {
		return nil
	}

	for tableName, comment := range postgresTableComments {
		statement := fmt.Sprintf(
			"COMMENT ON TABLE %s IS '%s'",
			tableName,
			escapeSQLComment(comment),
		)
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}

	for tableName, columns := range postgresColumnComments {
		for columnName, comment := range columns {
			if !db.Migrator().HasColumn(tableName, columnName) {
				continue
			}
			statement := fmt.Sprintf(
				"COMMENT ON COLUMN %s.%s IS '%s'",
				tableName,
				columnName,
				escapeSQLComment(comment),
			)
			if err := db.Exec(statement).Error; err != nil {
				return err
			}
		}
	}

	for indexName, comment := range postgresIndexComments {
		statement := fmt.Sprintf(
			"COMMENT ON INDEX %s IS '%s'",
			indexName,
			escapeSQLComment(comment),
		)
		if err := db.Exec(statement).Error; err != nil {
			return err
		}
	}

	return nil
}

func escapeSQLComment(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func isPostgresDialect(db *gorm.DB) bool {
	if db == nil || db.Dialector == nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(db.Dialector.Name()), "postgres")
}
