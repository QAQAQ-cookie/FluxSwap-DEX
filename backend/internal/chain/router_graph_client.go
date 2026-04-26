package chain

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

const routerGraphClientInitTimeout = 10 * time.Second

type PairDescriptor struct {
	PairAddress common.Address
	Token0      common.Address
	Token1      common.Address
}

type PairCreatedEvent struct {
	PairAddress common.Address
	Token0      common.Address
	Token1      common.Address
	BlockNumber uint64
	BlockHash   common.Hash
	LogIndex    uint
}

type RouterGraphClient struct {
	httpClient     *ethclient.Client
	wsClient       *ethclient.Client
	factoryAddress common.Address
}

var (
	fluxSwapFactoryABI     abi.ABI
	fluxSwapFactoryABIOnce sync.Once
	fluxSwapFactoryABIErr  error

	fluxSwapPairABI     abi.ABI
	fluxSwapPairABIOnce sync.Once
	fluxSwapPairABIErr  error
)

var pairCreatedTopic = crypto.Keccak256Hash([]byte("PairCreated(address,address,address,uint256)"))

func NewRouterGraphClient(cfg SettlementConfig) (*RouterGraphClient, error) {
	if cfg.ChainID <= 0 {
		return nil, fmt.Errorf("chain id is required")
	}
	if strings.TrimSpace(cfg.RPCURL) == "" {
		return nil, fmt.Errorf("rpc url is required")
	}
	if !common.IsHexAddress(strings.TrimSpace(cfg.SettlementAddress)) {
		return nil, fmt.Errorf("settlement address must be a valid address")
	}
	if err := loadFluxSwapFactoryABI(); err != nil {
		return nil, err
	}
	if err := loadFluxSwapPairABI(); err != nil {
		return nil, err
	}

	initCtx, cancel := context.WithTimeout(context.Background(), routerGraphClientInitTimeout)
	defer cancel()

	httpClient, err := ethclient.DialContext(initCtx, cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}

	settlementAddress := common.HexToAddress(strings.TrimSpace(cfg.SettlementAddress))
	settlementContract, err := NewFluxSignedOrderSettlement(settlementAddress, httpClient)
	if err != nil {
		httpClient.Close()
		return nil, fmt.Errorf("bind settlement contract: %w", err)
	}

	factoryAddress, err := settlementContract.Factory(&bind.CallOpts{Context: initCtx})
	if err != nil {
		httpClient.Close()
		return nil, fmt.Errorf("load factory address: %w", err)
	}

	var wsClient *ethclient.Client
	if wsURL := strings.TrimSpace(cfg.WSRPCURL); wsURL != "" {
		wsClient, err = ethclient.DialContext(initCtx, wsURL)
		if err != nil {
			httpClient.Close()
			return nil, fmt.Errorf("dial websocket rpc: %w", err)
		}
	}

	return &RouterGraphClient{
		httpClient:     httpClient,
		wsClient:       wsClient,
		factoryAddress: factoryAddress,
	}, nil
}

func (c *RouterGraphClient) Close() {
	if c != nil && c.httpClient != nil {
		c.httpClient.Close()
	}
	if c != nil && c.wsClient != nil {
		c.wsClient.Close()
	}
}

func (c *RouterGraphClient) FactoryAddress() common.Address {
	if c == nil {
		return common.Address{}
	}
	return c.factoryAddress
}

func (c *RouterGraphClient) ListPairs(ctx context.Context) ([]PairDescriptor, error) {
	if c == nil {
		return nil, fmt.Errorf("router graph client is nil")
	}

	factoryContract := bind.NewBoundContract(c.factoryAddress, fluxSwapFactoryABI, c.httpClient, nil, nil)

	pairCount, err := callBigInt(ctx, factoryContract, "allPairsLength")
	if err != nil {
		return nil, fmt.Errorf("call allPairsLength: %w", err)
	}
	if pairCount == nil || pairCount.Sign() == 0 {
		return nil, nil
	}

	total := pairCount.Int64()
	pairs := make([]PairDescriptor, 0, total)
	for i := int64(0); i < total; i++ {
		index := big.NewInt(i)

		pairAddress, err := callAddress(ctx, factoryContract, "allPairs", index)
		if err != nil {
			return nil, fmt.Errorf("call allPairs(%d): %w", i, err)
		}

		pairContract := bind.NewBoundContract(pairAddress, fluxSwapPairABI, c.httpClient, nil, nil)

		token0, err := callAddress(ctx, pairContract, "token0")
		if err != nil {
			return nil, fmt.Errorf("call token0 for pair %s: %w", pairAddress.Hex(), err)
		}

		token1, err := callAddress(ctx, pairContract, "token1")
		if err != nil {
			return nil, fmt.Errorf("call token1 for pair %s: %w", pairAddress.Hex(), err)
		}

		pairs = append(pairs, PairDescriptor{
			PairAddress: pairAddress,
			Token0:      token0,
			Token1:      token1,
		})
	}

	return pairs, nil
}

