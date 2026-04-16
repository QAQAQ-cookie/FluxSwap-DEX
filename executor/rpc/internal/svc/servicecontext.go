package svc

import (
	"fmt"
	"strings"

	"fluxswap-executor/internal/chain"
	"fluxswap-executor/internal/config"
	"fluxswap-executor/internal/repo"

	"github.com/zeromicro/go-zero/core/logx"
	"gorm.io/gorm"
)

// ServiceContext 保存 RPC 逻辑层需要共用的依赖。
type ServiceContext struct {
	Config        config.Config
	App           AppMeta
	DB            *gorm.DB
	ChainClients  map[string]*chain.SettlementClient
}

// AppMeta 对外暴露给逻辑层使用的少量应用元信息。
type AppMeta struct {
	Name string
	Env  string
}

// NewServiceContext 初始化 RPC 进程运行所需的共享依赖。
func NewServiceContext(c config.Config) *ServiceContext {
	var db *gorm.DB
	if strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") && strings.TrimSpace(c.Database.DSN) != "" {
		openedDB, err := repo.OpenPostgres(c.Database.DSN)
		if err != nil {
			logx.Errorf("open database failed: %v", err)
		} else {
			if c.Database.AutoMigrate {
				if migrateErr := repo.AutoMigrate(openedDB); migrateErr != nil {
					logx.Errorf("auto migrate failed: %v", migrateErr)
				} else {
					logx.Infof("database schema auto-migrated")
				}
			}
			db = openedDB
			logx.Infof("database connection initialized for driver=%s", c.Database.Driver)
		}
	}

	chainClients := make(map[string]*chain.SettlementClient)
	for _, chainCfg := range c.ActiveChains() {
		if chainCfg.ChainID <= 0 ||
			strings.TrimSpace(chainCfg.HTTPRPCURL) == "" ||
			strings.TrimSpace(chainCfg.SettlementAddress) == "" ||
			strings.TrimSpace(chainCfg.ExecutorPrivateKey) == "" {
			continue
		}

		client, err := chain.NewSettlementClient(chain.SettlementConfig{
			ChainID:            chainCfg.ChainID,
			RPCURL:             chainCfg.HTTPRPCURL,
			SettlementAddress:  chainCfg.SettlementAddress,
			ExecutorPrivateKey: chainCfg.ExecutorPrivateKey,
		})
		if err != nil {
			logx.Errorf("initialize settlement client failed for chain %d: %v", chainCfg.ChainID, err)
			continue
		}

		chainClients[buildChainClientKey(chainCfg.ChainID, chainCfg.SettlementAddress)] = client
	}

	return &ServiceContext{
		Config: c,
		App: AppMeta{
			Name: c.App.Name,
			Env:  c.App.Env,
		},
		DB:           db,
		ChainClients: chainClients,
	}
}

// LookupChainClient 按 chainId 和 settlementAddress 获取链上结算客户端。
func (s *ServiceContext) LookupChainClient(chainID int64, settlementAddress string) *chain.SettlementClient {
	if s == nil {
		return nil
	}
	return s.ChainClients[buildChainClientKey(chainID, settlementAddress)]
}

// Close 释放 ServiceContext 中持有的链上连接资源。
func (s *ServiceContext) Close() {
	if s == nil {
		return
	}
	for _, client := range s.ChainClients {
		if client != nil {
			client.Close()
		}
	}
}

func buildChainClientKey(chainID int64, settlementAddress string) string {
	return fmt.Sprintf("%d:%s", chainID, strings.ToLower(strings.TrimSpace(settlementAddress)))
}
