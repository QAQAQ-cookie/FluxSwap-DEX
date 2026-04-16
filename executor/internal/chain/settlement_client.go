package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// SettlementConfig 定义链上结算客户端所需的最小配置。
type SettlementConfig struct {
	ChainID            int64
	RPCURL             string
	SettlementAddress  string
	ExecutorPrivateKey string
}

// SettlementOrder 对应 FluxSignedOrderSettlement 合约里的 SignedOrder tuple。
type SettlementOrder struct {
	Maker           common.Address
	InputToken      common.Address
	OutputToken     common.Address
	AmountIn        *big.Int
	MinAmountOut    *big.Int
	TriggerPriceX18 *big.Int
	Expiry          *big.Int
	Nonce           *big.Int
	Recipient       common.Address
}

// SettlementClient 统一封装签名限价单结算合约的链上读写能力。
type SettlementClient struct {
	ethClient     *ethclient.Client
	contract      *FluxSignedOrderSettlement
	settlementAdr common.Address
	chainID       *big.Int
	executorKey   *ecdsa.PrivateKey
	executorAddr  common.Address
}

// NewSettlementClient 初始化链上结算客户端。
func NewSettlementClient(cfg SettlementConfig) (*SettlementClient, error) {
	if cfg.ChainID <= 0 {
		return nil, fmt.Errorf("chain id is required")
	}
	if strings.TrimSpace(cfg.RPCURL) == "" {
		return nil, fmt.Errorf("rpc url is required")
	}
	if !common.IsHexAddress(strings.TrimSpace(cfg.SettlementAddress)) {
		return nil, fmt.Errorf("settlement address must be a valid address")
	}
	if strings.TrimSpace(cfg.ExecutorPrivateKey) == "" {
		return nil, fmt.Errorf("executor private key is required")
	}

	client, err := ethclient.DialContext(context.Background(), cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}

	settlementAddress := common.HexToAddress(strings.TrimSpace(cfg.SettlementAddress))
	contractInstance, err := NewFluxSignedOrderSettlement(settlementAddress, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("bind settlement contract: %w", err)
	}

	privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(strings.TrimSpace(cfg.ExecutorPrivateKey), "0x"))
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("parse executor private key: %w", err)
	}

	publicKey, ok := privateKey.Public().(*ecdsa.PublicKey)
	if !ok {
		client.Close()
		return nil, fmt.Errorf("resolve executor public key")
	}

	return &SettlementClient{
		ethClient:     client,
		contract:      contractInstance,
		settlementAdr: settlementAddress,
		chainID:       big.NewInt(cfg.ChainID),
		executorKey:   privateKey,
		executorAddr:  crypto.PubkeyToAddress(*publicKey),
	}, nil
}

// Close 释放链上 RPC 连接。
func (c *SettlementClient) Close() {
	if c != nil && c.ethClient != nil {
		c.ethClient.Close()
	}
}

// SettlementAddress 返回当前客户端绑定的结算合约地址。
func (c *SettlementClient) SettlementAddress() string {
	if c == nil {
		return ""
	}
	return c.settlementAdr.Hex()
}

// CanExecuteOrder 调用合约只读方法，判断订单当前是否已经满足执行条件。
func (c *SettlementClient) CanExecuteOrder(ctx context.Context, order SettlementOrder) (bool, string, error) {
	if c == nil {
		return false, "", fmt.Errorf("settlement client is nil")
	}

	result, err := c.contract.CanExecuteOrder(&bind.CallOpts{
		Context: ctx,
	}, toBindingOrder(order))
	if err != nil {
		return false, "", fmt.Errorf("call canExecuteOrder: %w", err)
	}

	return result.Executable, result.Reason, nil
}

// ExecuteOrder 发送 executeOrder 交易，由结算合约再次验价后完成最终链上结算。
func (c *SettlementClient) ExecuteOrder(
	ctx context.Context,
	order SettlementOrder,
	signature []byte,
	deadline *big.Int,
) (string, error) {
	if c == nil {
		return "", fmt.Errorf("settlement client is nil")
	}
	if len(signature) == 0 {
		return "", fmt.Errorf("signature must not be empty")
	}
	if deadline == nil || deadline.Sign() <= 0 {
		return "", fmt.Errorf("deadline must be a positive integer")
	}

	tx, err := c.contract.ExecuteOrder(
		c.newTransactOpts(ctx),
		toBindingOrder(order),
		signature,
		deadline,
	)
	if err != nil {
		return "", fmt.Errorf("send executeOrder transaction: %w", err)
	}

	return tx.Hash().Hex(), nil
}

