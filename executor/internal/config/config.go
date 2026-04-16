package config

import "github.com/zeromicro/go-zero/zrpc"

// Config 是执行器后端的总配置结构，会被 RPC、executor、indexer 等进程共同加载。
type Config struct {
	zrpc.RpcServerConf
	App      AppConfig
	Database DatabaseConfig
	Chain    ChainConfig
	Chains   []ChainConfig
	Worker   WorkerConfig
}

// AppConfig 描述应用名称和运行环境等基础元信息。
type AppConfig struct {
	Name string
	Env  string
}

// DatabaseConfig 控制 PostgreSQL 连接方式，以及是否在启动时自动建表。
type DatabaseConfig struct {
	Driver      string
	DSN         string
	AutoMigrate bool
}

// ChainConfig 保存链连接和结算合约执行所需的关键参数。
type ChainConfig struct {
	Name               string
	ChainID            int64
	HTTPRPCURL         string
	WSRPCURL           string
	SettlementAddress  string
	ExecutorPrivateKey string
}

// WorkerConfig 控制后台 worker 的轮询节奏、批量大小和健康检查监听地址。
type WorkerConfig struct {
	ExecutorScanIntervalMs int64
	ExecutorBatchSize      int
	ExecutorTxDeadlineSec  int64
	ExecutorEstimatedGasUsed uint64
	ExecutorFeeSafetyBps   int64
	ReceiptPollIntervalMs  int64
	IndexerHeartbeatMs     int64
	IndexerBackfillBlocks  int64
	ExecutorHealthListenOn string
	IndexerHealthListenOn  string
}

// ActiveChains 返回当前配置中启用的链列表。
// 若未配置 Chains，则回退到旧的单链 Chain 配置，兼容已有环境。
func (c Config) ActiveChains() []ChainConfig {
	if len(c.Chains) > 0 {
		return c.Chains
	}
	if c.Chain.ChainID > 0 || c.Chain.HTTPRPCURL != "" || c.Chain.WSRPCURL != "" || c.Chain.SettlementAddress != "" {
		return []ChainConfig{c.Chain}
	}
	return nil
}
