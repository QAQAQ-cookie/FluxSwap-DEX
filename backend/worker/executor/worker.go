package executor

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"gorm.io/gorm"
)

// Config 控制执行器 worker 的运行参数和链连接配置。
type Config struct {
	ChainID                      int64
	RPCURL                       string
	SettlementAddress            string
	ExecutorPrivateKey           string
	ScanInterval                 time.Duration
	ReceiptPollInterval          time.Duration
	BatchSize                    int
	TxDeadline                   time.Duration
	EstimatedGasUsed             uint64
	FeeSafetyBps                 int64
	ProtocolBlockedRetryInterval time.Duration
}

// Worker 负责扫描 open 订单、提交可执行订单，并跟踪 pending 交易回执。
type Worker struct {
	db               *gorm.DB
	cfg              Config
	orderRepo        *repo.OrderRepository
	settlementClient settlementChainClient
}

// settlementChainClient 抽象执行器对链客户端的最小依赖，方便注入测试桩。
type settlementChainClient interface {
	Close()
	SettlementAddress() string
	CurrentBlockTimestamp(ctx context.Context) (uint64, error)
	CheckMakerFunding(ctx context.Context, order chain.SettlementOrder) (*chain.FundingCheckResult, error)
	CanExecuteOrder(ctx context.Context, order chain.SettlementOrder) (bool, string, error)
	GetOrderQuote(ctx context.Context, order chain.SettlementOrder) (*big.Int, error)
	SuggestExecutorFee(ctx context.Context, outputToken common.Address, estimatedGasUsed uint64, safetyBps int64) (*big.Int, *big.Int, error)
	ExecuteOrder(ctx context.Context, order chain.SettlementOrder, signature []byte, deadline *big.Int, executorReward *big.Int) (string, error)
	ReceiptStatus(ctx context.Context, txHash string) (*types.Receipt, error)
	TransactionKnown(ctx context.Context, txHash string) (bool, error)
	IsOrderExecuted(ctx context.Context, orderHash string) (bool, error)
	IsNonceInvalidated(ctx context.Context, maker string, nonce *big.Int) (bool, error)
	ParseExecutionResult(receipt *types.Receipt, orderHash string) (*chain.ExecutionResult, error)
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
	if cfg.EstimatedGasUsed == 0 {
		cfg.EstimatedGasUsed = 400000
	}
	if cfg.FeeSafetyBps <= 0 {
		cfg.FeeSafetyBps = 20000
	}
	if cfg.ProtocolBlockedRetryInterval <= 0 {
		cfg.ProtocolBlockedRetryInterval = 30 * time.Second
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
	// 创建 open 订单扫描定时器，按固定周期寻找新的可执行订单。
	scanTicker := time.NewTicker(w.cfg.ScanInterval)
	// 函数退出时停止扫描定时器，避免资源泄漏。
	defer scanTicker.Stop()
	// 创建 pending 订单回执轮询定时器，按固定周期对账已提交交易。
	receiptTicker := time.NewTicker(w.cfg.ReceiptPollInterval)
	// 函数退出时停止回执定时器。
	defer receiptTicker.Stop()

	// 启动后先立刻执行一次 open 订单扫描，不必等第一个 ticker 周期。
	if err := w.scanOnce(ctx); err != nil {
		return err
	}
	// 启动后也先立刻执行一次 pending 对账，尽快收口已有待处理订单。
	if err := w.reconcilePendingOnce(ctx); err != nil {
		return err
	}

	// 进入长期运行循环，在“停机 / 扫描 / 对账”三类事件之间切换。
	for {
		select {
		// 上层要求退出时，直接把 ctx 的结束原因返回给 supervisor。
		case <-ctx.Done():
			return ctx.Err()
		// 到达扫描周期时，检查 open 订单是否已经满足执行条件。
		case <-scanTicker.C:
			if err := w.scanOnce(ctx); err != nil {
				return err
			}
		// 到达回执轮询周期时，对账 pending_execute / pending_cancel 订单。
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
	if shouldDelayProtocolBlockedRecheck(order, time.Now().UTC(), w.cfg.ProtocolBlockedRetryInterval) {
		return nil
	}

	payload, err := buildSettlementOrder(order)
	if err != nil {
		now := time.Now().UTC()
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			[]string{"open"},
			map[string]interface{}{
				"status":        "open",
				"status_reason": shortenReason("order_payload_invalid: " + err.Error()),
				"updated_at":    now,
			},
		)
	}

	now := time.Now().UTC()
	allowedStatuses := []string{"open"}
	if strings.TrimSpace(order.Status) == "open" {
		claimed, claimErr := w.orderRepo.ClaimOpenOrderForExecution(
			ctx,
			order.ChainID,
			order.SettlementAddress,
			order.OrderHash,
			now,
		)
		if claimErr != nil {
			return claimErr
		}
		if !claimed {
			return nil
		}

		refreshedOrder, refreshedErr := w.orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
		if refreshedErr != nil {
			return refreshedErr
		}
		*order = *refreshedOrder
		allowedStatuses = []string{"submitting_execute"}
	}

	baseUpdates := map[string]interface{}{
		"last_execution_check_at": now,
		"updated_at":              now,
	}

	currentBlockTimestamp, timeErr := w.settlementClient.CurrentBlockTimestamp(ctx)
	if timeErr != nil {
		reason := shortenReason("chain_time_unavailable: " + timeErr.Error())
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			allowedStatuses,
			withExecutionMetadata(baseUpdates, map[string]interface{}{
				"status":            "open",
				"status_reason":     reason,
				"last_block_reason": reason,
			}),
		)
	}
	if payload.Expiry.Sign() > 0 && payload.Expiry.Uint64() <= currentBlockTimestamp {
		executed, executedErr := w.settlementClient.IsOrderExecuted(ctx, order.OrderHash)
		if executedErr != nil {
			statusReason := shortenReason("chain_state_check_failed: " + executedErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}
		if executed {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "executed",
					"status_reason":     "confirmed_by_chain_state",
					"last_block_reason": "",
					"submitted_tx_hash": "",
					"cancelled_tx_hash": "",
				}),
			)
		}

		invalidated, invalidatedErr := w.settlementClient.IsNonceInvalidated(ctx, order.Maker, payload.Nonce)
		if invalidatedErr != nil {
			statusReason := shortenReason("chain_state_check_failed: " + invalidatedErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}
		if invalidated {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "cancelled",
					"status_reason":     "confirmed_by_chain_state",
					"last_block_reason": "",
					"submitted_tx_hash": "",
					"executed_tx_hash":  "",
				}),
			)
		}

		return w.updateOrderIfStatusIn(
			ctx,
			order,
			allowedStatuses,
			withExecutionMetadata(baseUpdates, map[string]interface{}{
				"status":            "expired",
				"status_reason":     "expired_by_chain_time",
				"last_block_reason": "ORDER_EXPIRED",
			}),
		)
	}

	executable, reason, err := w.settlementClient.CanExecuteOrder(ctx, payload)
	if err != nil {
		statusReason := shortenReason("can_execute_failed: " + err.Error())
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			allowedStatuses,
			withExecutionMetadata(baseUpdates, map[string]interface{}{
				"status":            "open",
				"status_reason":     statusReason,
				"last_block_reason": statusReason,
			}),
		)
	}

	if executable {
		fundingCheck, fundingErr := w.settlementClient.CheckMakerFunding(ctx, payload)
		if fundingErr != nil {
			statusReason := shortenReason("funding_check_failed: " + fundingErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}
		if !fundingCheck.HasEnoughBalance {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":        "open",
					"status_reason": "insufficient_balance",
					"last_block_reason": shortenReason(
						fmt.Sprintf(
							"insufficient_balance_required_%s_actual_%s_token_%s",
							fundingCheck.RequiredAmountIn.String(),
							fundingCheck.Balance.String(),
							fundingCheck.Token.Hex(),
						),
					),
				}),
			)
		}
		if !fundingCheck.HasEnoughAllowance {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":        "open",
					"status_reason": "insufficient_allowance",
					"last_block_reason": shortenReason(
						fmt.Sprintf(
							"insufficient_allowance_required_%s_actual_%s_token_%s",
							fundingCheck.RequiredAmountIn.String(),
							fundingCheck.Allowance.String(),
							fundingCheck.Token.Hex(),
						),
					),
				}),
			)
		}

		quotedAmountOut, quoteErr := w.settlementClient.GetOrderQuote(ctx, payload)
		if quoteErr != nil {
			statusReason := shortenReason("order_quote_failed: " + quoteErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}

		maxExecutorReward := calculateMaxExecutorReward(payload, quotedAmountOut)
		requiredExecutorFee, gasPriceAtQuote, feeErr := w.settlementClient.SuggestExecutorFee(
			ctx,
			payload.OutputToken,
			w.cfg.EstimatedGasUsed,
			w.cfg.FeeSafetyBps,
		)
		if feeErr != nil {
			statusReason := shortenReason("executor_fee_quote_failed: " + feeErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
					"last_fee_check_at": now,
				}),
			)
		}

		feeQuoteUpdates := withExecutionMetadata(baseUpdates, map[string]interface{}{
			"estimated_gas_used":         new(big.Int).SetUint64(w.cfg.EstimatedGasUsed).String(),
			"gas_price_at_quote":         gasPriceAtQuote.String(),
			"fee_quote_at":               now,
			"last_fee_check_at":          now,
			"last_required_executor_fee": requiredExecutorFee.String(),
		})

		if maxExecutorReward.Cmp(requiredExecutorFee) < 0 {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(feeQuoteUpdates, map[string]interface{}{
					"status":        "open",
					"status_reason": shortenReason("executor_reward_insufficient_for_current_gas"),
					"last_block_reason": shortenReason(
						fmt.Sprintf("max_executor_reward_%s_below_required_%s", maxExecutorReward.String(), requiredExecutorFee.String()),
					),
				}),
			)
		}

		fmt.Printf("order %s is executable, submitting transaction\n", order.OrderHash)

		signature, sigErr := chain.DecodeHexSignature(order.Signature)
		if sigErr != nil {
			statusReason := shortenReason("invalid_signature: " + sigErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(feeQuoteUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}

		deadline, deadlineErr := w.buildDeadline(order, currentBlockTimestamp)
		if deadlineErr != nil {
			statusReason := shortenReason("deadline_invalid: " + deadlineErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(feeQuoteUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
				}),
			)
		}

		txHash, executeErr := w.settlementClient.ExecuteOrder(ctx, payload, signature, deadline, requiredExecutorFee)
		if executeErr != nil {
			fmt.Printf("submit order %s failed: %v\n", order.OrderHash, executeErr)
			order.StatusReason = shortenReason("submit_failed: " + executeErr.Error())
			order.LastBlockReason = order.StatusReason
			order.UpdatedAt = now
			updated, updateErr := w.orderRepo.UpdateFieldsIfStatusIn(
				ctx,
				order.ChainID,
				order.SettlementAddress,
				order.OrderHash,
				[]string{"submitting_execute"},
				withExecutionMetadata(feeQuoteUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     order.StatusReason,
					"last_block_reason": order.LastBlockReason,
				}),
			)
			if updateErr != nil {
				return updateErr
			}
			if !updated {
				fmt.Printf("order %s submit failed but state already changed, skip overwriting current status\n", order.OrderHash)
				return nil
			}
		} else {
			fmt.Printf("submitted order %s with tx %s\n", order.OrderHash, txHash)
			order.UpdatedAt = now
			updated, updateErr := w.orderRepo.UpdateFieldsIfStatusIn(
				ctx,
				order.ChainID,
				order.SettlementAddress,
				order.OrderHash,
				[]string{"submitting_execute"},
				withExecutionMetadata(feeQuoteUpdates, map[string]interface{}{
					"status":            "pending_execute",
					"status_reason":     "submitted_to_chain",
					"last_block_reason": "",
					"submitted_tx_hash": txHash,
				}),
			)
			if updateErr != nil {
				return updateErr
			}
			if !updated {
				fmt.Printf("order %s execution tx %s submitted but state already changed, skip overwriting current status\n", order.OrderHash, txHash)
				return nil
			}
		}
		return nil
	}

	switch statusReason := strings.TrimSpace(reason); statusReason {
	case "ORDER_ALREADY_EXECUTED":
		executed, stateErr := w.settlementClient.IsOrderExecuted(ctx, order.OrderHash)
		if stateErr != nil {
			checkReason := shortenReason("chain_state_check_failed: " + stateErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     checkReason,
					"last_block_reason": checkReason,
				}),
			)
		}
		if executed {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "executed",
					"status_reason":     "confirmed_by_chain_state",
					"last_block_reason": "",
					"submitted_tx_hash": "",
					"cancelled_tx_hash": "",
				}),
			)
		}
		inconclusiveReason := shortenReason("chain_state_inconclusive: order_already_executed")
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			allowedStatuses,
			withExecutionMetadata(baseUpdates, map[string]interface{}{
				"status":            "open",
				"status_reason":     inconclusiveReason,
				"last_block_reason": inconclusiveReason,
			}),
		)
	case "NONCE_INVALIDATED":
		invalidated, stateErr := w.settlementClient.IsNonceInvalidated(ctx, order.Maker, payload.Nonce)
		if stateErr != nil {
			checkReason := shortenReason("chain_state_check_failed: " + stateErr.Error())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "open",
					"status_reason":     checkReason,
					"last_block_reason": checkReason,
				}),
			)
		}
		if invalidated {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				allowedStatuses,
				withExecutionMetadata(baseUpdates, map[string]interface{}{
					"status":            "cancelled",
					"status_reason":     "confirmed_by_chain_state",
					"last_block_reason": "",
					"submitted_tx_hash": "",
					"executed_tx_hash":  "",
				}),
			)
		}
		inconclusiveReason := shortenReason("chain_state_inconclusive: nonce_invalidated")
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			allowedStatuses,
			withExecutionMetadata(baseUpdates, map[string]interface{}{
				"status":            "open",
				"status_reason":     inconclusiveReason,
				"last_block_reason": inconclusiveReason,
			}),
		)
	}

	statusReason := shortenReason(reason)
	return w.updateOrderIfStatusIn(
		ctx,
		order,
		allowedStatuses,
		withExecutionMetadata(baseUpdates, map[string]interface{}{
			"status":            "open",
			"status_reason":     statusReason,
			"last_block_reason": statusReason,
		}),
	)
}

