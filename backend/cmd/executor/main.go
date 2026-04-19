package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"fluxswap-backend/internal/app"
	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/repo"
	executorworker "fluxswap-backend/worker/executor"

	"github.com/zeromicro/go-zero/core/conf"
	"gorm.io/gorm"
)

var configFile = flag.String("f", "executor.yaml", "the config file")

// main 启动单实例多链 executor worker；单链故障只会重试该链，不会拖垮整个进程。
func main() {
	// 解析命令行参数，读取 -f 指定的配置文件路径。
	flag.Parse()

	// 准备接收完整后端配置。
	var c config.Config
	// 从配置文件加载数据库、多链和执行器参数。
	if err := conf.Load(*configFile, &c); err != nil {
		// 配置加载失败时直接退出，避免错误配置继续运行。
		log.Fatal(err)
	}

	// 目前执行器只支持 PostgreSQL 作为持久化存储。
	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") {
		log.Fatalf("unsupported database driver: %s", c.Database.Driver)
	}

	// 建立执行器与数据库之间的共享连接。
	db, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		log.Fatalf("open database failed: %v", err)
	}
	// 进程退出时关闭数据库连接池。
	defer func() {
		if closeErr := repo.ClosePostgres(db); closeErr != nil {
			log.Printf("close database failed: %v", closeErr)
		}
	}()
	// 开发环境允许启动时自动建表。
	if c.Database.AutoMigrate {
		if err := repo.AutoMigrate(db); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	// 启动执行器自己的健康检查 HTTP 服务。
	healthServer, err := app.StartHealthServer(c.Worker.ExecutorHealthListenOn, "executor-worker")
	if err != nil {
		log.Fatalf("start executor health server failed: %v", err)
	}
	// 保存健康状态对象，后续每条链的 supervisor 都会回写状态。
	var healthState *app.HealthState
	if healthServer != nil {
		healthState = healthServer.State()
	}
	// 进程退出时优雅关闭健康检查服务。
	if healthServer != nil {
		defer func() {
			// 给关闭流程一个短超时，避免退出时无限等待。
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = healthServer.Close(shutdownCtx)
		}()
	}

	// 提取当前真正启用的链配置列表。
	activeChains := c.ActiveChains()
	// 校验执行器运行所需的链配置是否完整。
	if err := config.ValidateExecutorChains(activeChains); err != nil {
		log.Fatalf("invalid executor chain config: %v", err)
	}

	// 创建可响应 SIGINT / SIGTERM 的总上下文，用于优雅停机。
	runCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	// main 退出时释放信号监听。
	defer stop()
	// 用 WaitGroup 等待所有链的 goroutine 退出后再结束进程。
	var wg sync.WaitGroup
	// 为每一条激活链各启动一个执行器 supervisor。
	for _, chainCfg := range activeChains {
		fmt.Printf("Starting executor worker supervisor for chain %d on settlement %s...\n", chainCfg.ChainID, chainCfg.SettlementAddress)
		// 每启动一个 goroutine 前先登记一个待完成计数。
		wg.Add(1)
		go func(chainCfg config.ChainConfig) {
			// 该链 goroutine 退出时归还 WaitGroup 计数。
			defer wg.Done()
			// 持续管理当前链的执行器 worker 生命周期。
			runExecutorSupervisor(runCtx, db, c, chainCfg, healthState)
		}(chainCfg)
	}

	// 对外打印健康检查监听地址，便于调试和探针接入。
	if healthServer != nil {
		fmt.Printf("Executor health server listening on %s.\n", c.Worker.ExecutorHealthListenOn)
	}

	// 阻塞等待所有链的 supervisor 完整退出。
	wg.Wait()
}

// runExecutorSupervisor 以“单链一个 supervisor”的方式持续拉起执行器 worker。
//
// 某条链的初始化失败、运行报错或 RPC 抖动，只会影响该链自己的 worker，
// 不会把同进程里其他链的执行循环一起带崩。
func runExecutorSupervisor(ctx context.Context, db *gorm.DB, c config.Config, chainCfg config.ChainConfig, healthState *app.HealthState) {
	restartDelay := 3 * time.Second
	componentKey := fmt.Sprintf("executor-chain-%d", chainCfg.ChainID)
	if healthState != nil {
		healthState.MarkStartingComponent(componentKey, fmt.Sprintf("executor starting on chain %d", chainCfg.ChainID))
	}
	for {
		workerInstance, err := executorworker.NewWorker(db, executorworker.Config{
			ChainID:                      chainCfg.ChainID,
			RPCURL:                       chainCfg.HTTPRPCURL,
			SettlementAddress:            chainCfg.SettlementAddress,
			ExecutorPrivateKey:           chainCfg.ExecutorPrivateKey,
			ScanInterval:                 time.Duration(c.Worker.ExecutorScanIntervalMs) * time.Millisecond,
			ReceiptPollInterval:          time.Duration(c.Worker.ReceiptPollIntervalMs) * time.Millisecond,
			BatchSize:                    c.Worker.ExecutorBatchSize,
			TxDeadline:                   time.Duration(c.Worker.ExecutorTxDeadlineSec) * time.Second,
			EstimatedGasUsed:             c.Worker.ExecutorEstimatedGasUsed,
			FeeSafetyBps:                 c.Worker.ExecutorFeeSafetyBps,
			ProtocolBlockedRetryInterval: time.Duration(c.Worker.ProtocolBlockedRetryMs) * time.Millisecond,
		})
		if err != nil {
			if healthState != nil {
				healthState.MarkDegradedComponent(componentKey, fmt.Sprintf("executor init failed on chain %d: %v", chainCfg.ChainID, err))
			}
			log.Printf("executor worker init failed for chain %d: %v", chainCfg.ChainID, err)
		} else {
			if healthState != nil {
				healthState.MarkHealthyComponent(componentKey, fmt.Sprintf("executor running on chain %d", chainCfg.ChainID))
			}
			runErr := workerInstance.Run(ctx)
			workerInstance.Close()
			if runErr != nil && !errors.Is(runErr, context.Canceled) {
				if healthState != nil {
					healthState.MarkDegradedComponent(componentKey, fmt.Sprintf("executor loop failed on chain %d: %v", chainCfg.ChainID, runErr))
				}
				log.Printf("executor worker for chain %d exited with error: %v", chainCfg.ChainID, runErr)
			} else if runErr == nil {
				if healthState != nil {
					healthState.MarkDegradedComponent(componentKey, fmt.Sprintf("executor loop exited unexpectedly on chain %d", chainCfg.ChainID))
				}
				log.Printf("executor worker for chain %d exited unexpectedly without error", chainCfg.ChainID)
			}
			if errors.Is(runErr, context.Canceled) {
				if healthState != nil {
					healthState.MarkHealthyComponent(componentKey, fmt.Sprintf("executor stopped on chain %d", chainCfg.ChainID))
				}
				return
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(restartDelay):
		}
	}
}

