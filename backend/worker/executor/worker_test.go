package executor

import (
	"context"
	"fmt"
	"math/big"
	"testing"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type stubSettlementClient struct {
	settlementAddress string
	currentBlockTime  uint64
	currentBlockErr   error
	currentBlockHook  func()
	fundingCheck      *chain.FundingCheckResult
	fundingCheckErr   error
	cancelValidation  *chain.CancelTxValidationResult
	cancelValidateErr error
	canExecute        bool
	canExecuteReason  string
	canExecuteErr     error
	canExecuteCalled  bool
	receipt           *types.Receipt
	receiptErr        error
	transactionKnown  bool
	transactionErr    error
	orderExecuted     bool
	orderExecutedErr  error
	nonceInvalidated  bool
	nonceInvalidErr   error
	executionResult   *chain.ExecutionResult
	executionErr      error
	suggestFee        *big.Int
	suggestGasPrice   *big.Int
	suggestFeeErr     error
	orderQuote        *big.Int
	orderQuoteErr     error
	executeTxHash     string
	executeErr        error
	executeDeadline   *big.Int
	executeReward     *big.Int
}

func (s *stubSettlementClient) Close() {}

func (s *stubSettlementClient) SettlementAddress() string {
	return s.settlementAddress
}

func (s *stubSettlementClient) CurrentBlockTimestamp(context.Context) (uint64, error) {
	if s.currentBlockHook != nil {
		s.currentBlockHook()
	}
	return s.currentBlockTime, s.currentBlockErr
}

func (s *stubSettlementClient) CheckMakerFunding(context.Context, chain.SettlementOrder) (*chain.FundingCheckResult, error) {
	return s.fundingCheck, s.fundingCheckErr
}

func (s *stubSettlementClient) ValidateCancelTransaction(context.Context, string, string, *big.Int) (*chain.CancelTxValidationResult, error) {
	return s.cancelValidation, s.cancelValidateErr
}

func (s *stubSettlementClient) CanExecuteOrder(context.Context, chain.SettlementOrder) (bool, string, error) {
	s.canExecuteCalled = true
	if s.canExecuteErr != nil {
		return false, "", s.canExecuteErr
	}
	return s.canExecute, s.canExecuteReason, nil
}

func (s *stubSettlementClient) SuggestExecutorFee(context.Context, common.Address, uint64, int64) (*big.Int, *big.Int, error) {
	if s.suggestFeeErr != nil {
		return nil, nil, s.suggestFeeErr
	}
	if s.suggestFee == nil {
		return nil, nil, fmt.Errorf("unexpected call")
	}
	return s.suggestFee, s.suggestGasPrice, nil
}

func (s *stubSettlementClient) GetOrderQuote(context.Context, chain.SettlementOrder) (*big.Int, error) {
	if s.orderQuoteErr != nil {
		return nil, s.orderQuoteErr
	}
	if s.orderQuote == nil {
		return big.NewInt(1000), nil
	}
	return new(big.Int).Set(s.orderQuote), nil
}

func (s *stubSettlementClient) ExecuteOrder(_ context.Context, _ chain.SettlementOrder, _ []byte, deadline *big.Int, executorReward *big.Int) (string, error) {
	if deadline != nil {
		s.executeDeadline = new(big.Int).Set(deadline)
	} else {
		s.executeDeadline = nil
	}
	if executorReward != nil {
		s.executeReward = new(big.Int).Set(executorReward)
	} else {
		s.executeReward = nil
	}
	if s.executeErr != nil {
		return "", s.executeErr
	}
	if s.executeTxHash == "" {
		return "", fmt.Errorf("unexpected call")
	}
	return s.executeTxHash, nil
}

func (s *stubSettlementClient) ReceiptStatus(context.Context, string) (*types.Receipt, error) {
	return s.receipt, s.receiptErr
}

func (s *stubSettlementClient) TransactionKnown(context.Context, string) (bool, error) {
	return s.transactionKnown, s.transactionErr
}

func (s *stubSettlementClient) IsOrderExecuted(context.Context, string) (bool, error) {
	return s.orderExecuted, s.orderExecutedErr
}

func (s *stubSettlementClient) IsNonceInvalidated(context.Context, string, *big.Int) (bool, error) {
	return s.nonceInvalidated, s.nonceInvalidErr
}

func (s *stubSettlementClient) ParseExecutionResult(*types.Receipt, string) (*chain.ExecutionResult, error) {
	return s.executionResult, s.executionErr
}

// 交易已确认但 indexer 尚未回写时，worker 应能根据链上最终状态直接把订单收敛为 executed。
func TestCheckPendingReceiptClosesExecutedOrderByChainState(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "7",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(123),
			},
			orderExecuted: true,
			executionResult: &chain.ExecutionResult{
				GrossAmountOut:     big.NewInt(95),
				RecipientAmountOut: big.NewInt(94),
				ExecutorFeeAmount:  big.NewInt(1),
			},
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.CancelledTxHash)
	require.Equal(t, order.SubmittedTxHash, stored.ExecutedTxHash)
	require.Equal(t, "95", stored.SettledAmountOut)
	require.Equal(t, "1", stored.SettledExecutorFee)
	require.Equal(t, int64(123), stored.LastCheckedBlock)
}

