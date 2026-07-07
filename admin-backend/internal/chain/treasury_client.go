package chain

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

const treasuryABIJSON = `[
  {"type":"function","name":"operationReadyAt","stateMutability":"view","inputs":[{"name":"","type":"bytes32"}],"outputs":[{"name":"","type":"uint256"}]}
]`

type TreasuryClient struct {
	rpcURL  string
	parsed  abi.ABI
	address common.Address
}

func NewTreasuryClient(rpcURL string, treasuryAddress string) (*TreasuryClient, error) {
	rpcURL = strings.TrimSpace(rpcURL)
	if rpcURL == "" || !common.IsHexAddress(treasuryAddress) {
		return nil, nil
	}

	parsed, err := abi.JSON(strings.NewReader(treasuryABIJSON))
	if err != nil {
		return nil, fmt.Errorf("parse treasury abi: %w", err)
	}

	return &TreasuryClient{
		rpcURL:  rpcURL,
		parsed:  parsed,
		address: common.HexToAddress(treasuryAddress),
	}, nil
}

func (c *TreasuryClient) OperationReadyAt(ctx context.Context, operationID string) (*big.Int, error) {
	if c == nil {
		return nil, nil
	}
	if !common.IsHexAddress(c.address.Hex()) {
		return nil, fmt.Errorf("treasury address is not configured")
	}

	operationHash := common.HexToHash(operationID)
	callData, err := c.parsed.Pack("operationReadyAt", operationHash)
	if err != nil {
		return nil, fmt.Errorf("pack operationReadyAt: %w", err)
	}

	client, err := ethclient.DialContext(ctx, c.rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial chain rpc: %w", err)
	}
	defer client.Close()

	output, err := client.CallContract(ctx, ethereum.CallMsg{
		To:   &c.address,
		Data: callData,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("call operationReadyAt: %w", err)
	}

	values, err := c.parsed.Unpack("operationReadyAt", output)
	if err != nil {
		return nil, fmt.Errorf("unpack operationReadyAt: %w", err)
	}
	if len(values) != 1 {
		return nil, fmt.Errorf("unexpected operationReadyAt output")
	}

	readyAt, ok := values[0].(*big.Int)
	if !ok {
		return nil, fmt.Errorf("unexpected operationReadyAt type %T", values[0])
	}
	return readyAt, nil
}
