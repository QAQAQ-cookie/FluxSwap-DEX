package database

import (
	"fmt"
	"strings"

	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
)

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&domain.AdminAuthNonce{},
		&domain.AdminSession{},
		&domain.TreasuryOperation{},
		&domain.AdminOperationLog{},
		&domain.ChainSyncCursor{},
	); err != nil {
		return err
	}
	return applyPostgresComments(db)
}

type tableComment struct {
	Table   string
	Comment string
}

type columnComment struct {
	Table   string
	Column  string
	Comment string
}

var tableComments = []tableComment{
	{Table: "admin_auth_nonces", Comment: "管理端钱包登录随机数表"},
	{Table: "admin_sessions", Comment: "管理端登录会话表"},
	{Table: "treasury_operations", Comment: "金库治理操作详情表"},
	{Table: "admin_operation_logs", Comment: "管理端操作审计日志表"},
	{Table: "chain_sync_cursors", Comment: "链上事件同步游标表"},
}

var columnComments = []columnComment{
	{Table: "admin_auth_nonces", Column: "id", Comment: "内部自增主键"},
	{Table: "admin_auth_nonces", Column: "wallet_address", Comment: "登录钱包地址"},
	{Table: "admin_auth_nonces", Column: "nonce", Comment: "一次性登录随机数"},
	{Table: "admin_auth_nonces", Column: "message", Comment: "钱包需要签名的登录消息"},
	{Table: "admin_auth_nonces", Column: "expires_at", Comment: "随机数过期时间"},
	{Table: "admin_auth_nonces", Column: "used", Comment: "是否已经使用"},
	{Table: "admin_auth_nonces", Column: "used_at", Comment: "使用时间"},
	{Table: "admin_auth_nonces", Column: "created_at", Comment: "创建时间"},
	{Table: "admin_auth_nonces", Column: "updated_at", Comment: "更新时间"},

	{Table: "admin_sessions", Column: "id", Comment: "内部自增主键"},
	{Table: "admin_sessions", Column: "token_hash", Comment: "会话令牌哈希值"},
	{Table: "admin_sessions", Column: "wallet_address", Comment: "登录钱包地址"},
	{Table: "admin_sessions", Column: "role_code", Comment: "管理员角色编码"},
	{Table: "admin_sessions", Column: "role_label", Comment: "管理员角色中文名称"},
	{Table: "admin_sessions", Column: "expires_at", Comment: "会话过期时间"},
	{Table: "admin_sessions", Column: "revoked_at", Comment: "会话撤销时间"},
	{Table: "admin_sessions", Column: "created_at", Comment: "创建时间"},
	{Table: "admin_sessions", Column: "updated_at", Comment: "更新时间"},

	{Table: "treasury_operations", Column: "id", Comment: "内部自增主键"},
	{Table: "treasury_operations", Column: "operation_id", Comment: "链上治理操作唯一ID"},
	{Table: "treasury_operations", Column: "chain_id", Comment: "链ID"},
	{Table: "treasury_operations", Column: "treasury_address", Comment: "金库合约地址"},
	{Table: "treasury_operations", Column: "operation_type_code", Comment: "操作类型编码，供程序判断"},
	{Table: "treasury_operations", Column: "operation_type_label", Comment: "操作类型中文名称，供页面和数据库查看"},
	{Table: "treasury_operations", Column: "status_code", Comment: "操作状态编码，供程序判断"},
	{Table: "treasury_operations", Column: "status_label", Comment: "操作状态中文名称，供页面和数据库查看"},
	{Table: "treasury_operations", Column: "proposer_address", Comment: "发起排队的钱包地址"},
	{Table: "treasury_operations", Column: "executor_address", Comment: "执行操作的钱包地址"},
	{Table: "treasury_operations", Column: "canceller_address", Comment: "取消操作的钱包地址"},
	{Table: "treasury_operations", Column: "schedule_tx_hash", Comment: "排队交易哈希"},
	{Table: "treasury_operations", Column: "execute_tx_hash", Comment: "执行交易哈希"},
	{Table: "treasury_operations", Column: "cancel_tx_hash", Comment: "取消交易哈希"},
	{Table: "treasury_operations", Column: "ready_at", Comment: "预计可执行时间"},
	{Table: "treasury_operations", Column: "executed_at", Comment: "执行完成时间"},
	{Table: "treasury_operations", Column: "cancelled_at", Comment: "取消完成时间"},
	{Table: "treasury_operations", Column: "params", Comment: "治理操作完整参数JSON"},
	{Table: "treasury_operations", Column: "summary", Comment: "治理操作中文摘要"},
	{Table: "treasury_operations", Column: "created_at", Comment: "创建时间"},
	{Table: "treasury_operations", Column: "updated_at", Comment: "更新时间"},

	{Table: "admin_operation_logs", Column: "id", Comment: "内部自增主键"},
	{Table: "admin_operation_logs", Column: "actor_address", Comment: "操作人钱包地址"},
	{Table: "admin_operation_logs", Column: "module_code", Comment: "管理模块编码，供程序判断"},
	{Table: "admin_operation_logs", Column: "module_label", Comment: "管理模块中文名称"},
	{Table: "admin_operation_logs", Column: "action_code", Comment: "操作动作编码，供程序判断"},
	{Table: "admin_operation_logs", Column: "action_label", Comment: "操作动作中文名称"},
	{Table: "admin_operation_logs", Column: "target_id", Comment: "关联业务对象ID"},
	{Table: "admin_operation_logs", Column: "chain_id", Comment: "链ID"},
	{Table: "admin_operation_logs", Column: "contract_address", Comment: "关联合约地址"},
	{Table: "admin_operation_logs", Column: "tx_hash", Comment: "关联链上交易哈希"},
	{Table: "admin_operation_logs", Column: "result_code", Comment: "操作结果编码，供程序判断"},
	{Table: "admin_operation_logs", Column: "result_label", Comment: "操作结果中文名称"},
	{Table: "admin_operation_logs", Column: "request_data", Comment: "请求参数或操作上下文JSON"},
	{Table: "admin_operation_logs", Column: "created_at", Comment: "创建时间"},

	{Table: "chain_sync_cursors", Column: "id", Comment: "内部自增主键"},
	{Table: "chain_sync_cursors", Column: "chain_id", Comment: "链ID"},
	{Table: "chain_sync_cursors", Column: "contract_address", Comment: "同步目标合约地址"},
	{Table: "chain_sync_cursors", Column: "event_code", Comment: "事件类型编码"},
	{Table: "chain_sync_cursors", Column: "event_label", Comment: "事件类型中文名称"},
	{Table: "chain_sync_cursors", Column: "last_block_number", Comment: "已同步到的最新区块高度"},
	{Table: "chain_sync_cursors", Column: "last_block_hash", Comment: "已同步到的最新区块哈希"},
	{Table: "chain_sync_cursors", Column: "updated_at", Comment: "更新时间"},
	{Table: "chain_sync_cursors", Column: "created_at", Comment: "创建时间"},
}

func applyPostgresComments(db *gorm.DB) error {
	if db == nil || db.Dialector.Name() != "postgres" {
		return nil
	}

	for _, item := range tableComments {
		if err := db.Exec(
			fmt.Sprintf("COMMENT ON TABLE %s IS %s", quoteIdent(item.Table), quoteLiteral(item.Comment)),
		).Error; err != nil {
			return err
		}
	}

	for _, item := range columnComments {
		if err := db.Exec(
			fmt.Sprintf(
				"COMMENT ON COLUMN %s.%s IS %s",
				quoteIdent(item.Table),
				quoteIdent(item.Column),
				quoteLiteral(item.Comment),
			),
		).Error; err != nil {
			return err
		}
	}

	return nil
}

func quoteIdent(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func quoteLiteral(value string) string {
	return `'` + strings.ReplaceAll(value, `'`, `''`) + `'`
}
