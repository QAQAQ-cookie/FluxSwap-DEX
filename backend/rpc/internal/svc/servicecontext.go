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
	backendredis "fluxswap-backend/redis"
	graphrepo "fluxswap-backend/redis/routergraph"

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

type RouterQuoteClient interface {
	Close()
	GetAmountsOut(ctx context.Context, amountIn *big.Int, path []common.Address) ([]*big.Int, error)
	GetAmountsIn(ctx context.Context, amountOut *big.Int, path []common.Address) ([]*big.Int, error)
	SuggestGasPrice(ctx context.Context) (*big.Int, error)
	WETHAddress() common.Address
}

// ServiceContext 保存 RPC 层共享的数据库、Redis 与链上客户端依赖。
type ServiceContext struct {
	Config       config.Config
	App          AppMeta
	DB           *gorm.DB
	Redis        backendredis.Store
	RouterGraph  graphrepo.Store
	ChainClients map[string]ChainClient
	RouteQuotes  map[string]RouterQuoteClient
	closeOnce    sync.Once
}

// AppMeta 暴露给逻辑层使用的最小应用元信息。
type AppMeta struct {
	Name string
	Env  string
}

// NewServiceContext 初始化 RPC 运行所需依赖；若关键依赖不可用，则直接返回错误，
// 避免服务进入半可用状态。
func NewServiceContext(c config.Config) (*ServiceContext, error) {
	// 先校验 RPC 进程所需的链配置是否完整。
	activeChains := c.ActiveChains()
	if err := config.ValidateRPCChains(activeChains); err != nil {
		return nil, err
	}
	if err := validateRouteQuoteChains(activeChains); err != nil {
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

	// 先声明资源变量，便于后续在失败分支里统一回收。
	var db *gorm.DB
	var redisStore backendredis.Store

	// 打开 PostgreSQL 连接，供后续 logic / repo 复用。
	openedDB, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		return nil, fmt.Errorf("open database failed: %w", err)
	}
	// 如果启用了自动迁移，则在 RPC 启动前先确保表结构就绪。
	if c.Database.AutoMigrate {
		if migrateErr := repo.AutoMigrate(openedDB); migrateErr != nil {
			// 迁移失败时立刻关闭刚打开的数据库连接，避免资源泄漏。
			_ = repo.ClosePostgres(openedDB)
			return nil, fmt.Errorf("auto migrate failed: %w", migrateErr)
		}
		logx.Infof("database schema auto-migrated")
	}

	// 保存已成功打开的数据库句柄，供后续组装 ServiceContext 使用。
	db = openedDB
	logx.Infof("database connection initialized for driver=%s", c.Database.Driver)

	redisStore, err = backendredis.New(c.RedisClient)
	if err != nil {
		if db != nil {
			_ = repo.ClosePostgres(db)
		}
		return nil, fmt.Errorf("initialize redis failed: %w", err)
	}

	// 为每条已启用链准备一组 RPC 依赖。
	// 结算客户端仍按 chainId + settlementAddress 建索引，供限价单相关接口按具体结算合约查找。
	// 路由报价客户端只按 chainId 建索引，供普通找路接口复用当前链唯一的一套路由环境。
	chainClients := make(map[string]ChainClient)
	routeQuotes := make(map[string]RouterQuoteClient)

	// 逐条链初始化 RPC 运行时会用到的链客户端。
	for _, chainCfg := range activeChains {
		// 再对单条链做一次局部校验，方便返回更贴近当前链的错误。
		if err := validateRPCChainConfig(chainCfg); err != nil {
			// 某条链配置不合法时，回滚已经初始化过的资源。
			closeChainClients(chainClients)
			closeRouteQuoteClients(routeQuotes)
			if db != nil {
				_ = repo.ClosePostgres(db)
			}
			return nil, err
		}

		// 基于当前链的 HTTP RPC 和结算地址创建链上客户端。
		client, err := chain.NewSettlementClient(chain.SettlementConfig{
			ChainID:            chainCfg.ChainID,
			RPCURL:             chainCfg.HTTPRPCURL,
			WSRPCURL:           chainCfg.WSRPCURL,
			SettlementAddress:  chainCfg.SettlementAddress,
			ExecutorPrivateKey: chainCfg.ExecutorPrivateKey,
		})
		if err != nil {
			// 只要任意一条链客户端初始化失败，就整体回滚，避免 RPC 进入半可用状态。
			closeChainClients(chainClients)
			closeRouteQuoteClients(routeQuotes)
			if redisStore != nil {
				_ = redisStore.Close()
			}
			if db != nil {
				_ = repo.ClosePostgres(db)
			}
			return nil, fmt.Errorf("initialize settlement client failed for chain %d: %w", chainCfg.ChainID, err)
		}

		// 把当前链客户端按唯一键收进 map，供后续 logic 按链查找。
		clientKey := buildChainClientKey(chainCfg.ChainID, chainCfg.SettlementAddress)
		chainClients[clientKey] = client
		routeQuoteKey := buildChainOnlyKey(chainCfg.ChainID)

		routeQuoteClient, err := chain.NewRouterQuoteClient(chain.SettlementConfig{
			ChainID:           chainCfg.ChainID,
			RPCURL:            chainCfg.HTTPRPCURL,
			SettlementAddress: chainCfg.SettlementAddress,
		})
		if err != nil {
			closeChainClients(chainClients)
			closeRouteQuoteClients(routeQuotes)
			if redisStore != nil {
				_ = redisStore.Close()
			}
			if db != nil {
				_ = repo.ClosePostgres(db)
			}
			return nil, fmt.Errorf("initialize router quote client failed for chain %d: %w", chainCfg.ChainID, err)
		}
		routeQuotes[routeQuoteKey] = routeQuoteClient
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
		// 保存 Redis 连接，供路由图谱读取复用。
		Redis: redisStore,
		// 保存路由图谱读仓库。
		RouterGraph: graphrepo.NewRedisStore(redisStore),
		// 保存所有链客户端，供 logic 按链路由。
		ChainClients: chainClients,
		// 保存所有路由报价客户端，供路径搜索报价。
		RouteQuotes: routeQuotes,
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

// LookupRouteQuoteClient 按 chainId 获取当前链唯一的一套路由报价客户端。
func (s *ServiceContext) LookupRouteQuoteClient(chainID int64) RouterQuoteClient {
	if s == nil {
		return nil
	}
	return s.RouteQuotes[buildChainOnlyKey(chainID)]
}

// Close 释放 ServiceContext 持有的链连接、Redis 与数据库连接。
func (s *ServiceContext) Close() {
	if s == nil {
		return
	}
	// 保证 Close 多次调用时只真正执行一次资源释放。
	s.closeOnce.Do(func() {
		// 先关闭所有链客户端，断开底层 RPC 连接。
		closeChainClients(s.ChainClients)
		closeRouteQuoteClients(s.RouteQuotes)
		if s.Redis != nil {
			if err := s.Redis.Close(); err != nil {
				logx.Errorf("close redis failed: %v", err)
			}
		}
		// 再关闭数据库连接池。
		if err := repo.ClosePostgres(s.DB); err != nil {
			logx.Errorf("close database failed: %v", err)
		}
	})
}

// buildChainClientKey 用 chainId + settlementAddress 生成 RPC 层内部唯一键。
func buildChainClientKey(chainID int64, settlementAddress string) string {
	// 统一把 settlementAddress 归一化成小写，避免大小写差异导致 key 不一致。
	return fmt.Sprintf("%d:%s", chainID, strings.ToLower(strings.TrimSpace(settlementAddress)))
}

// buildChainOnlyKey 为按链索引的路由报价客户端生成唯一键。
func buildChainOnlyKey(chainID int64) string {
	return fmt.Sprintf("%d", chainID)
}

func validateRouteQuoteChains(chains []config.ChainConfig) error {
	seen := make(map[string]struct{}, len(chains))
	for _, chainCfg := range chains {
		key := buildChainOnlyKey(chainCfg.ChainID)
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate route quote target configured for chain %d", chainCfg.ChainID)
		}
		seen[key] = struct{}{}
	}
	return nil
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

// closeRouteQuoteClients 统一关闭按链维护的 router 报价客户端。
func closeRouteQuoteClients(routeQuotes map[string]RouterQuoteClient) {
	for _, client := range routeQuotes {
		if client != nil {
			client.Close()
		}
	}
}
