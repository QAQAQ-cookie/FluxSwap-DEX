package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"fluxswap-executor/internal/app"
	"fluxswap-executor/internal/config"
	"fluxswap-executor/internal/repo"
	executorworker "fluxswap-executor/worker/executor"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "executor.yaml", "the config file")

// main 启动单实例多链 executor worker。
func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	if !strings.EqualFold(strings.TrimSpace(c.Database.Driver), "postgres") {
		log.Fatalf("unsupported database driver: %s", c.Database.Driver)
	}

	db, err := repo.OpenPostgres(c.Database.DSN)
	if err != nil {
		log.Fatalf("open database failed: %v", err)
	}
	if c.Database.AutoMigrate {
		if err := repo.AutoMigrate(db); err != nil {
			log.Fatalf("auto migrate failed: %v", err)
		}
	}

	healthServer, err := app.StartHealthServer(c.Worker.ExecutorHealthListenOn, "executor-worker")
	if err != nil {
		log.Fatalf("start executor health server failed: %v", err)
	}
	if healthServer != nil {
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = healthServer.Close(shutdownCtx)
		}()
	}

	activeChains := c.ActiveChains()
	if len(activeChains) == 0 {
		log.Fatalf("no active chains configured")
	}

	var (
		wg      sync.WaitGroup
		runCtx  = context.Background()
		errCh   = make(chan error, len(activeChains))
		workers []*executorworker.Worker
	)

	for _, chainCfg := range activeChains {
		workerInstance, err := executorworker.NewWorker(db, executorworker.Config{
			ChainID:             chainCfg.ChainID,
			RPCURL:              chainCfg.HTTPRPCURL,
			SettlementAddress:   chainCfg.SettlementAddress,
			ExecutorPrivateKey:  chainCfg.ExecutorPrivateKey,
			ScanInterval:        time.Duration(c.Worker.ExecutorScanIntervalMs) * time.Millisecond,
			ReceiptPollInterval: time.Duration(c.Worker.ReceiptPollIntervalMs) * time.Millisecond,
			BatchSize:           c.Worker.ExecutorBatchSize,
			TxDeadline:          time.Duration(c.Worker.ExecutorTxDeadlineSec) * time.Second,
			EstimatedGasUsed:    c.Worker.ExecutorEstimatedGasUsed,
			FeeSafetyBps:        c.Worker.ExecutorFeeSafetyBps,
		})
		if err != nil {
			log.Fatalf("create executor worker failed for chain %d: %v", chainCfg.ChainID, err)
		}
		workers = append(workers, workerInstance)

		fmt.Printf("Starting executor worker for chain %d on settlement %s...\n", chainCfg.ChainID, chainCfg.SettlementAddress)
		wg.Add(1)
		go func(worker *executorworker.Worker, chainID int64) {
			defer wg.Done()
			if runErr := worker.Run(runCtx); runErr != nil {
				errCh <- fmt.Errorf("executor worker for chain %d exited with error: %w", chainID, runErr)
			}
		}(workerInstance, chainCfg.ChainID)
	}

	defer func() {
		for _, worker := range workers {
			if worker != nil {
				worker.Close()
			}
		}
	}()

	if healthServer != nil {
		fmt.Printf("Executor health server listening on %s.\n", c.Worker.ExecutorHealthListenOn)
	}

	err = <-errCh
	if err != nil {
		log.Fatal(err)
	}
	wg.Wait()
}
