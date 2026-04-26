package logic

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	backendredis "fluxswap-backend/redis"
	graphrepo "fluxswap-backend/redis/routergraph"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
)

func TestGetBestRoutePrefersHigherQuotedPath(t *testing.T) {
	store := &stubRouteStore{
		neighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000001": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000001",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000002",
					"0x0000000000000000000000000000000000000003",
				},
			},
			"0x0000000000000000000000000000000000000003": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000003",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000002",
				},
			},
		},
	}
	client := &stubRouteChainClient{
		quotes: map[string]string{
			"0x0000000000000000000000000000000000000001->0x0000000000000000000000000000000000000002":                                             "100",
			"0x0000000000000000000000000000000000000001->0x0000000000000000000000000000000000000003->0x0000000000000000000000000000000000000002": "120",
		},
		reverseQuotes: map[string]string{
			"0x0000000000000000000000000000000000000001->0x0000000000000000000000000000000000000002":                                             "120",
			"0x0000000000000000000000000000000000000001->0x0000000000000000000000000000000000000003->0x0000000000000000000000000000000000000002": "140",
			"0x0000000000000000000000000000000000000001->0x0000000000000000000000000000000000000009":                                             "160",
			"0x0000000000000000000000000000000000000002->0x0000000000000000000000000000000000000009":                                             "0",
		},
		gasPrice:    big.NewInt(1),
		wethAddress: common.HexToAddress("0x0000000000000000000000000000000000000009"),
	}

	logic := NewGetBestRouteLogic(context.Background(), &svc.ServiceContext{
		RouterGraph: store,
		RouteQuotes: map[string]svc.RouterQuoteClient{
			"31337": client,
		},
	})

	resp, err := logic.GetBestRoute(&executor.GetBestRouteRequest{
		ChainId:   31337,
		TokenIn:   "0x0000000000000000000000000000000000000001",
		TokenOut:  "0x0000000000000000000000000000000000000002",
		Amount:    "10",
		MaxHops:   1,
		QuoteType: executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Quote)
	require.Equal(t, executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT, resp.Quote.QuoteType)
	require.Equal(t, "10", resp.Quote.AmountIn)
	require.Equal(t, "120", resp.Quote.AmountOut)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000001",
		"0x0000000000000000000000000000000000000003",
		"0x0000000000000000000000000000000000000002",
	}, resp.SelectedRoute.PathTokens)
	require.Equal(t, "10", resp.SelectedRoute.AmountIn)
	require.Equal(t, "120", resp.SelectedRoute.AmountOut)
	require.True(t, resp.SelectedRoute.IsMultiHop)
	require.NotNil(t, resp.Execution)
	require.Equal(t, resp.SelectedRoute.PathTokens, resp.Execution.RouterPath)
	require.Equal(t, "multihop_swap", resp.Execution.Strategy)
	require.Equal(t, "best_multihop_after_gas", resp.SelectionReason)
	require.True(t, resp.UsedGasAdjustedRanking)
	require.Len(t, resp.AlternativeRoutes, 1)
}

func TestGetBestRoutePrefersGasAdjustedPath(t *testing.T) {
	store := &stubRouteStore{
		neighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000011": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000011",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
					"0x0000000000000000000000000000000000000033",
				},
			},
			"0x0000000000000000000000000000000000000033": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000033",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
				},
			},
		},
	}

	client := &stubRouteChainClient{
		quotes: map[string]string{
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000022":                                             "1000",
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000033->0x0000000000000000000000000000000000000022": "1010",
		},
		reverseQuotes: map[string]string{
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000022":                                             "1300",
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000033->0x0000000000000000000000000000000000000022": "1200",
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000009":                                             "140",
			"0x0000000000000000000000000000000000000022->0x0000000000000000000000000000000000000009":                                             "140",
		},
		gasPrice:    big.NewInt(1),
		wethAddress: common.HexToAddress("0x0000000000000000000000000000000000000009"),
	}

	logic := NewGetBestRouteLogic(context.Background(), &svc.ServiceContext{
		RouterGraph: store,
		RouteQuotes: map[string]svc.RouterQuoteClient{
			"31337": client,
		},
	})

	resp, err := logic.GetBestRoute(&executor.GetBestRouteRequest{
		ChainId:   31337,
		TokenIn:   "0x0000000000000000000000000000000000000011",
		TokenOut:  "0x0000000000000000000000000000000000000022",
		Amount:    "10",
		MaxHops:   1,
		QuoteType: executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000011",
		"0x0000000000000000000000000000000000000033",
		"0x0000000000000000000000000000000000000022",
	}, resp.SelectedRoute.PathTokens)
	require.Equal(t, "10", resp.SelectedRoute.AmountIn)
	require.Equal(t, "1010", resp.SelectedRoute.AmountOut)
	require.Equal(t, "870", resp.SelectedRoute.GasAdjustedAmountOut)
	require.EqualValues(t, 190000, resp.SelectedRoute.GasEstimate)
	require.False(t, resp.SelectedRoute.IsDirect)
	require.True(t, resp.SelectedRoute.IsMultiHop)
	require.Equal(t, "870", resp.SelectedRoute.RankingMetric)
	require.Equal(t, "best_multihop_after_gas", resp.SelectionReason)
	require.Len(t, resp.AlternativeRoutes, 1)
	require.Equal(t, "860", resp.AlternativeRoutes[0].RankingMetric)
}