// checkPendingReceipt 根据订单上记录的 submitted tx hash 对账链上回执状态。
func (w *Worker) checkPendingReceipt(ctx context.Context, order *domain.Order) error {
	isPendingCancel := strings.TrimSpace(order.Status) == "pending_cancel"
	currentPendingStatuses := []string{"pending_execute"}
	if isPendingCancel {
		currentPendingStatuses = []string{"pending_cancel"}
	}
	if strings.TrimSpace(order.Status) == "submitting_execute" {
		if !chain.IsHexHash(strings.TrimSpace(order.SubmittedTxHash)) {
			now := time.Now().UTC()
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				[]string{"submitting_execute"},
				map[string]interface{}{
					"status":            "open",
					"status_reason":     "submission_interrupted_before_tx_hash",
					"last_block_reason": "submission_interrupted_before_tx_hash",
					"updated_at":        now,
				},
			)
		}
		now := time.Now().UTC()
		if err := w.updateOrderIfStatusIn(
			ctx,
			order,
			[]string{"submitting_execute"},
			map[string]interface{}{
				"status":            "pending_execute",
				"status_reason":     "submitted_to_chain",
				"last_block_reason": "",
				"updated_at":        now,
			},
		); err != nil {
			return err
		}
		refreshedOrder, refreshedErr := w.orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
		if refreshedErr != nil {
			return refreshedErr
		}
		*order = *refreshedOrder
	}

	pendingTxHash := strings.TrimSpace(order.SubmittedTxHash)
	if isPendingCancel {
		pendingTxHash = strings.TrimSpace(order.CancelledTxHash)
	}

	if !chain.IsHexHash(pendingTxHash) {
		fmt.Printf("order %s lost pending tx hash, returning to open\n", order.OrderHash)
		now := time.Now().UTC()
		return w.updateOrderIfStatusIn(
			ctx,
			order,
			currentPendingStatuses,
			map[string]interface{}{
				"status":            "open",
				"status_reason":     "pending_without_valid_tx_hash",
				"last_block_reason": "pending_without_valid_tx_hash",
				"submitted_tx_hash": "",
				"cancelled_tx_hash": "",
				"updated_at":        now,
			},
		)
	}

	receipt, err := w.settlementClient.ReceiptStatus(ctx, pendingTxHash)
	if err != nil {
		if errors.Is(err, chain.ErrTransactionReceiptNotFound) {
			txKnown, knownErr := w.settlementClient.TransactionKnown(ctx, pendingTxHash)
			if knownErr != nil {
				return fmt.Errorf("check transaction presence: %w", knownErr)
			}
			if !txKnown {
				if isPendingCancel {
					nonceValue, nonceErr := parseNonNegativeBigInt(order.Nonce, "nonce")
					if nonceErr != nil {
						now := time.Now().UTC()
						return w.updateOrderIfStatusIn(
							ctx,
							order,
							[]string{"pending_cancel"},
							map[string]interface{}{
								"status":            "open",
								"status_reason":     "invalid_nonce_in_order_record",
								"last_block_reason": "invalid_nonce_in_order_record",
								"cancelled_tx_hash": "",
								"updated_at":        now,
							},
						)
					}
					nonceInvalidated, stateErr := w.settlementClient.IsNonceInvalidated(ctx, order.Maker, nonceValue)
					if stateErr != nil {
						return fmt.Errorf("check nonce invalidated state: %w", stateErr)
					}
					if nonceInvalidated {
						fmt.Printf("order %s cancel tx %s disappeared but nonce already invalidated, closing as cancelled\n", order.OrderHash, pendingTxHash)
						now := time.Now().UTC()
						return w.updateOrderIfStatusIn(
							ctx,
							order,
							[]string{"pending_cancel"},
							map[string]interface{}{
								"status":            "cancelled",
								"status_reason":     "confirmed_by_chain_state",
								"last_block_reason": "",
								"submitted_tx_hash": "",
								"executed_tx_hash":  "",
								"updated_at":        now,
							},
						)
					}

					fmt.Printf("order %s cancel tx %s disappeared before receipt was available, reopening order\n", order.OrderHash, pendingTxHash)
					now := time.Now().UTC()
					return w.updateOrderIfStatusIn(
						ctx,
						order,
						[]string{"pending_cancel"},
						map[string]interface{}{
							"status":            "open",
							"status_reason":     "cancel_tx_missing_from_chain_retryable",
							"last_block_reason": "cancel_tx_missing_from_chain_retryable",
							"cancelled_tx_hash": "",
							"updated_at":        now,
						},
					)
				}

				fmt.Printf("order %s tx %s disappeared before receipt was available, reopening order\n", order.OrderHash, pendingTxHash)
				now := time.Now().UTC()
				return w.updateOrderIfStatusIn(
					ctx,
					order,
					[]string{"pending_execute"},
					map[string]interface{}{
						"status":            "open",
						"status_reason":     "submitted_tx_missing_from_chain_retryable",
						"last_block_reason": "submitted_tx_missing_from_chain_retryable",
						"submitted_tx_hash": "",
						"updated_at":        now,
					},
				)
			}

			fmt.Printf("order %s tx %s still pending on chain\n", order.OrderHash, pendingTxHash)
			statusReason := "tx_pending_on_chain"
			if isPendingCancel {
				statusReason = "cancel_tx_pending_on_chain"
			}
			now := time.Now().UTC()
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				currentPendingStatuses,
				map[string]interface{}{
					"status_reason":     statusReason,
					"last_block_reason": statusReason,
					"updated_at":        now,
				},
			)
		}
		return err
	}

	receiptBlockNumber := int64(receipt.BlockNumber.Uint64())
	now := time.Now().UTC()

	if receipt.Status == types.ReceiptStatusSuccessful {
		if isPendingCancel {
			nonceValue, nonceErr := parseNonNegativeBigInt(order.Nonce, "nonce")
			if nonceErr != nil {
				return w.updateOrderIfStatusIn(
					ctx,
					order,
					[]string{"pending_cancel"},
					map[string]interface{}{
						"status":             "cancelled",
						"status_reason":      "cancel_tx_confirmed_with_invalid_local_nonce",
						"last_block_reason":  "",
						"submitted_tx_hash":  "",
						"executed_tx_hash":   "",
						"last_checked_block": int64(receipt.BlockNumber.Uint64()),
						"updated_at":         time.Now().UTC(),
					},
				)
			}
			nonceInvalidated, stateErr := w.settlementClient.IsNonceInvalidated(ctx, order.Maker, nonceValue)
			if stateErr != nil {
				return fmt.Errorf("check nonce invalidated state: %w", stateErr)
			}
			if nonceInvalidated {
				fmt.Printf("order %s cancel tx %s confirmed in block %d and nonce already invalidated on chain\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
				return w.updateOrderIfStatusIn(
					ctx,
					order,
					[]string{"pending_cancel"},
					map[string]interface{}{
						"status":             "cancelled",
						"status_reason":      "confirmed_by_chain_state",
						"last_block_reason":  "",
						"submitted_tx_hash":  "",
						"executed_tx_hash":   "",
						"last_checked_block": int64(receipt.BlockNumber.Uint64()),
						"updated_at":         time.Now().UTC(),
					},
				)
			}

			fmt.Printf("order %s tx %s confirmed in block %d, waiting for indexer\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				[]string{"pending_cancel"},
				map[string]interface{}{
					"status":             "pending_cancel",
					"status_reason":      "cancel_tx_confirmed_waiting_for_indexer",
					"last_block_reason":  "",
					"last_checked_block": receiptBlockNumber,
					"updated_at":         now,
				},
			)
		} else {
			executed, stateErr := w.settlementClient.IsOrderExecuted(ctx, order.OrderHash)
			if stateErr != nil {
				return fmt.Errorf("check executed state: %w", stateErr)
			}
			if executed {
				fmt.Printf("order %s execute tx %s confirmed in block %d and order already marked executed on chain\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
				updates := map[string]interface{}{
					"status":             "executed",
					"status_reason":      "confirmed_by_chain_state",
					"last_block_reason":  "",
					"submitted_tx_hash":  "",
					"cancelled_tx_hash":  "",
					"executed_tx_hash":   pendingTxHash,
					"last_checked_block": int64(receipt.BlockNumber.Uint64()),
					"updated_at":         time.Now().UTC(),
				}
				if executionResult, parseErr := w.settlementClient.ParseExecutionResult(receipt, order.OrderHash); parseErr == nil && executionResult != nil {
					updates["settled_amount_out"] = executionResult.GrossAmountOut.String()
					updates["settled_executor_fee"] = executionResult.ExecutorFeeAmount.String()
				}
				return w.updateOrderIfStatusIn(ctx, order, []string{"pending_execute"}, updates)
			}

			fmt.Printf("order %s tx %s confirmed in block %d, waiting for indexer\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				[]string{"pending_execute"},
				map[string]interface{}{
					"status":             "pending_execute",
					"status_reason":      "tx_confirmed_waiting_for_indexer",
					"last_block_reason":  "",
					"last_checked_block": receiptBlockNumber,
					"updated_at":         now,
				},
			)
		}
	}

	fmt.Printf("order %s tx %s reverted in block %d, reopening order\n", order.OrderHash, pendingTxHash, receipt.BlockNumber.Uint64())
	if isPendingCancel {
		nonceValue, nonceErr := parseNonNegativeBigInt(order.Nonce, "nonce")
		if nonceErr != nil {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				[]string{"pending_cancel"},
				map[string]interface{}{
					"status":             "open",
					"status_reason":      "invalid_nonce_in_order_record",
					"last_block_reason":  "invalid_nonce_in_order_record",
					"cancelled_tx_hash":  "",
					"last_checked_block": receiptBlockNumber,
					"updated_at":         now,
				},
			)
		}
		nonceInvalidated, stateErr := w.settlementClient.IsNonceInvalidated(ctx, order.Maker, nonceValue)
		if stateErr == nil && nonceInvalidated {
			return w.updateOrderIfStatusIn(
				ctx,
				order,
				[]string{"pending_cancel"},
				map[string]interface{}{
					"status":             "cancelled",
					"status_reason":      "confirmed_by_chain_state",
					"last_block_reason":  "",
					"submitted_tx_hash":  "",
					"executed_tx_hash":   "",
					"last_checked_block": int64(receipt.BlockNumber.Uint64()),
					"updated_at":         time.Now().UTC(),
				},
			)
		}

		return w.updateOrderIfStatusIn(
			ctx,
			order,
			[]string{"pending_cancel"},
			map[string]interface{}{
				"status":             "open",
				"status_reason":      "cancel_tx_reverted_retryable",
				"last_block_reason":  "cancel_tx_reverted_retryable",
				"cancelled_tx_hash":  "",
				"last_checked_block": receiptBlockNumber,
				"updated_at":         now,
			},
		)
	} else {
		currentBlockTimestamp, timeErr := w.settlementClient.CurrentBlockTimestamp(ctx)
		if timeErr == nil {
			expiry, expiryErr := parsePositiveBigInt(order.Expiry, "expiry")
			if expiryErr != nil {
				return w.updateOrderIfStatusIn(
					ctx,
					order,
					[]string{"pending_execute"},
					map[string]interface{}{
						"status":             "open",
						"status_reason":      "invalid_expiry_in_order_record",
						"last_block_reason":  "invalid_expiry_in_order_record",
						"submitted_tx_hash":  "",
						"last_checked_block": receiptBlockNumber,
						"updated_at":         now,
					},
				)
			}
			if expiry.Uint64() <= currentBlockTimestamp {
				return w.updateOrderIfStatusIn(
					ctx,
					order,
					[]string{"pending_execute"},
					map[string]interface{}{
						"status":             "expired",
						"status_reason":      "expired_after_reverted_execute",
						"last_block_reason":  "ORDER_EXPIRED",
						"submitted_tx_hash":  "",
						"last_checked_block": receiptBlockNumber,
						"updated_at":         now,
					},
				)
			}
		}

		return w.updateOrderIfStatusIn(
			ctx,
			order,
			[]string{"pending_execute"},
			map[string]interface{}{
				"status":             "open",
				"status_reason":      "tx_reverted_retryable",
				"last_block_reason":  "tx_reverted_retryable",
				"submitted_tx_hash":  "",
				"last_checked_block": receiptBlockNumber,
				"updated_at":         now,
			},
		)
	}
}

