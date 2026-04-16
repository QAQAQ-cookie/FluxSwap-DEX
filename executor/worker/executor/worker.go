package executor

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"fluxswap-executor/internal/chain"
	"fluxswap-executor/internal/domain"
	"fluxswap-executor/internal/repo"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"gorm.io/gorm"
)

// Config 控制执行器 worker 的运行参数和链连接配置。
type Config struct {
	ChainID             int64
	RPCURL              string
	SettlementAddress   string
	ExecutorPrivateKey  string
	ScanInterval        time.Duration
	ReceiptPollInterval time.Duration
	BatchSize           int
	TxDeadline          time.Duration
}

// Worker 负责扫描 open 订单、提交可执行订单，并跟踪 pending 交易回执。
type Worker struct {
	db               *gorm.DB
	cfg              Config
	orderRepo        *repo.OrderRepository
	settlementClient *chain.SettlementClient
}

// NewWorker 校验配置并初始化执行器所依赖的仓储与链上客户端。
func NewWorker(db *gorm.DB, cfg Config) (*Worker, error) {
	if db == nil {
		return nil, fmt.Errorf("database is required")
	}
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
	if cfg.ScanInterval <= 0 {
		cfg.ScanInterval = 5 * time.Second
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 20
	}
	if cfg.ReceiptPollInterval <= 0 {
		cfg.ReceiptPollInterval = cfg.ScanInterval
	}
	if cfg.TxDeadline <= 0 {
		cfg.TxDeadline = 2 * time.Minute
	}

	settlementClient, err := chain.NewSettlementClient(chain.SettlementConfig{
		ChainID:            cfg.ChainID,
		RPCURL:             cfg.RPCURL,
		SettlementAddress:  cfg.SettlementAddress,
		ExecutorPrivateKey: cfg.ExecutorPrivateKey,
	})
	if err != nil {
		return nil, err
	}

	return &Worker{
		db:               db,
		cfg:              cfg,
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: settlementClient,
	}, nil
}

// Close 释放底层 RPC 连接资源。
func (w *Worker) Close() {
	if w.settlementClient != nil {
		w.settlementClient.Close()
	}
}

// Run 启动执行器的两个核心循环，分别处理 open 扫描和 pending 回执对账。
func (w *Worker) Run(ctx context.Context) error {
	scanTicker := time.NewTicker(w.cfg.ScanInterval)
	defer scanTicker.Stop()
	receiptTicker := time.NewTicker(w.cfg.ReceiptPollInterval)
	defer receiptTicker.Stop()

	if err := w.scanOnce(ctx); err != nil {
		return err
	}
	if err := w.reconcilePendingOnce(ctx); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-scanTicker.C:
			if err := w.scanOnce(ctx); err != nil {
				return err
			}
		case <-receiptTicker.C:
			if err := w.reconcilePendingOnce(ctx); err != nil {
				return err
			}
		}
	}
}

// scanOnce 加载当前结算合约下的 open 订单，并逐笔判断是否达到执行条件。
func (w *Worker) scanOnce(ctx context.Context) error {
	openOrders, err := w.orderRepo.ListOpenOrdersForSettlement(
		ctx,
		w.cfg.ChainID,
		w.settlementClient.SettlementAddress(),
		w.cfg.BatchSize,
	)
	if err != nil {
		return err
	}

	if len(openOrders) > 0 {
		fmt.Printf("executor scan loaded %d open orders for settlement %s\n", len(openOrders), w.settlementClient.SettlementAddress())
	}

	for i := range openOrders {
		if err := w.evaluateOrder(ctx, &openOrders[i]); err != nil {
			fmt.Printf("executor worker evaluate order %s failed: %v\n", openOrders[i].OrderHash, err)
		}
	}

	return nil
}