// 撤单交易已确认但 indexer 尚未回写时，worker 应能根据链上 nonce 状态直接把订单收敛为 cancelled。
func TestCheckPendingReceiptClosesCancelledOrderByChainState(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "8",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_waiting_for_indexer",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ExecutedTxHash:    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(456),
			},
			nonceInvalidated: true,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, order.CancelledTxHash, stored.CancelledTxHash)
	require.Equal(t, int64(456), stored.LastCheckedBlock)
}

func TestCheckPendingReceiptClosesCancelledOrderByChainStateAfterRevertedCancel(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xabababababababababababababababababababababababababababababababab",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "18",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ExecutedTxHash:    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusFailed,
				BlockNumber: big.NewInt(777),
			},
			nonceInvalidated: true,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, order.CancelledTxHash, stored.CancelledTxHash)
}

func TestEvaluateOrderMarksExpiredOrderByChainTime(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "100",
		Nonce:             "10",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  200,
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "expired", stored.Status)
	require.Equal(t, "expired_by_chain_time", stored.StatusReason)
	require.Equal(t, "ORDER_EXPIRED", stored.LastBlockReason)
	require.False(t, client.canExecuteCalled)
}

func TestEvaluateOrderClosesExecutedOrderByChainStateBeforeExpiring(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xedededededededededededededededededededededededededededededededed",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "100",
		Nonce:             "40",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  200,
		orderExecuted:     true,
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.LastBlockReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.CancelledTxHash)
	require.False(t, client.canExecuteCalled)
}

func TestEvaluateOrderClosesCancelledOrderByChainStateBeforeExpiring(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfcfc",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "100",
		Nonce:             "41",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  200,
		nonceInvalidated:  true,
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.LastBlockReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.False(t, client.canExecuteCalled)
}

func TestEvaluateOrderBlocksOnInsufficientBalance(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1212121212121212121212121212121212121212121212121212121212121212",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "12",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        true,
			fundingCheck: &chain.FundingCheckResult{
				Token:              common.HexToAddress(order.InputToken),
				Balance:            big.NewInt(50),
				Allowance:          big.NewInt(100),
				RequiredAmountIn:   big.NewInt(100),
				HasEnoughBalance:   false,
				HasEnoughAllowance: true,
			},
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "insufficient_balance", stored.StatusReason)
	require.Contains(t, stored.LastBlockReason, "insufficient_balance_required_100_actual_50")
}

func TestEvaluateOrderBlocksOnInsufficientAllowance(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x3434343434343434343434343434343434343434343434343434343434343434",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "13",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        true,
			fundingCheck: &chain.FundingCheckResult{
				Token:              common.HexToAddress(order.InputToken),
				Balance:            big.NewInt(100),
				Allowance:          big.NewInt(60),
				RequiredAmountIn:   big.NewInt(100),
				HasEnoughBalance:   true,
				HasEnoughAllowance: false,
			},
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "insufficient_allowance", stored.StatusReason)
	require.Contains(t, stored.LastBlockReason, "insufficient_allowance_required_100_actual_60")
}

