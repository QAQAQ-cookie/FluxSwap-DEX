package routergraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"fluxswap-backend/internal/chain"
	backendredis "fluxswap-backend/redis"
	graphrepo "fluxswap-backend/redis/routergraph"
	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
)

type Config struct {
	ChainID           int64
	RPCURL            string
	WSRPCURL          string
	SettlementAddress string
	SyncInterval      time.Duration
	BackfillBlocks    int64
}

type graphChainClient interface {
	Close()
	ListPairs(ctx context.Context) ([]chain.PairDescriptor, error)
	SubscribePairCreated(ctx context.Context, sink chan<- chain.PairCreatedEvent) (ethereum.Subscription, error)
	BlockNumber(ctx context.Context) (uint64, error)
	FilterPairCreated(ctx context.Context, fromBlock uint64, toBlock uint64) ([]chain.PairCreatedEvent, error)
	FactoryAddress() common.Address
}

type graphStore interface {
	SavePairMetadata(ctx context.Context, metadata graphrepo.PairMetadata, ttl time.Duration) error
	GetPairMetadata(ctx context.Context, chainID int64, pairAddress string) (graphrepo.PairMetadata, bool, error)
	SaveTokenNeighbors(ctx context.Context, neighbors graphrepo.TokenNeighbors, ttl time.Duration) error
	GetTokenNeighbors(ctx context.Context, chainID int64, token string) (graphrepo.TokenNeighbors, bool, error)
	SaveSyncCursor(ctx context.Context, cursor graphrepo.SyncCursor, ttl time.Duration) error
	GetSyncCursor(ctx context.Context, chainID int64, factoryAddress string) (graphrepo.SyncCursor, bool, error)
}

type Worker struct {
	cfg         Config
	chainClient graphChainClient
	store       graphStore
}

func NewWorker(cfg Config, redisStore backendredis.Store) (*Worker, error) {
	if cfg.ChainID <= 0 {
		return nil, fmt.Errorf("chain id is required")
	}
	if strings.TrimSpace(cfg.RPCURL) == "" {
		return nil, fmt.Errorf("rpc url is required")
	}
	if strings.TrimSpace(cfg.SettlementAddress) == "" {
		return nil, fmt.Errorf("settlement address is required")
	}
	if cfg.SyncInterval <= 0 {
		cfg.SyncInterval = time.Minute
	}

	chainClient, err := chain.NewRouterGraphClient(chain.SettlementConfig{
		ChainID:           cfg.ChainID,
		RPCURL:            cfg.RPCURL,
		WSRPCURL:          cfg.WSRPCURL,
		SettlementAddress: cfg.SettlementAddress,
	})
	if err != nil {
		return nil, err
	}

	return &Worker{
		cfg:         cfg,
		chainClient: chainClient,
		store:       graphrepo.NewRedisStore(redisStore),
	}, nil
}

func (w *Worker) Store() graphStore {
	if w == nil {
		return nil
	}
	return w.store
}

func (w *Worker) Close() {
	if w != nil && w.chainClient != nil {
		w.chainClient.Close()
	}
}

func (w *Worker) Run(ctx context.Context) error {
	if err := w.SyncOnce(ctx); err != nil {
		return err
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	errCh := make(chan error, 2)
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := w.runScanner(runCtx); err != nil && !errors.Is(err, context.Canceled) {
			errCh <- err
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := w.runSubscriber(runCtx); err != nil && !errors.Is(err, context.Canceled) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		cancel()
		wg.Wait()
		return ctx.Err()
	case err := <-errCh:
		cancel()
		wg.Wait()
		return err
	}
}

func (w *Worker) runScanner(ctx context.Context) error {
	ticker := time.NewTicker(w.cfg.SyncInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := w.SyncOnce(ctx); err != nil {
				return err
			}
		}
	}
}

func (w *Worker) runSubscriber(ctx context.Context) error {
	if err := w.backfillPairCreatedLogs(ctx); err != nil {
		return err
	}

	eventCh := make(chan chain.PairCreatedEvent, 128)
	sub, err := w.chainClient.SubscribePairCreated(ctx, eventCh)
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-sub.Err():
			if err == nil {
				return nil
			}
			return err
		case event, ok := <-eventCh:
			if !ok {
				return fmt.Errorf("pair created channel closed")
			}
			if err := w.applyPairEvent(ctx, event, true); err != nil {
				return err
			}
		}
	}
}

