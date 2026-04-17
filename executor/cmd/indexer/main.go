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
	"fluxswap-executor/worker/indexer"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "executor.yaml", "the config file")

// main 启动单实例多链 indexer worker。
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

	healthServer, err := app.StartHealthServer(c.Worker.IndexerHealthListenOn, "indexer-worker")
	if err != nil {
		log.Fatalf("start indexer health server failed: %v", err)
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
		wg     sync.WaitGroup
		runCtx = context.Background()
		errCh  = make(chan error, len(activeChains))
	)

	for _, chainCfg := range activeChains {
		subscriber, err := indexer.NewSubscriber(db, indexer.Config{
			ChainID:           chainCfg.ChainID,
			RPCURL:            chainCfg.WSRPCURL,
			SettlementAddress: chainCfg.SettlementAddress,
			BackfillBlocks:    c.Worker.IndexerBackfillBlocks,
		})
		if err != nil {
			log.Fatalf("create indexer subscriber failed for chain %d: %v", chainCfg.ChainID, err)
		}

		fmt.Printf("Starting indexer for chain %d on %s...\n", chainCfg.ChainID, chainCfg.SettlementAddress)
		wg.Add(1)
		go func(sub *indexer.Subscriber, chainID int64) {
			defer wg.Done()
			if runErr := sub.Run(runCtx); runErr != nil {
				errCh <- fmt.Errorf("indexer for chain %d exited with error: %w", chainID, runErr)
			}
		}(subscriber, chainCfg.ChainID)
	}

	if healthServer != nil {
		fmt.Printf("Indexer health server listening on %s.\n", c.Worker.IndexerHealthListenOn)
	}

	err = <-errCh
	if err != nil {
		log.Fatal(err)
	}
	wg.Wait()
}
