package chain

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

const routerQuoteClientInitTimeout = 10 * time.Second

type RouterQuoteClient struct {
	ethClient      *ethclient.Client
	routerContract *FluxSwapRouter
	wethAddress    common.Address
}

func NewRouterQuoteClient(cfg SettlementConfig) (*RouterQuoteClient, error) {
	if cfg.ChainID <= 0 {
		return nil, fmt.Errorf("chain id is required")
	}
	if strings.TrimSpace(cfg.RPCURL) == "" {
		return nil, fmt.Errorf("rpc url is required")
	}
	if !common.IsHexAddress(strings.TrimSpace(cfg.SettlementAddress)) {
		return nil, fmt.Errorf("settlement address must be a valid address")
	}

	initCtx, cancel := context.WithTimeout(context.Background(), routerQuoteClientInitTimeout)
	defer cancel()

	client, err := ethclient.DialContext(initCtx, cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}

	settlementAddress := common.HexToAddress(strings.TrimSpace(cfg.SettlementAddress))
	settlementContract, err := NewFluxSignedOrderSettlement(settlementAddress, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("bind settlement contract: %w", err)
	}

	routerAddress, err := settlementContract.Router(&bind.CallOpts{Context: initCtx})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("load router address: %w", err)
	}

	routerContract, err := NewFluxSwapRouter(routerAddress, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("bind router contract: %w", err)
	}

	wethAddress, err := routerContract.WETH(&bind.CallOpts{Context: initCtx})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("load weth address: %w", err)
	}

	return &RouterQuoteClient{
		ethClient:      client,
		routerContract: routerContract,
		wethAddress:    wethAddress,
	}, nil
}

func (c *RouterQuoteClient) Close() {
	if c != nil && c.ethClient != nil {
		c.ethClient.Close()
	}
}

func (c *RouterQuoteClient) GetAmountsOut(ctx context.Context, amountIn *big.Int, path []common.Address) ([]*big.Int, error) {
	if c == nil {
		return nil, fmt.Errorf("router quote client is nil")
	}
	if amountIn == nil || amountIn.Sign() <= 0 {
		return nil, fmt.Errorf("amountIn must be a positive integer")
	}
	if len(path) < 2 {
		return nil, fmt.Errorf("path must contain at least two tokens")
	}

	return c.routerContract.GetAmountsOut(
		&bind.CallOpts{Context: ctx},
		amountIn,
		path,
	)
}

func (c *RouterQuoteClient) GetAmountsIn(ctx context.Context, amountOut *big.Int, path []common.Address) ([]*big.Int, error) {
	if c == nil {
		return nil, fmt.Errorf("router quote client is nil")
	}
	if amountOut == nil || amountOut.Sign() <= 0 {
		return nil, fmt.Errorf("amountOut must be a positive integer")
	}
	if len(path) < 2 {
		return nil, fmt.Errorf("path must contain at least two tokens")
	}

	return c.routerContract.GetAmountsIn(
		&bind.CallOpts{Context: ctx},
		amountOut,
		path,
	)
}

func (c *RouterQuoteClient) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	if c == nil {
		return nil, fmt.Errorf("router quote client is nil")
	}

	gasPrice, err := c.ethClient.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("suggest gas price: %w", err)
	}
	return gasPrice, nil
}

func (c *RouterQuoteClient) WETHAddress() common.Address {
	if c == nil {
		return common.Address{}
	}
	return c.wethAddress
}