func TestEvaluateOrderClosesExecutedOrderWhenReadinessReportsAlreadyExecuted(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x4343434343434343434343434343434343434343434343434343434343434343",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "35",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        false,
			canExecuteReason:  "ORDER_ALREADY_EXECUTED",
			orderExecuted:     true,
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.LastBlockReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestEvaluateOrderClosesCancelledOrderWhenReadinessReportsInvalidatedNonce(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5353535353535353535353535353535353535353535353535353535353535353",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "36",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ExecutedTxHash:    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        false,
			canExecuteReason:  "NONCE_INVALIDATED",
			nonceInvalidated:  true,
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.LastBlockReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
}

// 协议级阻塞如暂停或未配置执行器时，worker 应在冷却窗口内跳过重复链上检查，避免高频空转。
func TestEvaluateOrderSkipsProtocolBlockedOrderDuringCooldown(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            "0x6363636363636363636363636363636363636363636363636363636363636363",
		Maker:                "0x2222222222222222222222222222222222222222",
		InputToken:           "0x3333333333333333333333333333333333333333",
		OutputToken:          "0x4444444444444444444444444444444444444444",
		AmountIn:             "100",
		MinAmountOut:         "90",
		ExecutorFee:          "1",
		ExecutorFeeToken:     "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:      "1",
		Expiry:               "9999999999",
		Nonce:                "37",
		Recipient:            "0x5555555555555555555555555555555555555555",
		Signature:            validWorkerTestSignature(),
		Source:               "test",
		Status:               "open",
		StatusReason:         "PAUSED",
		LastBlockReason:      "PAUSED",
		LastExecutionCheckAt: now,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  10,
		canExecute:        false,
		canExecuteReason:  "PAUSED",
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337, ProtocolBlockedRetryInterval: 30 * time.Second},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "PAUSED", stored.StatusReason)
	require.False(t, client.canExecuteCalled)
}

// 冷却窗口过后，协议级阻塞单仍应恢复检查并刷新阻塞原因，保证恢复后能重新进入执行流程。
func TestEvaluateOrderRechecksProtocolBlockedOrderAfterCooldown(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	lastCheckAt := now.Add(-time.Minute)
	order := &domain.Order{
		ChainID:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            "0x6464646464646464646464646464646464646464646464646464646464646464",
		Maker:                "0x2222222222222222222222222222222222222222",
		InputToken:           "0x3333333333333333333333333333333333333333",
		OutputToken:          "0x4444444444444444444444444444444444444444",
		AmountIn:             "100",
		MinAmountOut:         "90",
		ExecutorFee:          "1",
		ExecutorFeeToken:     "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:      "1",
		Expiry:               "9999999999",
		Nonce:                "38",
		Recipient:            "0x5555555555555555555555555555555555555555",
		Signature:            validWorkerTestSignature(),
		Source:               "test",
		Status:               "open",
		StatusReason:         "EXECUTOR_NOT_SET",
		LastBlockReason:      "EXECUTOR_NOT_SET",
		LastExecutionCheckAt: lastCheckAt,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  10,
		canExecute:        false,
		canExecuteReason:  "EXECUTOR_NOT_SET",
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337, ProtocolBlockedRetryInterval: 30 * time.Second},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "EXECUTOR_NOT_SET", stored.StatusReason)
	require.True(t, client.canExecuteCalled)
	require.True(t, stored.LastExecutionCheckAt.After(lastCheckAt))
}