// reconcilePendingOnce 检查已经提交但还未落最终状态的 pending 订单。
func (w *Worker) reconcilePendingOnce(ctx context.Context) error {
	pendingOrders, err := w.orderRepo.ListPendingOrdersForSettlement(
		ctx,
		w.cfg.ChainID,
		w.settlementClient.SettlementAddress(),
		w.cfg.BatchSize,
	)
	if err != nil {
		return err
	}

	if len(pendingOrders) > 0 {
		fmt.Printf("executor receipt loop loaded %d pending orders for settlement %s\n", len(pendingOrders), w.settlementClient.SettlementAddress())
	}

	for i := range pendingOrders {
		if err := w.checkPendingReceipt(ctx, &pendingOrders[i]); err != nil {
			fmt.Printf("executor worker reconcile order %s failed: %v\n", pendingOrders[i].OrderHash, err)
		}
	}

	return nil
}

// evaluateOrder 调用只读接口检查订单 readiness，并在满足条件时提交链上执行交易。
func (w *Worker) evaluateOrder(ctx context.Context, order *domain.Order) error {
	payload, err := buildSettlementOrder(order)
	if err != nil {
		order.Status = "open"
		order.StatusReason = shortenReason("order_payload_invalid: " + err.Error())
		order.UpdatedAt = time.Now().UTC()
		return w.orderRepo.Update(ctx, order)
	}

	executable, reason, err := w.settlementClient.CanExecuteOrder(ctx, payload)
	if err != nil {
		order.Status = "open"
		order.StatusReason = shortenReason("can_execute_failed: " + err.Error())
		order.UpdatedAt = time.Now().UTC()
		return w.orderRepo.Update(ctx, order)
	}

	if executable {
		fmt.Printf("order %s is executable, submitting transaction\n", order.OrderHash)

		signature, sigErr := chain.DecodeHexSignature(order.Signature)
		if sigErr != nil {
			order.Status = "open"
			order.StatusReason = shortenReason("invalid_signature: " + sigErr.Error())
			order.UpdatedAt = time.Now().UTC()
			return w.orderRepo.Update(ctx, order)
		}

		deadline, deadlineErr := w.buildDeadline(order)
		if deadlineErr != nil {
			order.Status = "open"
			order.StatusReason = shortenReason("deadline_invalid: " + deadlineErr.Error())
			order.UpdatedAt = time.Now().UTC()
			return w.orderRepo.Update(ctx, order)
		}

		txHash, executeErr := w.settlementClient.ExecuteOrder(ctx, payload, signature, deadline)
		if executeErr != nil {
			fmt.Printf("submit order %s failed: %v\n", order.OrderHash, executeErr)
			order.Status = "open"
			order.StatusReason = shortenReason("submit_failed: " + executeErr.Error())
		} else {
			fmt.Printf("submitted order %s with tx %s\n", order.OrderHash, txHash)
			order.Status = "pending_execute"
			order.StatusReason = "submitted_to_chain"
			order.SubmittedTxHash = txHash
		}
		order.UpdatedAt = time.Now().UTC()
		return w.orderRepo.Update(ctx, order)
	}

	order.Status = "open"
	order.StatusReason = reason
	order.UpdatedAt = time.Now().UTC()
	return w.orderRepo.Update(ctx, order)
}