func TestGetBestRouteSupportsExactOutput(t *testing.T) {
	store := &stubRouteStore{
		neighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000011": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000011",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
					"0x0000000000000000000000000000000000000033",
				},
			},
			"0x0000000000000000000000000000000000000033": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000033",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
				},
			},
		},
	}

	client := &stubRouteChainClient{
		quotes: map[string]string{
			"0x0000000000000000000000000000000000000022->0x0000000000000000000000000000000000000009": "10",
		},
		reverseQuotes: map[string]string{
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000022":                                             "120",
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000033->0x0000000000000000000000000000000000000022": "100",
			"0x0000000000000000000000000000000000000011->0x0000000000000000000000000000000000000009":                                             "160",
			"0x0000000000000000000000000000000000000022->0x0000000000000000000000000000000000000009":                                             "10",
		},
		gasPrice:    big.NewInt(1),
		wethAddress: common.HexToAddress("0x0000000000000000000000000000000000000009"),
	}

	logic := NewGetBestRouteLogic(context.Background(), &svc.ServiceContext{
		RouterGraph: store,
		RouteQuotes: map[string]svc.RouterQuoteClient{
			"31337": client,
		},
	})

	resp, err := logic.GetBestRoute(&executor.GetBestRouteRequest{
		ChainId:   31337,
		TokenIn:   "0x0000000000000000000000000000000000000011",
		TokenOut:  "0x0000000000000000000000000000000000000022",
		Amount:    "50",
		MaxHops:   1,
		QuoteType: executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Quote)
	require.Equal(t, executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT, resp.Quote.QuoteType)
	require.Equal(t, "100", resp.Quote.AmountIn)
	require.Equal(t, "50", resp.Quote.AmountOut)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000011",
		"0x0000000000000000000000000000000000000033",
		"0x0000000000000000000000000000000000000022",
	}, resp.SelectedRoute.PathTokens)
	require.Equal(t, "100", resp.SelectedRoute.AmountIn)
	require.Equal(t, "50", resp.SelectedRoute.AmountOut)
	require.Equal(t, "260", resp.SelectedRoute.GasAdjustedAmountIn)
	require.Equal(t, "lowest_multihop_input_after_gas", resp.SelectionReason)
	require.Len(t, resp.AlternativeRoutes, 1)
	require.Equal(t, "280", resp.AlternativeRoutes[0].RankingMetric)
}

func TestGetBestRouteSupportsNativeTokenSemantics(t *testing.T) {
	store := &stubRouteStore{
		neighbors: map[string]graphrepo.TokenNeighbors{
			"0x0000000000000000000000000000000000000009": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000009",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
					"0x0000000000000000000000000000000000000033",
				},
			},
			"0x0000000000000000000000000000000000000033": {
				ChainID: 31337,
				Token:   "0x0000000000000000000000000000000000000033",
				Neighbors: []string{
					"0x0000000000000000000000000000000000000022",
				},
			},
		},
	}

	client := &stubRouteChainClient{
		quotes: map[string]string{
			"0x0000000000000000000000000000000000000009->0x0000000000000000000000000000000000000022":                                             "1000",
			"0x0000000000000000000000000000000000000009->0x0000000000000000000000000000000000000033->0x0000000000000000000000000000000000000022": "1010",
			"0x0000000000000000000000000000000000000022->0x0000000000000000000000000000000000000009":                                             "10",
		},
		reverseQuotes: map[string]string{
			"0x0000000000000000000000000000000000000009->0x0000000000000000000000000000000000000022":                                             "1200",
			"0x0000000000000000000000000000000000000009->0x0000000000000000000000000000000000000033->0x0000000000000000000000000000000000000022": "1300",
			"0x0000000000000000000000000000000000000022->0x0000000000000000000000000000000000000009":                                             "10",
		},
		gasPrice:    big.NewInt(1),
		wethAddress: common.HexToAddress("0x0000000000000000000000000000000000000009"),
	}

	logic := NewGetBestRouteLogic(context.Background(), &svc.ServiceContext{
		RouterGraph: store,
		RouteQuotes: map[string]svc.RouterQuoteClient{
			"31337": client,
		},
	})

	resp, err := logic.GetBestRoute(&executor.GetBestRouteRequest{
		ChainId:   31337,
		TokenIn:   "0x0000000000000000000000000000000000000000",
		TokenOut:  "0x0000000000000000000000000000000000000022",
		Amount:    "10",
		MaxHops:   1,
		QuoteType: executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT,
	})

	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.SelectedRoute)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000000",
		"0x0000000000000000000000000000000000000033",
		"0x0000000000000000000000000000000000000022",
	}, resp.SelectedRoute.PathTokens)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000009",
		"0x0000000000000000000000000000000000000033",
		"0x0000000000000000000000000000000000000022",
	}, resp.SelectedRoute.ExecutionPath)
	require.NotNil(t, resp.Execution)
	require.Equal(t, []string{
		"0x0000000000000000000000000000000000000009",
		"0x0000000000000000000000000000000000000033",
		"0x0000000000000000000000000000000000000022",
	}, resp.Execution.RouterPath)
	require.Equal(t, "best_multihop_after_gas", resp.SelectionReason)
}