func (c *RouterGraphClient) SubscribePairCreated(ctx context.Context, sink chan<- PairCreatedEvent) (ethereum.Subscription, error) {
	if c == nil {
		return nil, fmt.Errorf("router graph client is nil")
	}
	if sink == nil {
		return nil, fmt.Errorf("pair created sink is required")
	}
	if c.wsClient == nil {
		return nil, fmt.Errorf("websocket rpc is required for pair created subscription")
	}

	logsCh := make(chan types.Log, 128)
	query := ethereum.FilterQuery{
		Addresses: []common.Address{c.factoryAddress},
		Topics:    [][]common.Hash{{pairCreatedTopic}},
	}

	sub, err := c.wsClient.SubscribeFilterLogs(ctx, query, logsCh)
	if err != nil {
		return nil, fmt.Errorf("subscribe pair created logs: %w", err)
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case entry, ok := <-logsCh:
				if !ok {
					return
				}
				event, ok := decodePairCreatedLog(entry)
				if !ok {
					continue
				}
				select {
				case <-ctx.Done():
					return
				case sink <- event:
				}
			}
		}
	}()

	return sub, nil
}

func (c *RouterGraphClient) BlockNumber(ctx context.Context) (uint64, error) {
	if c == nil || c.httpClient == nil {
		return 0, fmt.Errorf("router graph client is nil")
	}
	return c.httpClient.BlockNumber(ctx)
}

func (c *RouterGraphClient) FilterPairCreated(ctx context.Context, fromBlock uint64, toBlock uint64) ([]PairCreatedEvent, error) {
	if c == nil || c.httpClient == nil {
		return nil, fmt.Errorf("router graph client is nil")
	}
	if fromBlock > toBlock {
		return nil, nil
	}

	query := ethereum.FilterQuery{
		Addresses: []common.Address{c.factoryAddress},
		Topics:    [][]common.Hash{{pairCreatedTopic}},
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
	}

	logs, err := c.httpClient.FilterLogs(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("filter pair created logs: %w", err)
	}

	events := make([]PairCreatedEvent, 0, len(logs))
	for _, entry := range logs {
		event, ok := decodePairCreatedLog(entry)
		if !ok {
			continue
		}
		events = append(events, event)
	}
	return events, nil
}

func loadFluxSwapFactoryABI() error {
	fluxSwapFactoryABIOnce.Do(func() {
		parsed, err := abi.JSON(strings.NewReader(`[{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allPairs","outputs":[{"internalType":"address","name":"pair","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"allPairsLength","outputs":[{"internalType":"uint256","name":"length","type":"uint256"}],"stateMutability":"view","type":"function"}]`))
		if err != nil {
			fluxSwapFactoryABIErr = fmt.Errorf("load flux swap factory abi: %w", err)
			return
		}
		fluxSwapFactoryABI = parsed
	})

	return fluxSwapFactoryABIErr
}

func loadFluxSwapPairABI() error {
	fluxSwapPairABIOnce.Do(func() {
		parsed, err := abi.JSON(strings.NewReader(`[{"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}]`))
		if err != nil {
			fluxSwapPairABIErr = fmt.Errorf("load flux swap pair abi: %w", err)
			return
		}
		fluxSwapPairABI = parsed
	})

	return fluxSwapPairABIErr
}

func callBigInt(ctx context.Context, contract *bind.BoundContract, method string, params ...interface{}) (*big.Int, error) {
	var results []interface{}
	if err := contract.Call(&bind.CallOpts{Context: ctx}, &results, method, params...); err != nil {
		return nil, err
	}
	if len(results) != 1 {
		return nil, fmt.Errorf("%s returned unexpected result count", method)
	}

	value, ok := results[0].(*big.Int)
	if !ok || value == nil {
		return nil, fmt.Errorf("%s returned unexpected type", method)
	}
	return value, nil
}

func callAddress(ctx context.Context, contract *bind.BoundContract, method string, params ...interface{}) (common.Address, error) {
	var results []interface{}
	if err := contract.Call(&bind.CallOpts{Context: ctx}, &results, method, params...); err != nil {
		return common.Address{}, err
	}
	if len(results) != 1 {
		return common.Address{}, fmt.Errorf("%s returned unexpected result count", method)
	}

	value, ok := results[0].(common.Address)
	if !ok {
		return common.Address{}, fmt.Errorf("%s returned unexpected type", method)
	}
	return value, nil
}

func decodePairCreatedLog(entry types.Log) (PairCreatedEvent, bool) {
	if len(entry.Topics) < 3 || len(entry.Data) < 64 {
		return PairCreatedEvent{}, false
	}

	token0 := common.HexToAddress(entry.Topics[1].Hex())
	token1 := common.HexToAddress(entry.Topics[2].Hex())
	pairAddress := common.BytesToAddress(entry.Data[12:32])

	return PairCreatedEvent{
		PairAddress: pairAddress,
		Token0:      token0,
		Token1:      token1,
		BlockNumber: entry.BlockNumber,
		BlockHash:   entry.BlockHash,
		LogIndex:    entry.Index,
	}, true
}
