package chain

import (
	"context"
	"crypto/ecdsa"
	"errors"
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

// SettlementConfig 定义结算客户端所需的最小配置。
type SettlementConfig struct {
	ChainID            int64
	RPCURL             string
	WSRPCURL           string
	SettlementAddress  string
	ExecutorPrivateKey string
}

// SettlementOrder 对应 FluxSignedOrderSettlement 合约里的 SignedOrder tuple。
type SettlementOrder struct {
	Maker                common.Address
	InputToken           common.Address
	OutputToken          common.Address
	AmountIn             *big.Int
	MinAmountOut         *big.Int
	MaxExecutorRewardBps *big.Int
	TriggerPriceX18      *big.Int
	Expiry               *big.Int
	Nonce                *big.Int
	Recipient            common.Address
}

// SettlementClient 统一封装签名限价单结算合约的链上读写能力。
type SettlementClient struct {
	ethClient      *ethclient.Client
	contract       *FluxSignedOrderSettlement
	routerContract *FluxSwapRouter
	settlementAdr  common.Address
	routerAddress  common.Address
	wethAddress    common.Address
	chainID        *big.Int
	executorKey    *ecdsa.PrivateKey
	executorAddr   common.Address
}

// ExecutionResult 保存从成功执行交易 receipt 中解析出的结算结果。
type ExecutionResult struct {
	GrossAmountOut     *big.Int
	RecipientAmountOut *big.Int
	ExecutorFeeAmount  *big.Int
}

type FundingCheckResult struct {
	Token              common.Address
	Balance            *big.Int
	Allowance          *big.Int
	RequiredAmountIn   *big.Int
	HasEnoughBalance   bool
	HasEnoughAllowance bool
}

// CancelTxValidationResult 描述撤单交易与目标订单 nonce 的静态校验结果。
type CancelTxValidationResult struct {
	To                    common.Address
	RegisteredMaker       common.Address
	RegisteredNonces      []*big.Int
	TargetsRequestedNonce bool
}

var (
	erc20MetadataABI     abi.ABI
	erc20MetadataABIOnce sync.Once
	erc20MetadataABIErr  error

	// ErrCancelTransactionNotFound 表示撤单交易当前还未被节点索引到。
	ErrCancelTransactionNotFound = errors.New("cancel transaction not found yet")
	// ErrTransactionReceiptNotFound 表示交易回执当前还未被节点索引到。
	ErrTransactionReceiptNotFound = errors.New("transaction receipt not found yet")
)

const settlementClientInitTimeout = 10 * time.Second

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
	if err := loadERC20MetadataABI(); err != nil {
		return nil, err
	}
	initCtx, cancel := context.WithTimeout(context.Background(), settlementClientInitTimeout)
	defer cancel()

	client, err := ethclient.DialContext(initCtx, cfg.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("dial rpc: %w", err)
	}

	settlementAddress := common.HexToAddress(strings.TrimSpace(cfg.SettlementAddress))
	contractInstance, err := NewFluxSignedOrderSettlement(settlementAddress, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("bind settlement contract: %w", err)
	}

	routerAddress, err := contractInstance.Router(&bind.CallOpts{Context: initCtx})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("load router address: %w", err)
	}
	wethAddress, err := contractInstance.WETH(&bind.CallOpts{Context: initCtx})
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("load weth address: %w", err)
	}

	routerContract, err := NewFluxSwapRouter(routerAddress, client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("bind router contract: %w", err)
	}

	var privateKey *ecdsa.PrivateKey
	var executorAddr common.Address
	if strings.TrimSpace(cfg.ExecutorPrivateKey) != "" {
		privateKey, err = crypto.HexToECDSA(strings.TrimPrefix(strings.TrimSpace(cfg.ExecutorPrivateKey), "0x"))
		if err != nil {
			client.Close()
			return nil, fmt.Errorf("parse executor private key: %w", err)
		}

		publicKey, ok := privateKey.Public().(*ecdsa.PublicKey)
		if !ok {
			client.Close()
			return nil, fmt.Errorf("resolve executor public key")
		}
		executorAddr = crypto.PubkeyToAddress(*publicKey)
	}

	return &SettlementClient{
		ethClient:      client,
		contract:       contractInstance,
		routerContract: routerContract,
		settlementAdr:  settlementAddress,
		routerAddress:  routerAddress,
		wethAddress:    wethAddress,
		chainID:        big.NewInt(cfg.ChainID),
		executorKey:    privateKey,
		executorAddr:   executorAddr,
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

// RouterAddress 返回当前结算合约关联的 Router 地址。
func (c *SettlementClient) RouterAddress() common.Address {
	if c == nil {
		return common.Address{}
	}
	return c.routerAddress
}

// WETHAddress 返回当前链上的包装原生币地址。
func (c *SettlementClient) WETHAddress() common.Address {
	if c == nil {
		return common.Address{}
	}
	return c.wethAddress
}

// SuggestExecutorFee 估算当前订单输出币种口径下的执行费。
func (c *SettlementClient) SuggestExecutorFee(
	ctx context.Context,
	outputToken common.Address,
	estimatedGasUsed uint64,
	safetyBps int64,
) (*big.Int, *big.Int, error) {
	if c == nil {
		return nil, nil, fmt.Errorf("settlement client is nil")
	}
	if estimatedGasUsed == 0 {
		return nil, nil, fmt.Errorf("estimated gas used must be greater than 0")
	}
	if safetyBps <= 0 {
		safetyBps = 10000
	}

	gasPrice, err := c.ethClient.SuggestGasPrice(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("suggest gas price: %w", err)
	}

	requiredNativeFee := new(big.Int).Mul(gasPrice, new(big.Int).SetUint64(estimatedGasUsed))
	requiredNativeFee = requiredNativeFee.Mul(requiredNativeFee, big.NewInt(safetyBps))
	requiredNativeFee = requiredNativeFee.Div(requiredNativeFee, big.NewInt(10000))

	if outputToken == (common.Address{}) || outputToken == c.wethAddress {
		return requiredNativeFee, gasPrice, nil
	}

	path := []common.Address{outputToken, c.wethAddress}
	amountsIn, err := c.getAmountsIn(ctx, requiredNativeFee, path)
	if err != nil {
		return nil, gasPrice, err
	}
	if len(amountsIn) == 0 {
		return nil, gasPrice, fmt.Errorf("router getAmountsIn returned empty result")
	}

	return amountsIn[0], gasPrice, nil
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

// GetOrderQuote 读取当前 AMM 报价，用于执行器在链下计算本次可分配的 surplus 奖励。
func (c *SettlementClient) GetOrderQuote(ctx context.Context, order SettlementOrder) (*big.Int, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}

	amountOut, err := c.contract.GetOrderQuote(&bind.CallOpts{
		Context: ctx,
	}, toBindingOrder(order))
	if err != nil {
		return nil, fmt.Errorf("call getOrderQuote: %w", err)
	}
	return amountOut, nil
}

// ExecuteOrder 发送 executeOrder 交易，由结算合约再次验价后完成最终链上结算。
func (c *SettlementClient) ExecuteOrder(
	ctx context.Context,
	order SettlementOrder,
	signature []byte,
	deadline *big.Int,
	executorReward *big.Int,
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
	if executorReward == nil || executorReward.Sign() < 0 {
		return "", fmt.Errorf("executor reward must be a non-negative integer")
	}

	txOpts, err := c.newTransactOpts(ctx)
	if err != nil {
		return "", err
	}

	tx, err := c.contract.ExecuteOrder(
		txOpts,
		toBindingOrder(order),
		signature,
		deadline,
		executorReward,
	)
	if err != nil {
		return "", fmt.Errorf("send executeOrder transaction: %w", err)
	}

	return tx.Hash().Hex(), nil
}

// CurrentBlockTimestamp 读取最新区块时间，供过期判断和 deadline 计算复用。
func (c *SettlementClient) CurrentBlockTimestamp(ctx context.Context) (uint64, error) {
	if c == nil {
		return 0, fmt.Errorf("settlement client is nil")
	}

	header, err := c.ethClient.HeaderByNumber(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("load latest block header: %w", err)
	}

	return header.Time, nil
}

// CheckMakerFunding 预检 maker 的余额和授权，尽量把明显失败挡在链下。
func (c *SettlementClient) CheckMakerFunding(ctx context.Context, order SettlementOrder) (*FundingCheckResult, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if order.AmountIn == nil || order.AmountIn.Sign() <= 0 {
		return nil, fmt.Errorf("amountIn must be a positive integer")
	}
	if order.InputToken == (common.Address{}) {
		return nil, fmt.Errorf("input token must be an ERC20 token address")
	}

	token := order.InputToken

	balance, err := c.readERC20Uint256(ctx, token, "balanceOf", order.Maker)
	if err != nil {
		return nil, fmt.Errorf("read maker balance: %w", err)
	}
	allowance, err := c.readERC20Uint256(ctx, token, "allowance", order.Maker, c.settlementAdr)
	if err != nil {
		return nil, fmt.Errorf("read maker allowance: %w", err)
	}

	requiredAmountIn := new(big.Int).Set(order.AmountIn)
	return &FundingCheckResult{
		Token:              token,
		Balance:            balance,
		Allowance:          allowance,
		RequiredAmountIn:   requiredAmountIn,
		HasEnoughBalance:   balance.Cmp(requiredAmountIn) >= 0,
		HasEnoughAllowance: allowance.Cmp(requiredAmountIn) >= 0,
	}, nil
}

// ValidateCancelTransaction 校验某笔链上撤单交易是否真的覆盖指定 maker 与 nonce。
//
// 这里不会等待交易最终成功，但会验证目标合约、方法名、maker、nonces、
// deadline 和 maker 签名是否与当前撤单登记请求一致。
func (c *SettlementClient) ValidateCancelTransaction(ctx context.Context, txHash string, maker string, nonce *big.Int) (*CancelTxValidationResult, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if !IsHexHash(txHash) {
		return nil, fmt.Errorf("invalid tx hash")
	}
	if !common.IsHexAddress(strings.TrimSpace(maker)) {
		return nil, fmt.Errorf("maker must be a valid address")
	}
	if nonce == nil || nonce.Sign() < 0 {
		return nil, fmt.Errorf("nonce must be a non-negative integer")
	}

	tx, _, err := c.ethClient.TransactionByHash(ctx, common.HexToHash(strings.TrimSpace(txHash)))
	if err != nil {
		if isTransactionNotFoundError(err) {
			return nil, fmt.Errorf("%w: %v", ErrCancelTransactionNotFound, err)
		}
		return nil, fmt.Errorf("load transaction by hash: %w", err)
	}
	to := tx.To()
	if to == nil {
		return nil, fmt.Errorf("cancel transaction must target settlement contract")
	}
	if *to != c.settlementAdr {
		return nil, fmt.Errorf("cancel transaction targets unexpected contract")
	}

	parsedABI, err := FluxSignedOrderSettlementMetaData.GetAbi()
	if err != nil {
		return nil, fmt.Errorf("load settlement abi: %w", err)
	}
	if len(tx.Data()) < 4 {
		return nil, fmt.Errorf("cancel transaction input too short")
	}

	method, err := parsedABI.MethodById(tx.Data()[:4])
	if err != nil {
		return nil, fmt.Errorf("resolve cancel transaction method: %w", err)
	}
	if method == nil || method.Name != "invalidateNoncesBySig" {
		return nil, fmt.Errorf("cancel transaction must call invalidateNoncesBySig")
	}

	args, err := method.Inputs.Unpack(tx.Data()[4:])
	if err != nil {
		return nil, fmt.Errorf("unpack cancel transaction input: %w", err)
	}
	if len(args) != 4 {
		return nil, fmt.Errorf("cancel transaction input count mismatch")
	}

	registeredMaker, ok := args[0].(common.Address)
	if !ok {
		return nil, fmt.Errorf("cancel transaction maker type mismatch")
	}
	if registeredMaker != common.HexToAddress(strings.TrimSpace(maker)) {
		return nil, fmt.Errorf("cancel transaction maker mismatch")
	}

	rawNonces, ok := args[1].([]*big.Int)
	if !ok {
		return nil, fmt.Errorf("cancel transaction nonces type mismatch")
	}

	targetFound := false
	for _, candidate := range rawNonces {
		if candidate != nil && candidate.Cmp(nonce) == 0 {
			targetFound = true
			break
		}
	}
	if !targetFound {
		return nil, fmt.Errorf("cancel transaction does not cover target nonce")
	}

	deadline, ok := args[2].(*big.Int)
	if !ok {
		return nil, fmt.Errorf("cancel transaction deadline type mismatch")
	}
	if deadline == nil || deadline.Sign() <= 0 {
		return nil, fmt.Errorf("cancel transaction deadline must be a positive integer")
	}

	currentTimestamp, err := c.cancelValidationTimestamp(ctx, common.HexToHash(strings.TrimSpace(txHash)))
	if err != nil {
		return nil, err
	}
	if deadline.Cmp(new(big.Int).SetUint64(currentTimestamp)) < 0 {
		return nil, fmt.Errorf("cancel transaction deadline expired")
	}

	signature, ok := args[3].([]byte)
	if !ok {
		return nil, fmt.Errorf("cancel transaction signature type mismatch")
	}
	if err := VerifyInvalidateNoncesSignature(
		c.chainID.Int64(),
		c.settlementAdr.Hex(),
		registeredMaker,
		rawNonces,
		deadline,
		signature,
	); err != nil {
		return nil, fmt.Errorf("cancel transaction signature invalid: %w", err)
	}

	return &CancelTxValidationResult{
		To:                    *to,
		RegisteredMaker:       registeredMaker,
		RegisteredNonces:      rawNonces,
		TargetsRequestedNonce: true,
	}, nil
}

// cancelValidationTimestamp 返回撤单 deadline 校验使用的时间。
//
// 如果交易已经有成功回执，则使用交易所在区块时间，避免历史成功撤单因为当前时间晚于
// deadline 而被误拒；如果交易尚未出回执，则使用最新区块时间提前拦截明显过期交易。
func (c *SettlementClient) cancelValidationTimestamp(ctx context.Context, txHash common.Hash) (uint64, error) {
	receipt, err := c.ethClient.TransactionReceipt(ctx, txHash)
	if err != nil {
		if isTransactionNotFoundError(err) {
			currentTimestamp, timeErr := c.CurrentBlockTimestamp(ctx)
			if timeErr != nil {
				return 0, fmt.Errorf("load latest block timestamp for pending cancel validation: %w", timeErr)
			}
			return currentTimestamp, nil
		}
		return 0, fmt.Errorf("load cancel transaction receipt: %w", err)
	}

	if receipt.Status != types.ReceiptStatusSuccessful {
		return 0, fmt.Errorf("cancel transaction receipt is not successful")
	}
	if receipt.BlockNumber == nil {
		return 0, fmt.Errorf("cancel transaction receipt missing block number")
	}

	header, err := c.ethClient.HeaderByNumber(ctx, receipt.BlockNumber)
	if err != nil {
		return 0, fmt.Errorf("load cancel transaction block header: %w", err)
	}
	return header.Time, nil
}

// ReceiptStatus 查询交易回执，用于 pending 订单状态对账。
func (c *SettlementClient) ReceiptStatus(ctx context.Context, txHash string) (*types.Receipt, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if !IsHexHash(strings.TrimSpace(txHash)) {
		return nil, fmt.Errorf("invalid tx hash")
	}
	receipt, err := c.ethClient.TransactionReceipt(ctx, common.HexToHash(strings.TrimSpace(txHash)))
	if err != nil {
		if isTransactionNotFoundError(err) {
			return nil, fmt.Errorf("%w: %v", ErrTransactionReceiptNotFound, err)
		}
		return nil, fmt.Errorf("load transaction receipt: %w", err)
	}
	return receipt, nil
}

// TransactionKnown 检查节点当前是否仍能识别这笔交易，用于区分“还在 pending”和“交易已丢失”。
func (c *SettlementClient) TransactionKnown(ctx context.Context, txHash string) (bool, error) {
	if c == nil {
		return false, fmt.Errorf("settlement client is nil")
	}
	if !IsHexHash(strings.TrimSpace(txHash)) {
		return false, fmt.Errorf("invalid tx hash")
	}

	_, _, err := c.ethClient.TransactionByHash(ctx, common.HexToHash(strings.TrimSpace(txHash)))
	if err != nil {
		if isTransactionNotFoundError(err) {
			return false, nil
		}
		return false, fmt.Errorf("load transaction by hash: %w", err)
	}

	return true, nil
}

// IsOrderExecuted 查询订单哈希当前是否已被结算合约标记为已执行。
func (c *SettlementClient) IsOrderExecuted(ctx context.Context, orderHash string) (bool, error) {
	if c == nil {
		return false, fmt.Errorf("settlement client is nil")
	}
	if !IsHexHash(orderHash) {
		return false, fmt.Errorf("invalid order hash")
	}

	return c.contract.OrderExecuted(&bind.CallOpts{Context: ctx}, common.HexToHash(strings.TrimSpace(orderHash)))
}

// IsNonceInvalidated 查询 maker 的指定 nonce 当前是否已被标记为不可再用。
func (c *SettlementClient) IsNonceInvalidated(ctx context.Context, maker string, nonce *big.Int) (bool, error) {
	if c == nil {
		return false, fmt.Errorf("settlement client is nil")
	}
	if !common.IsHexAddress(strings.TrimSpace(maker)) {
		return false, fmt.Errorf("maker must be a valid address")
	}
	if nonce == nil || nonce.Sign() < 0 {
		return false, fmt.Errorf("nonce must be a non-negative integer")
	}

	return c.contract.InvalidatedNonce(
		&bind.CallOpts{Context: ctx},
		common.HexToAddress(strings.TrimSpace(maker)),
		nonce,
	)
}

// ParseExecutionResult 从成功 receipt 里提取当前订单对应的 OrderExecuted 事件结果。
func (c *SettlementClient) ParseExecutionResult(receipt *types.Receipt, orderHash string) (*ExecutionResult, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if receipt == nil {
		return nil, fmt.Errorf("receipt is nil")
	}
	if !IsHexHash(orderHash) {
		return nil, fmt.Errorf("invalid order hash")
	}

	targetHash := common.HexToHash(strings.TrimSpace(orderHash))
	for _, entry := range receipt.Logs {
		if entry == nil || entry.Address != c.settlementAdr {
			continue
		}
		parsed, err := c.contract.ParseOrderExecuted(*entry)
		if err != nil {
			continue
		}
		if parsed.OrderHash != targetHash {
			continue
		}
		return &ExecutionResult{
			GrossAmountOut:     parsed.GrossAmountOut,
			RecipientAmountOut: parsed.RecipientAmountOut,
			ExecutorFeeAmount:  parsed.ExecutorFeeAmount,
		}, nil
	}

	return nil, fmt.Errorf("order executed event not found in receipt")
}

// getAmountsIn 透传 Router 的报价能力，把目标输出额反推出所需输入额。
func (c *SettlementClient) getAmountsIn(
	ctx context.Context,
	amountOut *big.Int,
	path []common.Address,
) ([]*big.Int, error) {
	return c.routerContract.GetAmountsIn(
		&bind.CallOpts{Context: ctx},
		amountOut,
		path,
	)
}

// newTransactOpts 创建发送链上写交易所需的 bind.TransactOpts。
func (c *SettlementClient) newTransactOpts(ctx context.Context) (*bind.TransactOpts, error) {
	if c == nil {
		return nil, fmt.Errorf("settlement client is nil")
	}
	if c.executorKey == nil {
		return nil, fmt.Errorf("executor private key is required for write transaction")
	}

	return &bind.TransactOpts{
		From:    c.executorAddr,
		Signer:  c.signTx,
		Context: ctx,
		NoSend:  false,
	}, nil
}

// signTx 使用执行器私钥对交易进行签名，并显式校验 signer 地址是否匹配。
func (c *SettlementClient) signTx(address common.Address, tx *types.Transaction) (*types.Transaction, error) {
	if address != c.executorAddr {
		return nil, fmt.Errorf("signer address mismatch")
	}
	return types.SignTx(tx, types.LatestSignerForChainID(c.chainID), c.executorKey)
}

// readERC20Uint256 通过最小 ERC20 ABI 读取 balanceOf / allowance 这类 uint256 返回值。
func (c *SettlementClient) readERC20Uint256(ctx context.Context, token common.Address, method string, args ...interface{}) (*big.Int, error) {
	if err := loadERC20MetadataABI(); err != nil {
		return nil, err
	}

	input, err := erc20MetadataABI.Pack(method, args...)
	if err != nil {
		return nil, fmt.Errorf("pack %s call: %w", method, err)
	}

	output, err := c.ethClient.CallContract(ctx, ethereum.CallMsg{
		To:   &token,
		Data: input,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("call %s: %w", method, err)
	}

	values, err := erc20MetadataABI.Unpack(method, output)
	if err != nil {
		return nil, fmt.Errorf("unpack %s result: %w", method, err)
	}
	if len(values) != 1 {
		return nil, fmt.Errorf("%s returned unexpected value count", method)
	}

	value, ok := values[0].(*big.Int)
	if !ok || value == nil {
		return nil, fmt.Errorf("%s returned unexpected type", method)
	}

	return value, nil
}

// toBindingOrder 把业务侧订单结构转换成 abigen 生成 binding 所需的 tuple 结构。
func toBindingOrder(order SettlementOrder) IFluxSignedOrderSettlementSignedOrder {
	return IFluxSignedOrderSettlementSignedOrder{
		Maker:                order.Maker,
		InputToken:           order.InputToken,
		OutputToken:          order.OutputToken,
		AmountIn:             order.AmountIn,
		MinAmountOut:         order.MinAmountOut,
		MaxExecutorRewardBps: order.MaxExecutorRewardBps,
		TriggerPriceX18:      order.TriggerPriceX18,
		Expiry:               order.Expiry,
		Nonce:                order.Nonce,
		Recipient:            order.Recipient,
	}
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

	normalized, err := NormalizeSignatureBytes(signature)
	if err != nil {
		return nil, err
	}
	return normalized, nil
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

// isTransactionNotFoundError 统一判断 RPC 返回是否属于“节点尚未识别该交易”。
func isTransactionNotFoundError(err error) bool {
	if err == nil {
		return false
	}

	text := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(text, "not found") || strings.Contains(text, "unknown transaction")
}

// loadERC20MetadataABI 懒加载最小 ERC20 ABI，供资金预检时读取余额和授权。
func loadERC20MetadataABI() error {
	erc20MetadataABIOnce.Do(func() {
		parsed, err := abi.JSON(strings.NewReader(`[{"constant":true,"inputs":[{"name":"account","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]`))
		if err != nil {
			erc20MetadataABIErr = fmt.Errorf("load erc20 metadata abi: %w", err)
			return
		}
		erc20MetadataABI = parsed
	})

	return erc20MetadataABIErr
}
