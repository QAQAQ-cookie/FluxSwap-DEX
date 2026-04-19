package config

import (
	"fmt"
	"strings"

	"github.com/zeromicro/go-zero/zrpc"
)

// Config 是执行器后端的总配置，会被 RPC、executor、indexer 等进程共同加载。
type Config struct {
	zrpc.RpcServerConf
	App      AppConfig
	Database DatabaseConfig
	Chain    ChainConfig
	Chains   []ChainConfig
	Worker   WorkerConfig
}

// AppConfig 描述应用名称和运行环境等基础信息。
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
	ExecutorScanIntervalMs   int64
	ExecutorBatchSize        int
	ExecutorTxDeadlineSec    int64
	ExecutorEstimatedGasUsed uint64
	ExecutorFeeSafetyBps     int64
	ProtocolBlockedRetryMs   int64
	ReceiptPollIntervalMs    int64
	IndexerHeartbeatMs       int64
	IndexerBackfillBlocks    int64
	ExecutorHealthListenOn   string
	IndexerHealthListenOn    string
}

// ActiveChains 返回当前配置中启用的链列表。
// 若未配置 Chains，则回退到旧的单链 Chain 配置，兼容已有环境。
func (c Config) ActiveChains() []ChainConfig {
	if len(c.Chains) > 0 {
		return c.Chains
	}
	if c.Chain.ChainID > 0 &&
		strings.TrimSpace(c.Chain.SettlementAddress) != "" &&
		(strings.TrimSpace(c.Chain.HTTPRPCURL) != "" || strings.TrimSpace(c.Chain.WSRPCURL) != "") {
		return []ChainConfig{c.Chain}
	}
	return nil
}

// ValidateRPCChains 校验 RPC 进程需要的链配置。
func ValidateRPCChains(chains []ChainConfig) error {
	return validateChains(chains, func(chainCfg ChainConfig) error {
		if strings.TrimSpace(chainCfg.HTTPRPCURL) == "" {
			return fmt.Errorf("rpc chain config missing http rpc url for chain %d", chainCfg.ChainID)
		}
		if strings.TrimSpace(chainCfg.SettlementAddress) == "" {
			return fmt.Errorf("rpc chain config missing settlement address for chain %d", chainCfg.ChainID)
		}
		return nil
	})
}

// ValidateExecutorChains 校验 executor worker 需要的链配置。
func ValidateExecutorChains(chains []ChainConfig) error {
	return validateChains(chains, func(chainCfg ChainConfig) error {
		if strings.TrimSpace(chainCfg.HTTPRPCURL) == "" {
			return fmt.Errorf("executor chain config missing http rpc url for chain %d", chainCfg.ChainID)
		}
		if strings.TrimSpace(chainCfg.SettlementAddress) == "" {
			return fmt.Errorf("executor chain config missing settlement address for chain %d", chainCfg.ChainID)
		}
		if strings.TrimSpace(chainCfg.ExecutorPrivateKey) == "" {
			return fmt.Errorf("executor chain config missing executor private key for chain %d", chainCfg.ChainID)
		}
		return nil
	})
}

// ValidateIndexerChains 校验 indexer worker 需要的链配置。
func ValidateIndexerChains(chains []ChainConfig) error {
	return validateChains(chains, func(chainCfg ChainConfig) error {
		wsURL := strings.TrimSpace(chainCfg.WSRPCURL)
		if wsURL == "" {
			return fmt.Errorf("indexer chain config missing websocket rpc url for chain %d", chainCfg.ChainID)
		}
		lowerWSURL := strings.ToLower(wsURL)
		if !strings.HasPrefix(lowerWSURL, "ws://") && !strings.HasPrefix(lowerWSURL, "wss://") {
			return fmt.Errorf("indexer chain config websocket rpc url must start with ws:// or wss:// for chain %d", chainCfg.ChainID)
		}
		if strings.TrimSpace(chainCfg.SettlementAddress) == "" {
			return fmt.Errorf("indexer chain config missing settlement address for chain %d", chainCfg.ChainID)
		}
		return nil
	})
}

// validateChains 负责复用通用校验逻辑，并允许不同进程追加自己的专属约束。
func validateChains(chains []ChainConfig, extra func(ChainConfig) error) error {
	if len(chains) == 0 {
		return fmt.Errorf("no active chains configured")
	}

	seenTargets := make(map[string]struct{}, len(chains))
	for _, chainCfg := range chains {
		if chainCfg.ChainID <= 0 {
			return fmt.Errorf("chain config missing valid chain id")
		}

		settlementAddress := strings.ToLower(strings.TrimSpace(chainCfg.SettlementAddress))
		targetKey := fmt.Sprintf("%d:%s", chainCfg.ChainID, settlementAddress)
		if _, exists := seenTargets[targetKey]; exists {
			return fmt.Errorf("duplicate chain target configured for chain %d and settlement %s", chainCfg.ChainID, settlementAddress)
		}
		seenTargets[targetKey] = struct{}{}

		if extra != nil {
			if err := extra(chainCfg); err != nil {
				return err
			}
		}
	}

	return nil
}