func (w *Worker) SyncOnce(ctx context.Context) error {
	if w == nil {
		return fmt.Errorf("router graph worker is nil")
	}

	pairs, err := w.chainClient.ListPairs(ctx)
	if err != nil {
		return err
	}

	neighborSets := make(map[string]map[string]struct{})
	updatedAt := time.Now().Unix()

	for _, pair := range pairs {
		token0 := strings.ToLower(pair.Token0.Hex())
		token1 := strings.ToLower(pair.Token1.Hex())

		metadata := graphrepo.PairMetadata{
			ChainID:     w.cfg.ChainID,
			PairAddress: strings.ToLower(pair.PairAddress.Hex()),
			Token0:      token0,
			Token1:      token1,
		}
		if err := w.savePairMetadataIfMissing(ctx, metadata); err != nil {
			return fmt.Errorf("save pair metadata for %s: %w", pair.PairAddress.Hex(), err)
		}

		appendNeighbor(neighborSets, token0, token1)
		appendNeighbor(neighborSets, token1, token0)
	}

	for token, set := range neighborSets {
		neighbors := make([]string, 0, len(set))
		for neighbor := range set {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		if err := w.saveTokenNeighborsIfChanged(ctx, graphrepo.TokenNeighbors{
			ChainID:   w.cfg.ChainID,
			Token:     token,
			Neighbors: neighbors,
			UpdatedAt: updatedAt,
		}); err != nil {
			return fmt.Errorf("save token neighbors for %s: %w", token, err)
		}
	}

	fmt.Printf("routergraph sync finished for chain %d with %d pairs\n", w.cfg.ChainID, len(pairs))
	return nil
}

func (w *Worker) applyPairEvent(ctx context.Context, event chain.PairCreatedEvent, advanceCursor bool) error {
	if w == nil {
		return fmt.Errorf("router graph worker is nil")
	}

	updatedAt := time.Now().Unix()
	token0 := strings.ToLower(event.Token0.Hex())
	token1 := strings.ToLower(event.Token1.Hex())
	pairAddress := strings.ToLower(event.PairAddress.Hex())

	if err := w.savePairMetadataIfMissing(ctx, graphrepo.PairMetadata{
		ChainID:     w.cfg.ChainID,
		PairAddress: pairAddress,
		Token0:      token0,
		Token1:      token1,
	}); err != nil {
		return fmt.Errorf("save pair metadata for %s: %w", pairAddress, err)
	}

	if err := w.mergeAndSaveNeighbors(ctx, token0, token1, updatedAt); err != nil {
		return fmt.Errorf("save token neighbors for %s: %w", token0, err)
	}

	if err := w.mergeAndSaveNeighbors(ctx, token1, token0, updatedAt); err != nil {
		return fmt.Errorf("save token neighbors for %s: %w", token1, err)
	}

	if advanceCursor {
		if err := w.saveSyncCursor(ctx, event); err != nil {
			return fmt.Errorf("save sync cursor for pair %s: %w", pairAddress, err)
		}
	}

	fmt.Printf("routergraph pair created synced for chain %d pair %s\n", w.cfg.ChainID, pairAddress)
	return nil
}

func (w *Worker) savePairMetadataIfMissing(ctx context.Context, metadata graphrepo.PairMetadata) error {
	_, found, err := w.store.GetPairMetadata(ctx, metadata.ChainID, metadata.PairAddress)
	if err != nil {
		return err
	}
	if found {
		return nil
	}

	return w.store.SavePairMetadata(ctx, metadata, 0)
}

func (w *Worker) saveTokenNeighborsIfChanged(ctx context.Context, neighbors graphrepo.TokenNeighbors) error {
	existing, found, err := w.store.GetTokenNeighbors(ctx, neighbors.ChainID, neighbors.Token)
	if err != nil {
		return err
	}
	if found && sameNeighbors(existing.Neighbors, neighbors.Neighbors) {
		return nil
	}

	return w.store.SaveTokenNeighbors(ctx, neighbors, 0)
}

func (w *Worker) backfillPairCreatedLogs(ctx context.Context) error {
	latestBlock, err := w.chainClient.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("get latest block number: %w", err)
	}

	cursor, found, err := w.store.GetSyncCursor(ctx, w.cfg.ChainID, w.chainClient.FactoryAddress().Hex())
	if err != nil {
		return fmt.Errorf("load routergraph sync cursor: %w", err)
	}

	fromBlock := uint64(0)
	if found {
		fromBlock = cursor.BlockNumber
	} else if w.cfg.BackfillBlocks > 0 && latestBlock+1 > uint64(w.cfg.BackfillBlocks) {
		fromBlock = latestBlock - uint64(w.cfg.BackfillBlocks) + 1
	}

	if fromBlock > latestBlock {
		return nil
	}

	events, err := w.chainClient.FilterPairCreated(ctx, fromBlock, latestBlock)
	if err != nil {
		return err
	}

	if len(events) > 0 {
		fmt.Printf("routergraph backfill loaded %d pair created events from block %d to %d\n", len(events), fromBlock, latestBlock)
	}

	for _, event := range events {
		if shouldSkipPairCreated(cursor, found, event) {
			continue
		}
		if err := w.applyPairEvent(ctx, event, true); err != nil {
			return err
		}
	}

	if len(events) == 0 {
		if err := w.store.SaveSyncCursor(ctx, graphrepo.SyncCursor{
			ChainID:        w.cfg.ChainID,
			FactoryAddress: strings.ToLower(w.chainClient.FactoryAddress().Hex()),
			BlockNumber:    latestBlock,
			UpdatedAt:      time.Now().Unix(),
		}, 0); err != nil {
			return fmt.Errorf("save idle sync cursor: %w", err)
		}
	}

	return nil
}

