package routergraph

import (
	"context"
	"errors"
	"testing"
	"time"

	"fluxswap-backend/internal/chain"
	backendredis "fluxswap-backend/redis"
	graphrepo "fluxswap-backend/redis/routergraph"
	ethereum "github.com/ethereum/go-ethereum"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
)

func TestSyncOnceSavesPairsAndNeighbors(t *testing.T) {
	store := &stubGraphStore{}
	worker := &Worker{
		cfg: Config{
			ChainID: 31337,
		},
		chainClient: &stubGraphChainClient{
			pairs: []chain.PairDescriptor{
				{
					PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000aa"),
					Token0:      common.HexToAddress("0x0000000000000000000000000000000000000001"),
					Token1:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
				},
				{
					PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000bb"),
					Token0:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
					Token1:      common.HexToAddress("0x0000000000000000000000000000000000000003"),
				},
			},
		},
		store: store,
	}

	err := worker.SyncOnce(context.Background())

	require.NoError(t, err)
	require.Len(t, store.savedPairs, 2)
	require.Len(t, store.savedNeighbors, 3)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000002",
	}, store.savedNeighbors["0x0000000000000000000000000000000000000001"].Neighbors)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000001",
		"0x0000000000000000000000000000000000000003",
	}, store.savedNeighbors["0x0000000000000000000000000000000000000002"].Neighbors)
}

func TestApplyPairEventSavesIncrementalPairMetadata(t *testing.T) {
	store := &stubGraphStore{
		savedNeighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000001": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000001",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000003",
				},
			},
		},
	}
	worker := &Worker{
		cfg: Config{
			ChainID: 31337,
		},
		store: store,
	}

	err := worker.applyPairEvent(context.Background(), chain.PairCreatedEvent{
		PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000aa"),
		Token0:      common.HexToAddress("0x0000000000000000000000000000000000000001"),
		Token1:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
	}, false)

	require.NoError(t, err)
	require.Contains(t, store.savedPairs, "0x00000000000000000000000000000000000000aa")
	require.Contains(t, store.savedNeighbors, "0x0000000000000000000000000000000000000001")
	require.Contains(t, store.savedNeighbors, "0x0000000000000000000000000000000000000002")
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000002",
		"0x0000000000000000000000000000000000000003",
	}, store.savedNeighbors["0x0000000000000000000000000000000000000001"].Neighbors)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000001",
	}, store.savedNeighbors["0x0000000000000000000000000000000000000002"].Neighbors)
}

type stubGraphChainClient struct {
	pairs          []chain.PairDescriptor
	subscribeErr   error
	blockNumber    uint64
	filteredEvents []chain.PairCreatedEvent
}

func (s *stubGraphChainClient) Close() {}

func (s *stubGraphChainClient) ListPairs(ctx context.Context) ([]chain.PairDescriptor, error) {
	return s.pairs, nil
}

func (s *stubGraphChainClient) SubscribePairCreated(ctx context.Context, sink chan<- chain.PairCreatedEvent) (ethereum.Subscription, error) {
	if s.subscribeErr != nil {
		return nil, s.subscribeErr
	}
	return &stubSubscription{errCh: make(chan error)}, nil
}

func (s *stubGraphChainClient) BlockNumber(ctx context.Context) (uint64, error) {
	return s.blockNumber, nil
}

func (s *stubGraphChainClient) FilterPairCreated(ctx context.Context, fromBlock uint64, toBlock uint64) ([]chain.PairCreatedEvent, error) {
	return s.filteredEvents, nil
}

func (s *stubGraphChainClient) FactoryAddress() common.Address {
	return common.HexToAddress("0x00000000000000000000000000000000000000ff")
}

type stubGraphStore struct {
	savedPairs     map[string]graphrepo.PairMetadata
	savedNeighbors map[string]graphrepo.TokenNeighbors
	savedCursor    graphrepo.SyncCursor
	hasCursor      bool
	pairSaveCalls  int
	neighborSaves  int
}

func (s *stubGraphStore) SavePairMetadata(ctx context.Context, metadata graphrepo.PairMetadata, ttl time.Duration) error {
	if s.savedPairs == nil {
		s.savedPairs = make(map[string]graphrepo.PairMetadata)
	}
	s.pairSaveCalls++
	s.savedPairs[metadata.PairAddress] = metadata
	return nil
}

func (s *stubGraphStore) GetPairMetadata(ctx context.Context, chainID int64, pairAddress string) (graphrepo.PairMetadata, bool, error) {
	if s.savedPairs == nil {
		return graphrepo.PairMetadata{}, false, nil
	}

	metadata, ok := s.savedPairs[pairAddress]
	return metadata, ok, nil
}

func (s *stubGraphStore) SaveTokenNeighbors(ctx context.Context, neighbors graphrepo.TokenNeighbors, ttl time.Duration) error {
	if s.savedNeighbors == nil {
		s.savedNeighbors = make(map[string]graphrepo.TokenNeighbors)
	}
	s.neighborSaves++
	s.savedNeighbors[neighbors.Token] = neighbors
	return nil
}

func (s *stubGraphStore) GetTokenNeighbors(ctx context.Context, chainID int64, token string) (graphrepo.TokenNeighbors, bool, error) {
	if s.savedNeighbors == nil {
		return graphrepo.TokenNeighbors{}, false, nil
	}

	neighbors, ok := s.savedNeighbors[token]
	return neighbors, ok, nil
}

