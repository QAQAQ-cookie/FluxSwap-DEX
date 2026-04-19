package svc

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"sync"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/repo"

	"github.com/ethereum/go-ethereum/common"
	"github.com/zeromicro/go-zero/core/logx"
	"gorm.io/gorm"
)

type ChainClient interface {
	Close()
	SettlementAddress() string
	SuggestExecutorFee(ctx context.Context, outputToken common.Address, estimatedGasUsed uint64, safetyBps int64) (*big.Int, *big.Int, error)
	CurrentBlockTimestamp(ctx context.Context) (uint64, error)
	ValidateCancelTransaction(ctx context.Context, txHash string, maker string, nonce *big.Int) (*chain.CancelTxValidationResult, error)
}

// ServiceContext 保存 RPC 层共用的数据库与链上客户端依赖。
type ServiceContext struct {
	Config       config.Config
	App          AppMeta
	DB           *gorm.DB
	ChainClients map[string]ChainClient
	closeOnce    sync.Once
}

// AppMeta 暴露给逻辑层使用的最小应用元信息。
type AppMeta struct {
	Name string
	Env  string
}

// NewServiceContext 初始化 RPC 运行所需依赖；若链客户端不可用，则直接返回错误，避免服务进入半可用状态。
func NewServiceContext(c config.Config) (*ServiceContext, error) {
	// 先校验 RPC 进程所需的链配置是否完整。
	if err := config.ValidateRPCChains(c.ActiveChains()); err != nil {
		return nil, err
	}
	// RPC 当前只支持 PostgreSQL 作为持久化数据库。
	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") {
		return nil, fmt.Errorf("rpc requires postgres database driver")
	}
	// RPC 必须拿到有效 DSN 才能初始化数据库连接。
	if strings.TrimSpace(c.Database.DSN) == "" {
		return nil, fmt.Errorf("rpc requires database dsn")
	}

	// 先声明数据库句柄变量，便于后面在失败分支里统一回收。
	var db *gorm.DB
	// 打开 PostgreSQL 连接，供后续 logic / repo 共用。
	openedDB, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		return nil, fmt.Errorf("open database failed: %w", err)
	}
	// 如果启用了自动迁移，则在 RPC 启动前先确保表结构就绪。
	if c.Database.AutoMigrate {
		if migrateErr := repo.AutoMigrate(openedDB); migrateErr != nil {
			// 迁移失败时立即关闭刚打开的数据库连接，避免资源泄漏。
			_ = repo.ClosePostgres(openedDB)
			return nil, fmt.Errorf("auto migrate failed: %w", migrateErr)
		}
		logx.Infof("database schema auto-migrated")
	}
	// 把已成功打开的数据库句柄保存下来，供后面组装 ServiceContext 使用。
	db = openedDB
	logx.Infof("database connection initialized for driver=%s", c.Database.Driver)

	// 为每条已激活链准备一个结算客户端，键为 chainId + settlementAddress。
	chainClients := make(map[string]ChainClient)
	// 逐条链初始化 RPC 运行时会用到的链客户端。
	for _, chainCfg := range c.ActiveChains() {
		// 再对单条链做一次局部校验，方便返回更贴近当前链的错误。
		if err := validateRPCChainConfig(chainCfg); err != nil {
			// 某条链配置不合法时，回滚已经初始化过的资源。
			closeChainClients(chainClients)
			if db != nil {
				_ = repo.ClosePostgres(db)
			}
			return nil, err
		}

		// 基于当前链的 HTTP RPC 和结算地址创建链上客户端。
		client, err := chain.NewSettlementClient(chain.SettlementConfig{
			ChainID:            chainCfg.ChainID,
			RPCURL:             chainCfg.HTTPRPCURL,
			SettlementAddress:  chainCfg.SettlementAddress,
			ExecutorPrivateKey: chainCfg.ExecutorPrivateKey,
		})
		if err != nil {
			// 只要任意一条链客户端初始化失败，就整体回滚，避免 RPC 进入半可用状态。
			closeChainClients(chainClients)
			if db != nil {
				_ = repo.ClosePostgres(db)
			}
			return nil, fmt.Errorf("initialize settlement client failed for chain %d: %w", chainCfg.ChainID, err)
		}

		// 把当前链客户端按唯一键收进 map，供后续 logic 按链查找。
		chainClients[buildChainClientKey(chainCfg.ChainID, chainCfg.SettlementAddress)] = client
	}

	// 所有依赖都准备完成后，组装并返回 RPC 共享上下文。
	return &ServiceContext{
		Config: c,
		App: AppMeta{
			// 透传应用名，供逻辑层做最小元信息展示。
			Name: c.App.Name,
			// 透传运行环境，供逻辑层或日志层判断当前模式。
			Env: c.App.Env,
		},
		// 保存数据库连接，供 repo 层复用。
		DB: db,
		// 保存所有链客户端，供 logic 按链路由。
		ChainClients: chainClients,
	}, nil
}

// LookupChainClient 按 chainId 和 settlementAddress 获取链上结算客户端。
func (s *ServiceContext) LookupChainClient(chainID int64, settlementAddress string) ChainClient {
	if s == nil {
		return nil
	}
	// 按统一键格式从共享 map 中取出对应链客户端。
	return s.ChainClients[buildChainClientKey(chainID, settlementAddress)]
}

// Close 释放 ServiceContext 持有的链连接与数据库连接。
func (s *ServiceContext) Close() {
	if s == nil {
		return
	}
	// 保证 Close 多次调用时只真正执行一次资源释放。
	s.closeOnce.Do(func() {
		// 先关闭所有链客户端，断开底层 RPC 连接。
		closeChainClients(s.ChainClients)
		// 再关闭数据库连接池。
		if err := repo.ClosePostgres(s.DB); err != nil {
			logx.Errorf("close database failed: %v", err)
		}
	})
}

// buildChainClientKey 用 chainId + settlementAddress 生成 RPC 层内部唯一键。
func buildChainClientKey(chainID int64, settlementAddress string) string {
	// 统一把 settlementAddress 归一化成小写，避免大小写差异造成 key 不一致。
	return fmt.Sprintf("%d:%s", chainID, strings.ToLower(strings.TrimSpace(settlementAddress)))
}

// validateRPCChainConfig 复用配置层规则，对单条链配置做启动前校验。
func validateRPCChainConfig(chainCfg config.ChainConfig) error {
	// 复用配置层的链校验逻辑，这里只包装成单条链校验入口。
	return config.ValidateRPCChains([]config.ChainConfig{chainCfg})
}

// closeChainClients 统一关闭已经成功创建的链客户端，便于启动失败时回滚资源。
func closeChainClients(chainClients map[string]ChainClient) {
	// 逐个关闭已经成功创建的链客户端。
	for _, client := range chainClients {
		if client != nil {
			client.Close()
		}
	}
}