func (w *Worker) saveSyncCursor(ctx context.Context, event chain.PairCreatedEvent) error {
	return w.store.SaveSyncCursor(ctx, graphrepo.SyncCursor{
		ChainID:        w.cfg.ChainID,
		FactoryAddress: strings.ToLower(w.chainClient.FactoryAddress().Hex()),
		BlockNumber:    event.BlockNumber,
		BlockHash:      strings.ToLower(event.BlockHash.Hex()),
		LogIndex:       event.LogIndex,
		UpdatedAt:      time.Now().Unix(),
	}, 0)
}

func shouldSkipPairCreated(cursor graphrepo.SyncCursor, found bool, event chain.PairCreatedEvent) bool {
	if !found {
		return false
	}
	if event.BlockNumber != cursor.BlockNumber {
		return false
	}

	cursorBlockHash := strings.ToLower(strings.TrimSpace(cursor.BlockHash))
	eventBlockHash := strings.ToLower(event.BlockHash.Hex())
	if cursorBlockHash != "" && eventBlockHash != "" && cursorBlockHash != eventBlockHash {
		return false
	}

	return event.LogIndex <= cursor.LogIndex
}

func (w *Worker) mergeAndSaveNeighbors(ctx context.Context, token string, neighbor string, updatedAt int64) error {
	existing, found, err := w.store.GetTokenNeighbors(ctx, w.cfg.ChainID, token)
	if err != nil {
		return err
	}

	neighborSet := make(map[string]struct{})
	if found {
		for _, item := range existing.Neighbors {
			neighborSet[item] = struct{}{}
		}
	}
	neighborSet[neighbor] = struct{}{}

	neighbors := make([]string, 0, len(neighborSet))
	for item := range neighborSet {
		neighbors = append(neighbors, item)
	}
	sort.Strings(neighbors)

	return w.store.SaveTokenNeighbors(ctx, graphrepo.TokenNeighbors{
		ChainID:   w.cfg.ChainID,
		Token:     token,
		Neighbors: neighbors,
		UpdatedAt: updatedAt,
	}, 0)
}

func appendNeighbor(neighborSets map[string]map[string]struct{}, token string, neighbor string) {
	if _, exists := neighborSets[token]; !exists {
		neighborSets[token] = make(map[string]struct{})
	}
	neighborSets[token][neighbor] = struct{}{}
}

func sameNeighbors(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}

	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}

	return true
}