// buildDeadline 结合 worker 交易时限策略和订单自身 expiry 生成执行 deadline。
func (w *Worker) buildDeadline(order *domain.Order, chainTimestamp uint64) (*big.Int, error) {
	expiry, err := parsePositiveBigInt(order.Expiry, "order expiry")
	if err != nil {
		return nil, err
	}

	if chainTimestamp == 0 {
		return nil, fmt.Errorf("invalid chain timestamp")
	}

	chainNow := big.NewInt(int64(chainTimestamp))
	deadline := big.NewInt(int64(chainTimestamp + uint64(w.cfg.TxDeadline/time.Second)))
	if expiry.Cmp(deadline) < 0 {
		deadline = new(big.Int).Set(expiry)
	}

	if deadline.Cmp(chainNow) <= 0 {
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

	amountIn, err := parsePositiveBigInt(order.AmountIn, "amount_in")
	if err != nil {
		return chain.SettlementOrder{}, err
	}
	minAmountOut, err := parsePositiveBigInt(order.MinAmountOut, "min_amount_out")
	if err != nil {
		return chain.SettlementOrder{}, err
	}
	maxExecutorRewardBps, err := parseNonNegativeBigInt(order.ExecutorFee, "max_executor_reward_bps")
	if err != nil {
		return chain.SettlementOrder{}, err
	}
	if maxExecutorRewardBps.Cmp(big.NewInt(10_000)) > 0 {
		return chain.SettlementOrder{}, fmt.Errorf("invalid max_executor_reward_bps")
	}
	triggerPriceX18, err := parsePositiveBigInt(order.TriggerPriceX18, "trigger_price_x18")
	if err != nil {
		return chain.SettlementOrder{}, err
	}
	expiry, err := parsePositiveBigInt(order.Expiry, "expiry")
	if err != nil {
		return chain.SettlementOrder{}, err
	}
	nonce, err := parseNonNegativeBigInt(order.Nonce, "nonce")
	if err != nil {
		return chain.SettlementOrder{}, err
	}

	return chain.SettlementOrder{
		Maker:                common.HexToAddress(order.Maker),
		InputToken:           common.HexToAddress(order.InputToken),
		OutputToken:          common.HexToAddress(order.OutputToken),
		AmountIn:             amountIn,
		MinAmountOut:         minAmountOut,
		MaxExecutorRewardBps: maxExecutorRewardBps,
		TriggerPriceX18:      triggerPriceX18,
		Expiry:               expiry,
		Nonce:                nonce,
		Recipient:            common.HexToAddress(order.Recipient),
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

func parsePositiveBigInt(value string, field string) (*big.Int, error) {
	parsed, err := parseNonNegativeBigInt(value, field)
	if err != nil {
		return nil, err
	}
	if parsed.Sign() <= 0 {
		return nil, fmt.Errorf("invalid %s", field)
	}
	return parsed, nil
}

// parseNonNegativeBigInt 严格解析非负整数，常用于 nonce / fee 一类字段。
func parseNonNegativeBigInt(value string, field string) (*big.Int, error) {
	parsed, ok := new(big.Int).SetString(strings.TrimSpace(value), 10)
	if !ok {
		return nil, fmt.Errorf("invalid %s", field)
	}
	if parsed.Sign() < 0 {
		return nil, fmt.Errorf("invalid %s", field)
	}
	return parsed, nil
}

// updateOrderIfStatusIn 带状态保护地更新订单，避免并发流程互相覆盖结果。
// calculateMaxExecutorReward 按合约同款公式计算当前报价下最多可支付给执行器的 surplus 奖励。
func calculateMaxExecutorReward(order chain.SettlementOrder, quotedAmountOut *big.Int) *big.Int {
	if quotedAmountOut == nil || order.MinAmountOut == nil || quotedAmountOut.Cmp(order.MinAmountOut) <= 0 {
		return big.NewInt(0)
	}
	if order.MaxExecutorRewardBps == nil || order.MaxExecutorRewardBps.Sign() <= 0 {
		return big.NewInt(0)
	}

	surplus := new(big.Int).Sub(quotedAmountOut, order.MinAmountOut)
	reward := new(big.Int).Mul(surplus, order.MaxExecutorRewardBps)
	return reward.Div(reward, big.NewInt(10_000))
}

func (w *Worker) updateOrderIfStatusIn(
	ctx context.Context,
	order *domain.Order,
	allowedStatuses []string,
	updates map[string]interface{},
) error {
	updated, err := w.orderRepo.UpdateFieldsIfStatusIn(
		ctx,
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		allowedStatuses,
		updates,
	)
	if err != nil {
		return err
	}
	if updated {
		return nil
	}

	currentOrder, currentErr := w.orderRepo.GetByOrderHash(ctx, order.ChainID, order.SettlementAddress, order.OrderHash)
	if currentErr != nil {
		return currentErr
	}
	if containsOrderStatus(allowedStatuses, currentOrder.Status) {
		return fmt.Errorf("conditional order update skipped unexpectedly for order %s in status %s", currentOrder.OrderHash, currentOrder.Status)
	}

	return nil
}

// containsOrderStatus 判断目标状态是否位于允许更新的状态集合中。
func containsOrderStatus(statuses []string, target string) bool {
	normalizedTarget := strings.TrimSpace(target)
	for _, status := range statuses {
		if strings.TrimSpace(status) == normalizedTarget {
			return true
		}
	}
	return false
}

// withExecutionMetadata 合并本轮执行检查产生的通用元数据与特定状态更新字段。
func withExecutionMetadata(base map[string]interface{}, updates map[string]interface{}) map[string]interface{} {
	merged := make(map[string]interface{}, len(base)+len(updates))
	for key, value := range base {
		merged[key] = value
	}
	for key, value := range updates {
		merged[key] = value
	}
	return merged
}

// shouldDelayProtocolBlockedRecheck 判断协议阻塞型 open 单是否仍处于冷却窗口内。
func shouldDelayProtocolBlockedRecheck(order *domain.Order, now time.Time, retryInterval time.Duration) bool {
	if order == nil || retryInterval <= 0 {
		return false
	}

	if !isProtocolBlockedReason(order.StatusReason, order.LastBlockReason) {
		return false
	}

	lastCheckedAt := order.LastExecutionCheckAt
	if lastCheckedAt.IsZero() {
		return false
	}

	return now.Before(lastCheckedAt.Add(retryInterval))
}

// isProtocolBlockedReason 判断当前阻塞原因是否属于“冷却后再检查”的协议级阻塞。
func isProtocolBlockedReason(statusReason string, lastBlockReason string) bool {
	switch strings.ToUpper(strings.TrimSpace(firstNonEmpty(statusReason, lastBlockReason))) {
	case "PAUSED", "EXECUTOR_NOT_SET":
		return true
	default:
		return false
	}
}

// firstNonEmpty 返回第一项非空字符串，便于在多个状态字段之间做兜底选择。
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}