func TestEvaluateOrderClaimsOpenOrderBeforeSubmitting(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5656565656565656565656565656565656565656565656565656565656565656",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "10000",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "26",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337, EstimatedGasUsed: 400000, FeeSafetyBps: 20000, TxDeadline: time.Minute},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        true,
			fundingCheck: &chain.FundingCheckResult{
				Token:              common.HexToAddress(order.InputToken),
				Balance:            big.NewInt(100),
				Allowance:          big.NewInt(100),
				RequiredAmountIn:   big.NewInt(100),
				HasEnoughBalance:   true,
				HasEnoughAllowance: true,
			},
			orderQuote:      big.NewInt(100),
			suggestFee:      big.NewInt(10),
			suggestGasPrice: big.NewInt(1),
			executeTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.SubmittedTxHash)
}

func TestEvaluateOrderPersistsFeeQuoteMetadataAndUsesChainTimeDeadline(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5858585858585858585858585858585858585858585858585858585858585858",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "10000",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "500",
		Nonce:             "32",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	client := &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockTime:  300,
		canExecute:        true,
		fundingCheck: &chain.FundingCheckResult{
			Token:              common.HexToAddress(order.InputToken),
			Balance:            big.NewInt(100),
			Allowance:          big.NewInt(100),
			RequiredAmountIn:   big.NewInt(100),
			HasEnoughBalance:   true,
			HasEnoughAllowance: true,
		},
		orderQuote:      big.NewInt(100),
		suggestFee:      big.NewInt(10),
		suggestGasPrice: big.NewInt(7),
		executeTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	worker := &Worker{
		db:               db,
		cfg:              Config{ChainID: 31337, EstimatedGasUsed: 400000, FeeSafetyBps: 20000, TxDeadline: 2 * time.Minute},
		orderRepo:        repo.NewOrderRepository(db),
		settlementClient: client,
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "400000", stored.EstimatedGasUsed)
	require.Equal(t, "7", stored.GasPriceAtQuote)
	require.Equal(t, "10", stored.LastRequiredExecutorFee)
	require.False(t, stored.LastExecutionCheckAt.IsZero())
	require.False(t, stored.LastFeeCheckAt.IsZero())
	require.False(t, stored.FeeQuoteAt.IsZero())
	require.NotNil(t, client.executeDeadline)
	require.Equal(t, "420", client.executeDeadline.String())
}

func TestCheckPendingReceiptReopensSubmittingExecuteWithoutTxHash(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x6767676767676767676767676767676767676767676767676767676767676767",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "10",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "27",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "submitting_execute",
		StatusReason:      "claimed_for_submission",
		SubmittedTxHash:   "",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "submission_interrupted_before_tx_hash", stored.StatusReason)
}

func TestEvaluateOrderDoesNotOverwritePendingCancelAfterExecutionSubmitted(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x7878787878787878787878787878787878787878787878787878787878787878",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "28",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "submitting_execute",
		StatusReason:      "claimed_for_submission",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	updated, err := repo.NewOrderRepository(db).UpdateFieldsIfStatusIn(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		[]string{"submitting_execute"},
		map[string]interface{}{
			"status":            "pending_cancel",
			"status_reason":     "cancel_tx_submitted_by_user",
			"cancelled_tx_hash": "0x9999999999999999999999999999999999999999999999999999999999999999",
			"updated_at":        now,
		},
	)
	require.NoError(t, err)
	require.True(t, updated)

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337, EstimatedGasUsed: 400000, FeeSafetyBps: 20000, TxDeadline: time.Minute},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        true,
			fundingCheck: &chain.FundingCheckResult{
				Token:              common.HexToAddress(order.InputToken),
				Balance:            big.NewInt(100),
				Allowance:          big.NewInt(100),
				RequiredAmountIn:   big.NewInt(100),
				HasEnoughBalance:   true,
				HasEnoughAllowance: true,
			},
			suggestFee:      big.NewInt(10),
			suggestGasPrice: big.NewInt(1),
			executeTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "cancel_tx_submitted_by_user", stored.StatusReason)
	require.Equal(t, "0x9999999999999999999999999999999999999999999999999999999999999999", stored.CancelledTxHash)
	require.Equal(t, "", stored.SubmittedTxHash)
}