type stubRouteStore struct {
	neighbors map[string]graphrepo.TokenNeighbors
}

func (s *stubRouteStore) SavePairMetadata(context.Context, graphrepo.PairMetadata, time.Duration) error {
	return nil
}

func (s *stubRouteStore) GetPairMetadata(context.Context, int64, string) (graphrepo.PairMetadata, bool, error) {
	return graphrepo.PairMetadata{}, false, nil
}

func (s *stubRouteStore) SaveTokenNeighbors(context.Context, graphrepo.TokenNeighbors, time.Duration) error {
	return nil
}

func (s *stubRouteStore) GetTokenNeighbors(ctx context.Context, chainID int64, token string) (graphrepo.TokenNeighbors, bool, error) {
	item, ok := s.neighbors[token]
	return item, ok, nil
}

func (s *stubRouteStore) SaveSyncCursor(context.Context, graphrepo.SyncCursor, time.Duration) error {
	return nil
}

func (s *stubRouteStore) GetSyncCursor(context.Context, int64, string) (graphrepo.SyncCursor, bool, error) {
	return graphrepo.SyncCursor{}, false, nil
}

func (s *stubRouteStore) RawStore() backendredis.Store {
	return nil
}

type stubRouteChainClient struct {
	quotes        map[string]string
	reverseQuotes map[string]string
	gasPrice      *big.Int
	wethAddress   common.Address
}

func (s *stubRouteChainClient) Close() {}

func (s *stubRouteChainClient) GetAmountsOut(ctx context.Context, amountIn *big.Int, path []common.Address) ([]*big.Int, error) {
	tokens := make([]string, 0, len(path))
	for _, token := range path {
		tokens = append(tokens, strings.ToLower(token.Hex()))
	}

	quoted, ok := s.quotes[strings.Join(tokens, "->")]
	if !ok {
		return nil, fmt.Errorf("quote not found")
	}

	output := mustBigInt(quoted)
	amounts := make([]*big.Int, len(path))
	amounts[0] = new(big.Int).Set(amountIn)
	for i := 1; i < len(path)-1; i++ {
		amounts[i] = new(big.Int).Set(amountIn)
	}
	amounts[len(path)-1] = output
	return amounts, nil
}

func (s *stubRouteChainClient) GetAmountsIn(ctx context.Context, amountOut *big.Int, path []common.Address) ([]*big.Int, error) {
	tokens := make([]string, 0, len(path))
	for _, token := range path {
		tokens = append(tokens, strings.ToLower(token.Hex()))
	}

	quoted, ok := s.reverseQuotes[strings.Join(tokens, "->")]
	if !ok {
		return nil, fmt.Errorf("reverse quote not found")
	}

	input := mustBigInt(quoted)
	amounts := make([]*big.Int, len(path))
	amounts[0] = input
	for i := 1; i < len(path)-1; i++ {
		amounts[i] = new(big.Int).Set(amountOut)
	}
	amounts[len(path)-1] = new(big.Int).Set(amountOut)
	return amounts, nil
}

func (s *stubRouteChainClient) SuggestGasPrice(context.Context) (*big.Int, error) {
	if s.gasPrice == nil {
		return big.NewInt(1), nil
	}
	return new(big.Int).Set(s.gasPrice), nil
}

func (s *stubRouteChainClient) WETHAddress() common.Address {
	if s.wethAddress == (common.Address{}) {
		return common.HexToAddress("0x0000000000000000000000000000000000000009")
	}
	return s.wethAddress
}