// InvalidateNoncesBySig 发送批量 nonce 失效交易，用于一个 maker 的多笔订单撤销。
func (c *SettlementClient) InvalidateNoncesBySig(
	ctx context.Context,
	maker string,
	nonces []*big.Int,
	deadline *big.Int,
	signature []byte,
) (string, error) {
	if c == nil {
		return "", fmt.Errorf("settlement client is nil")
	}
	if !common.IsHexAddress(strings.TrimSpace(maker)) {
		return "", fmt.Errorf("maker must be a valid address")
	}
	if len(nonces) == 0 {
		return "", fmt.Errorf("nonces must not be empty")
	}
	if deadline == nil || deadline.Sign() <= 0 {
		return "", fmt.Errorf("deadline must be a positive integer")
	}
	if len(signature) == 0 {
		return "", fmt.Errorf("signature must not be empty")
	}

	tx, err := c.contract.InvalidateNoncesBySig(
		c.newTransactOpts(ctx),
		common.HexToAddress(strings.TrimSpace(maker)),
		nonces,
		deadline,
		signature,
	)
	if err != nil {
		return "", fmt.Errorf("send invalidateNoncesBySig transaction: %w", err)
	}

	return tx.Hash().Hex(), nil
}

func (c *SettlementClient) newTransactOpts(ctx context.Context) *bind.TransactOpts {
	return &bind.TransactOpts{
		From:    c.executorAddr,
		Signer:  c.signTx,
		Context: ctx,
		NoSend:  false,
	}
}

func (c *SettlementClient) signTx(address common.Address, tx *types.Transaction) (*types.Transaction, error) {
	if address != c.executorAddr {
		return nil, fmt.Errorf("signer address mismatch")
	}
	return types.SignTx(tx, types.LatestSignerForChainID(c.chainID), c.executorKey)
}

func toBindingOrder(order SettlementOrder) IFluxSignedOrderSettlementSignedOrder {
	return IFluxSignedOrderSettlementSignedOrder{
		Maker:           order.Maker,
		InputToken:      order.InputToken,
		OutputToken:     order.OutputToken,
		AmountIn:        order.AmountIn,
		MinAmountOut:    order.MinAmountOut,
		TriggerPriceX18: order.TriggerPriceX18,
		Expiry:          order.Expiry,
		Nonce:           order.Nonce,
		Recipient:       order.Recipient,
	}
}

// ReceiptStatus 查询交易回执，用于 pending 订单状态对账。
func (c *SettlementClient) ReceiptStatus(ctx context.Context, txHash string) (*types.Receipt, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if !IsHexHash(strings.TrimSpace(txHash)) {
		return nil, fmt.Errorf("invalid tx hash")
	}
	return c.ethClient.TransactionReceipt(ctx, common.HexToHash(strings.TrimSpace(txHash)))
}

// BuildSafeDeadline 把字符串 deadline 解析为链上可用的 unix 秒时间戳。
func BuildSafeDeadline(raw string) (*big.Int, error) {
	deadline, ok := new(big.Int).SetString(strings.TrimSpace(raw), 10)
	if !ok || deadline.Sign() <= 0 {
		return nil, fmt.Errorf("deadline must be an unsigned integer string")
	}
	return deadline, nil
}

// DecodeHexSignature 把十六进制签名解析为 ABI 调用需要的字节数组。
func DecodeHexSignature(raw string) ([]byte, error) {
	signature := common.FromHex(strings.TrimSpace(raw))
	if len(signature) == 0 {
		return nil, fmt.Errorf("signature must be a valid hex string")
	}
	return signature, nil
}

// DeadlineAfterNow 校验 deadline 仍然晚于当前时间。
func DeadlineAfterNow(deadline *big.Int) bool {
	if deadline == nil {
		return false
	}
	return deadline.Cmp(big.NewInt(time.Now().UTC().Unix())) > 0
}

// IsHexHash 对交易哈希做轻量格式检查。
func IsHexHash(value string) bool {
	trimmed := strings.TrimSpace(value)
	return strings.HasPrefix(trimmed, "0x") && len(trimmed) == 66
}