func TestCheckPendingReceiptMarksExpiredAfterRevertedExecute(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "100",
		Nonce:             "11",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  200,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusFailed,
				BlockNumber: big.NewInt(789),
			},
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "expired", stored.Status)
	require.Equal(t, "expired_after_reverted_execute", stored.StatusReason)
	require.Equal(t, "ORDER_EXPIRED", stored.LastBlockReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, int64(789), stored.LastCheckedBlock)
}

func TestCheckPendingReceiptReopensExecuteOrderWhenTransactionDisappears(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9999999999999999999999999999999999999999999999999999999999999999",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "21",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0x1111111111111111111111111111111111111111111111111111111111111111",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("%w: rpc pending", chain.ErrTransactionReceiptNotFound),
			transactionKnown:  false,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "submitted_tx_missing_from_chain_retryable", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
}

func TestCheckPendingReceiptKeepsExecuteOrderPendingWhenTransactionStillKnown(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x8888888888888888888888888888888888888888888888888888888888888888",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "22",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0x2222222222222222222222222222222222222222222222222222222222222222",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("%w: rpc pending", chain.ErrTransactionReceiptNotFound),
			transactionKnown:  true,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "tx_pending_on_chain", stored.StatusReason)
	require.Equal(t, order.SubmittedTxHash, stored.SubmittedTxHash)
}

func TestCheckPendingReceiptReopensCancelOrderWhenTransactionDisappears(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x7777777777777777777777777777777777777777777777777777777777777778",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "23",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0x3333333333333333333333333333333333333333333333333333333333333333",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("%w: rpc pending", chain.ErrTransactionReceiptNotFound),
			transactionKnown:  false,
			nonceInvalidated:  false,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "cancel_tx_missing_from_chain_retryable", stored.StatusReason)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestCheckPendingReceiptClosesCancelOrderWhenTransactionDisappearsButNonceIsInvalidated(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x7777777777777777777777777777777777777777777777777777777777777779",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "24",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		SubmittedTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ExecutedTxHash:    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		CancelledTxHash:   "0x4444444444444444444444444444444444444444444444444444444444444444",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("%w: rpc pending", chain.ErrTransactionReceiptNotFound),
			transactionKnown:  false,
			nonceInvalidated:  true,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, order.CancelledTxHash, stored.CancelledTxHash)
}

func TestCheckPendingReceiptDoesNotOverwriteCancelledOrderWhenExecuteReceiptArrivesLate(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x6666666666666666666666666666666666666666666666666666666666666666",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "29",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	updated, err := repo.NewOrderRepository(db).UpdateFieldsIfStatusIn(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		[]string{"pending_execute"},
		map[string]interface{}{
			"status":            "cancelled",
			"status_reason":     "updated_by_nonce_invalidated_event",
			"cancelled_tx_hash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"updated_at":        now,
		},
	)
	require.NoError(t, err)
	require.True(t, updated)

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(888),
			},
			orderExecuted: true,
			executionResult: &chain.ExecutionResult{
				GrossAmountOut:     big.NewInt(95),
				RecipientAmountOut: big.NewInt(94),
				ExecutorFeeAmount:  big.NewInt(1),
			},
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "", stored.ExecutedTxHash)
}

func TestCheckPendingReceiptDoesNotOverwriteExecutedOrderWhenCancelReceiptArrivesLate(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5555555555555555555555555555555555555555555555555555555555555556",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "30",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	updated, err := repo.NewOrderRepository(db).UpdateFieldsIfStatusIn(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		[]string{"pending_cancel"},
		map[string]interface{}{
			"status":            "executed",
			"status_reason":     "updated_by_order_executed_event",
			"executed_tx_hash":  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
			"cancelled_tx_hash": "",
			"updated_at":        now,
		},
	)
	require.NoError(t, err)
	require.True(t, updated)

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(999),
			},
			nonceInvalidated: true,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestCheckPendingReceiptDoesNotOverwriteCancelledOrderWhenExecuteReceiptWaitsForIndexer(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9292929292929292929292929292929292929292929292929292929292929292",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "33",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	updated, err := repo.NewOrderRepository(db).UpdateFieldsIfStatusIn(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		[]string{"pending_execute"},
		map[string]interface{}{
			"status":            "cancelled",
			"status_reason":     "updated_by_nonce_invalidated_event",
			"cancelled_tx_hash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"updated_at":        now,
		},
	)
	require.NoError(t, err)
	require.True(t, updated)

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(1001),
			},
			orderExecuted: false,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "updated_by_nonce_invalidated_event", stored.StatusReason)
}