func (s *stubGraphStore) SaveSyncCursor(ctx context.Context, cursor graphrepo.SyncCursor, ttl time.Duration) error {
	s.savedCursor = cursor
	s.hasCursor = true
	return nil
}

func (s *stubGraphStore) GetSyncCursor(ctx context.Context, chainID int64, factoryAddress string) (graphrepo.SyncCursor, bool, error) {
	return s.savedCursor, s.hasCursor, nil
}

func (s *stubGraphStore) RawStore() backendredis.Store {
	return nil
}

type stubSubscription struct {
	errCh chan error
}

func (s *stubSubscription) Unsubscribe() {
	close(s.errCh)
}

func (s *stubSubscription) Err() <-chan error {
	return s.errCh
}

func TestRunSubscriberReturnsSubscriptionError(t *testing.T) {
	worker := &Worker{
		cfg: Config{
			ChainID: 31337,
		},
		chainClient: &stubGraphChainClient{
			subscribeErr: errors.New("subscribe failed"),
		},
		store: &stubGraphStore{},
	}

	err := worker.runSubscriber(context.Background())

	require.Error(t, err)
	require.Contains(t, err.Error(), "subscribe failed")
}

func TestBackfillPairCreatedLogsSkipsProcessedCursor(t *testing.T) {
	store := &stubGraphStore{
		savedCursor: graphrepo.SyncCursor{
			ChainID:        31337,
			FactoryAddress: "0x00000000000000000000000000000000000000ff",
			BlockNumber:    100,
			BlockHash:      "0x00000000000000000000000000000000000000000000000000000000000000aa",
			LogIndex:       1,
		},
		hasCursor: true,
	}
	worker := &Worker{
		cfg: Config{
			ChainID: 31337,
		},
		chainClient: &stubGraphChainClient{
			blockNumber: 101,
			filteredEvents: []chain.PairCreatedEvent{
				{
					PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000aa"),
					Token0:      common.HexToAddress("0x0000000000000000000000000000000000000001"),
					Token1:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
					BlockNumber: 100,
					BlockHash:   common.HexToHash("0x00000000000000000000000000000000000000000000000000000000000000aa"),
					LogIndex:    1,
				},
				{
					PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000bb"),
					Token0:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
					Token1:      common.HexToAddress("0x0000000000000000000000000000000000000003"),
					BlockNumber: 100,
					BlockHash:   common.HexToHash("0x00000000000000000000000000000000000000000000000000000000000000aa"),
					LogIndex:    2,
				},
			},
		},
		store: store,
	}

	err := worker.backfillPairCreatedLogs(context.Background())

	require.NoError(t, err)
	require.NotContains(t, store.savedPairs, "0x00000000000000000000000000000000000000aa")
	require.Contains(t, store.savedPairs, "0x00000000000000000000000000000000000000bb")
	require.True(t, store.hasCursor)
	require.Equal(t, uint64(100), store.savedCursor.BlockNumber)
	require.Equal(t, uint(2), store.savedCursor.LogIndex)
}

func TestBackfillPairCreatedLogsAdvancesCursorWhenNoEvents(t *testing.T) {
	store := &stubGraphStore{}
	worker := &Worker{
		cfg: Config{
			ChainID:        31337,
			BackfillBlocks: 10,
		},
		chainClient: &stubGraphChainClient{
			blockNumber:    25,
			filteredEvents: nil,
		},
		store: store,
	}

	err := worker.backfillPairCreatedLogs(context.Background())

	require.NoError(t, err)
	require.True(t, store.hasCursor)
	require.Equal(t, uint64(25), store.savedCursor.BlockNumber)
	require.Equal(t, "0x00000000000000000000000000000000000000ff", store.savedCursor.FactoryAddress)
}

func TestSyncOnceSkipsExistingPairAndUnchangedNeighbors(t *testing.T) {
	store := &stubGraphStore{
		savedPairs: map[string]graphrepo.PairMetadata{
			"0x00000000000000000000000000000000000000aa": {
				ChainID:     31337,
				PairAddress: "0x00000000000000000000000000000000000000aa",
				Token0:      "0x0000000000000000000000000000000000000001",
				Token1:      "0x0000000000000000000000000000000000000002",
			},
		},
		savedNeighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000001": {
				ChainID:   31337,
				Token:     "0x0000000000000000000000000000000000000001",
				Neighbors: []string{"0x0000000000000000000000000000000000000002"},
			},
			"0x0000000000000000000000000000000000000002": {
				ChainID:   31337,
				Token:     "0x0000000000000000000000000000000000000002",
				Neighbors: []string{"0x0000000000000000000000000000000000000001"},
			},
		},
	}
	worker := &Worker{
		cfg: Config{
			ChainID: 31337,
		},
		chainClient: &stubGraphChainClient{
			pairs: []chain.PairDescriptor{
				{
					PairAddress: common.HexToAddress("0x00000000000000000000000000000000000000aa"),
					Token0:      common.HexToAddress("0x0000000000000000000000000000000000000001"),
					Token1:      common.HexToAddress("0x0000000000000000000000000000000000000002"),
				},
			},
		},
		store: store,
	}

	err := worker.SyncOnce(context.Background())

	require.NoError(t, err)
	require.Equal(t, 0, store.pairSaveCalls)
	require.Equal(t, 0, store.neighborSaves)
}