// checkPendingReceipt 根据订单上记录的 submitted tx hash 对账链上回执状态。
func (w *Worker) checkPendingReceipt(ctx context.Context, order *domain.Order) error {
	isPendingCancel := strings.TrimSpace(order.Status) == "pending_cancel"
	pendingTxHash := strings.TrimSpace(order.SubmittedTxHash)
	if isPendingCancel {
		pendingTxHash = strings.TrimSpace(order.CancelledTxHash)
	}

	if !chain.IsHexHash(pendingTxHash) {
		fmt.Printf("order %s lost pending tx hash, returning to open\n", order.OrderHash)
		order.Status = "open"
		order.StatusReason = "pending_without_valid_tx_hash"
		order.SubmittedTxHash = ""
		order.CancelledTxHash = ""
		order.UpdatedAt = time.Now().UTC()
		return w.orderRepo.Update(ctx, order)
	}

	receipt, err := w.settlementClient.ReceiptStatus(ctx, pendingTxHash)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			fmt.Printf("order %s tx %s still pending on chain\n", order.OrderHash, pendingTxHash)
			if isPendingCancel {
				order.StatusReason = "cancel_tx_pending_on_chain"
			} else {
				order.StatusReason = "tx_pending_on_chain"
			}
			order.UpdatedAt = time.Now().UTC()
			return w.orderRepo.Update(ctx, order)
		}
		return fmt.Errorf("load transaction receipt: %w", err)
	}

	order.LastCheckedBlock = int64(receipt.BlockNumber.Uint64())
	order.UpdatedAt = time.Now().UTC()

	if receipt.Status == types.ReceiptStatusSuccessful {
		fmt.Printf("order %s tx %s confirmed in block %d, waiting for indexer\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
		if isPendingCancel {
			order.Status = "pending_cancel"
			order.StatusReason = "cancel_tx_confirmed_waiting_for_indexer"
		} else {
			order.Status = "pending_execute"
			order.StatusReason = "tx_confirmed_waiting_for_indexer"
		}
		return w.orderRepo.Update(ctx, order)
	}

	fmt.Printf("order %s tx %s reverted in block %d, reopening order\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
	order.Status = "open"
	if isPendingCancel {
		order.StatusReason = "cancel_tx_reverted_retryable"
		order.CancelledTxHash = ""
	} else {
		order.StatusReason = "tx_reverted_retryable"
		order.SubmittedTxHash = ""
	}
	return w.orderRepo.Update(ctx, order)
}

// buildDeadline 结合 worker 交易时限策略和订单自身 expiry 生成执行 deadline。
func (w *Worker) buildDeadline(order *domain.Order) (*big.Int, error) {
	expiry := mustBigInt(order.Expiry)
	if expiry.Sign() <= 0 {
		return nil, fmt.Errorf("invalid order expiry")
	}

	now := time.Now().UTC()
	deadline := big.NewInt(now.Add(w.cfg.TxDeadline).Unix())
	if expiry.Cmp(deadline) < 0 {
		deadline = new(big.Int).Set(expiry)
	}

	if deadline.Cmp(big.NewInt(now.Unix())) <= 0 {
		return nil, fmt.Errorf("order deadline already expired")
	}

	return deadline, nil
}

// buildSettlementOrder 把数据库订单模型转换成结算合约所需的订单 tuple。
func buildSettlementOrder(order *domain.Order) (chain.SettlementOrder, error) {
	if !common.IsHexAddress(strings.TrimSpace(order.Maker)) {
		return chain.SettlementOrder{}, fmt.Errorf("invalid maker address")
	}
	if !common.IsHexAddress(strings.TrimSpace(order.InputToken)) {
		return chain.SettlementOrder{}, fmt.Errorf("invalid input token address")
	}
	if !common.IsHexAddress(strings.TrimSpace(order.OutputToken)) {
		return chain.SettlementOrder{}, fmt.Errorf("invalid output token address")
	}
	if !common.IsHexAddress(strings.TrimSpace(order.Recipient)) {
		return chain.SettlementOrder{}, fmt.Errorf("invalid recipient address")
	}

	return chain.SettlementOrder{
		Maker:           common.HexToAddress(order.Maker),
		InputToken:      common.HexToAddress(order.InputToken),
		OutputToken:     common.HexToAddress(order.OutputToken),
		AmountIn:        mustBigInt(order.AmountIn),
		MinAmountOut:    mustBigInt(order.MinAmountOut),
		TriggerPriceX18: mustBigInt(order.TriggerPriceX18),
		Expiry:          mustBigInt(order.Expiry),
		Nonce:           mustBigInt(order.Nonce),
		Recipient:       common.HexToAddress(order.Recipient),
	}, nil
}

// shortenReason 截断状态原因字符串，避免写库时出现过长文本。
func shortenReason(reason string) string {
	trimmed := strings.TrimSpace(reason)
	if len(trimmed) <= 255 {
		return trimmed
	}
	return trimmed[:255]
}

// mustBigInt 把十进制字符串解析为 big.Int，解析失败时回退为 0。
func mustBigInt(value string) *big.Int {
	parsed, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok {
		return big.NewInt(0)
	}
	return parsed
}