func TestCheckPendingReceiptDoesNotOverwriteExecutedOrderWhenCancelReceiptWaitsForIndexer(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9393939393939393939393939393939393939393939393939393939393939393",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "34",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	updated, err := repo.NewOrderRepository(db).UpdateFieldsIfStatusIn(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		[]string{"pending_cancel"},
		map[string]interface{}{
			"status":            "executed",
			"status_reason":     "updated_by_order_executed_event",
			"executed_tx_hash":  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
			"cancelled_tx_hash": "",
			"updated_at":        now,
		},
	)
	require.NoError(t, err)
	require.True(t, updated)

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusSuccessful,
				BlockNumber: big.NewInt(1002),
			},
			nonceInvalidated: false,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "updated_by_order_executed_event", stored.StatusReason)
}

func TestEvaluateOrderDoesNotOverwriteCancelledOrderWhenChainTimeCheckFailsAfterClaim(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x4545454545454545454545454545454545454545454545454545454545454545",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "31",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	orderRepo := repo.NewOrderRepository(db)
	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: orderRepo,
	}
	worker.settlementClient = &stubSettlementClient{
		settlementAddress: order.SettlementAddress,
		currentBlockErr:   fmt.Errorf("rpc unavailable"),
		currentBlockHook: func() {
			updated, err := orderRepo.UpdateFieldsIfStatusIn(
				context.Background(),
				order.ChainID,
				order.SettlementAddress,
				order.OrderHash,
				[]string{"submitting_execute"},
				map[string]interface{}{
					"status":            "cancelled",
					"status_reason":     "updated_by_nonce_invalidated_event",
					"cancelled_tx_hash": "0x9999999999999999999999999999999999999999999999999999999999999999",
					"updated_at":        time.Now().UTC(),
				},
			)
			require.NoError(t, err)
			require.True(t, updated)
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := orderRepo.GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "updated_by_nonce_invalidated_event", stored.StatusReason)
	require.Equal(t, "0x9999999999999999999999999999999999999999999999999999999999999999", stored.CancelledTxHash)
}

func TestEvaluateOrderReopensClaimedOrderWhenChainExecutedCheckFailsBeforeExpiring(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5656565656565656565656565656565656565656565656565656565656565656",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "100",
		Nonce:             "36",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  200,
			orderExecutedErr:  fmt.Errorf("rpc timeout"),
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Contains(t, stored.StatusReason, "chain_state_check_failed:")
	require.Contains(t, stored.LastBlockReason, "chain_state_check_failed:")
}

func TestEvaluateOrderReopensClaimedOrderWhenChainInvalidationCheckFailsAfterTerminalReason(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5757575757575757575757575757575757575757575757575757575757575757",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "37",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        false,
			canExecuteReason:  "NONCE_INVALIDATED",
			nonceInvalidErr:   fmt.Errorf("rpc timeout"),
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Contains(t, stored.StatusReason, "chain_state_check_failed:")
	require.Contains(t, stored.LastBlockReason, "chain_state_check_failed:")
}

func TestEvaluateOrderMarksInconclusiveWhenExecutedReasonCannotBeConfirmed(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5858585858585858585858585858585858585858585858585858585858585858",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "38",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        false,
			canExecuteReason:  "ORDER_ALREADY_EXECUTED",
			orderExecuted:     false,
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "chain_state_inconclusive: order_already_executed", stored.StatusReason)
	require.Equal(t, "chain_state_inconclusive: order_already_executed", stored.LastBlockReason)
}

