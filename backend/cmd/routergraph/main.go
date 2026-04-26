package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"fluxswap-backend/internal/config"
	backendredis "fluxswap-backend/redis"
	graphrepo "fluxswap-backend/redis/routergraph"
	graphworker "fluxswap-backend/worker/routergraph"

	"github.com/zeromicro/go-zero/core/conf"
)

var (
	configFile     = flag.String("f", "executor.yaml", "the config file")
	runOnce        = flag.Bool("once", false, "sync router graph once and exit")
	printNeighbors = flag.String("print-neighbors", "", "print token neighbors from redis and exit")
	printPair      = flag.String("print-pair", "", "print pair metadata from redis and exit")
	chainIDFlag    = flag.Int64("chain-id", 0, "chain id used by print commands")
)

func main() {
	flag.Parse()

	var c config.Config
	if err := conf.Load(*configFile, &c); err != nil {
		log.Fatal(err)
	}

	if !c.RedisClient.Enabled {
		log.Fatal("routergraph worker requires RedisClient.Enabled=true")
	}

	activeChains := c.ActiveChains()
	if err := config.ValidateRPCChains(activeChains); err != nil {
		log.Fatalf("invalid routergraph chain config: %v", err)
	}

	redisStore, err := backendredis.New(c.RedisClient)
	if err != nil {
		log.Fatalf("initialize redis client failed: %v", err)
	}
	defer func() {
		if closeErr := redisStore.Close(); closeErr != nil {
			log.Printf("close redis client failed: %v", closeErr)
		}
	}()

	if *printNeighbors != "" || *printPair != "" {
		if *chainIDFlag <= 0 {
			log.Fatal("print commands require -chain-id")
		}
		if err := printFromRedis(context.Background(), redisStore, *chainIDFlag, *printNeighbors, *printPair); err != nil {
			log.Fatal(err)
		}
		return
	}

	if *runOnce {
		if err := syncAllChainsOnce(context.Background(), c, redisStore, activeChains); err != nil {
			log.Fatal(err)
		}
		return
	}

	runCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	for _, chainCfg := range activeChains {
		fmt.Printf("Starting routergraph worker for chain %d on settlement %s...\n", chainCfg.ChainID, chainCfg.SettlementAddress)
		wg.Add(1)
		go func(chainCfg config.ChainConfig) {
			defer wg.Done()
			runRouterGraphSupervisor(runCtx, chainCfg, c, redisStore)
		}(chainCfg)
	}

	wg.Wait()
}

func syncAllChainsOnce(ctx context.Context, c config.Config, redisStore backendredis.Store, activeChains []config.ChainConfig) error {
	for _, chainCfg := range activeChains {
		workerInstance, err := graphworker.NewWorker(graphworker.Config{
			ChainID:           chainCfg.ChainID,
			RPCURL:            chainCfg.HTTPRPCURL,
			WSRPCURL:          chainCfg.WSRPCURL,
			SettlementAddress: chainCfg.SettlementAddress,
			SyncInterval:      time.Duration(c.Worker.RouterGraphSyncIntervalMs) * time.Millisecond,
			BackfillBlocks:    c.Worker.RouterGraphBackfillBlocks,
		}, redisStore)
		if err != nil {
			return fmt.Errorf("initialize routergraph worker for chain %d: %w", chainCfg.ChainID, err)
		}

		err = workerInstance.SyncOnce(ctx)
		workerInstance.Close()
		if err != nil {
			return fmt.Errorf("sync routergraph once for chain %d: %w", chainCfg.ChainID, err)
		}
	}
	return nil
}

func printFromRedis(ctx context.Context, redisStore backendredis.Store, chainID int64, token string, pairAddress string) error {
	store := graphrepo.NewRedisStore(redisStore)

	if token != "" {
		neighbors, found, err := store.GetTokenNeighbors(ctx, chainID, token)
		if err != nil {
			return err
		}
		if !found {
			return fmt.Errorf("token neighbors not found for chain %d token %s", chainID, token)
		}
		return printJSON(neighbors)
	}

	metadata, found, err := store.GetPairMetadata(ctx, chainID, pairAddress)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("pair metadata not found for chain %d pair %s", chainID, pairAddress)
	}
	return printJSON(metadata)
}

func printJSON(value interface{}) error {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(payload))
	return nil
}

func runRouterGraphSupervisor(ctx context.Context, chainCfg config.ChainConfig, c config.Config, redisStore backendredis.Store) {
	restartDelay := 3 * time.Second

	for {
		workerInstance, err := graphworker.NewWorker(graphworker.Config{
			ChainID:           chainCfg.ChainID,
			RPCURL:            chainCfg.HTTPRPCURL,
			WSRPCURL:          chainCfg.WSRPCURL,
			SettlementAddress: chainCfg.SettlementAddress,
			SyncInterval:      time.Duration(c.Worker.RouterGraphSyncIntervalMs) * time.Millisecond,
			BackfillBlocks:    c.Worker.RouterGraphBackfillBlocks,
		}, redisStore)
		if err != nil {
			log.Printf("routergraph worker init failed for chain %d: %v", chainCfg.ChainID, err)
		} else {
			runErr := workerInstance.Run(ctx)
			workerInstance.Close()
			if runErr != nil && !errors.Is(runErr, context.Canceled) {
				log.Printf("routergraph worker for chain %d exited with error: %v", chainCfg.ChainID, runErr)
			} else if runErr == nil {
				log.Printf("routergraph worker for chain %d exited unexpectedly without error", chainCfg.ChainID)
			}
			if errors.Is(runErr, context.Canceled) {
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