func TestEvaluateOrderMarksInconclusiveWhenInvalidatedReasonCannotBeConfirmed(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5959595959595959595959595959595959595959595959595959595959595959",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "20",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "39",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			currentBlockTime:  10,
			canExecute:        false,
			canExecuteReason:  "NONCE_INVALIDATED",
			nonceInvalidated:  false,
		},
	}

	require.NoError(t, worker.evaluateOrder(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "chain_state_inconclusive: nonce_invalidated", stored.StatusReason)
	require.Equal(t, "chain_state_inconclusive: nonce_invalidated", stored.LastBlockReason)
}

func TestBuildSettlementOrderRejectsInvalidNumericFields(t *testing.T) {
	baseOrder := &domain.Order{
		Maker:           "0x2222222222222222222222222222222222222222",
		InputToken:      "0x3333333333333333333333333333333333333333",
		OutputToken:     "0x4444444444444444444444444444444444444444",
		AmountIn:        "100",
		MinAmountOut:    "90",
		ExecutorFee:     "1",
		TriggerPriceX18: "1",
		Expiry:          "9999999999",
		Nonce:           "7",
		Recipient:       "0x5555555555555555555555555555555555555555",
	}

	testCases := []struct {
		name        string
		mutate      func(order *domain.Order)
		expectedErr string
	}{
		{
			name: "invalid amount in text",
			mutate: func(order *domain.Order) {
				order.AmountIn = "abc"
			},
			expectedErr: "invalid amount_in",
		},
		{
			name: "zero expiry",
			mutate: func(order *domain.Order) {
				order.Expiry = "0"
			},
			expectedErr: "invalid expiry",
		},
		{
			name: "negative nonce",
			mutate: func(order *domain.Order) {
				order.Nonce = "-1"
			},
			expectedErr: "invalid nonce",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			order := *baseOrder
			tc.mutate(&order)

			_, err := buildSettlementOrder(&order)
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.expectedErr)
		})
	}
}

func TestCheckPendingReceiptReopensCancelOrderWhenLocalNonceIsInvalid(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "bad-nonce",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0x3333333333333333333333333333333333333333333333333333333333333333",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("%w: rpc pending", chain.ErrTransactionReceiptNotFound),
			transactionKnown:  false,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "invalid_nonce_in_order_record", stored.StatusReason)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestCheckPendingReceiptReturnsUnexpectedReceiptErrorWithoutReopeningOrder(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xc3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "35",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0x5555555555555555555555555555555555555555555555555555555555555555",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receiptErr:        fmt.Errorf("upstream rpc timeout"),
		},
	}

	err := worker.checkPendingReceipt(context.Background(), order)
	require.Error(t, err)
	require.Contains(t, err.Error(), "upstream rpc timeout")

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, order.SubmittedTxHash, stored.SubmittedTxHash)
}

func TestCheckPendingReceiptReopensExecuteOrderWhenLocalExpiryIsInvalid(t *testing.T) {
	db := openWorkerTestDB(t)
	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "bad-expiry",
		Nonce:             "23",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         validWorkerTestSignature(),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0x4444444444444444444444444444444444444444444444444444444444444444",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	worker := &Worker{
		db:        db,
		cfg:       Config{ChainID: 31337},
		orderRepo: repo.NewOrderRepository(db),
		settlementClient: &stubSettlementClient{
			settlementAddress: order.SettlementAddress,
			receipt: &types.Receipt{
				Status:      types.ReceiptStatusFailed,
				BlockNumber: big.NewInt(1010),
			},
			currentBlockTime: 100,
		},
	}

	require.NoError(t, worker.checkPendingReceipt(context.Background(), order))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "invalid_expiry_in_order_record", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
}

func openWorkerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:worker_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

func validWorkerTestSignature() string {
	return "0x" +
		"1111111111111111111111111111111111111111111111111111111111111111" +
		"2222222222222222222222222222222222222222222222222222222222222222" +
		"1b"
}

func workerRepeatHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
