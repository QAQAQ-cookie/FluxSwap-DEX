package logic

import (
	"context"
	"fmt"
	"testing"
	"time"

	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestGetOrderReturnsExecutedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1000000000000000000",
		Expiry:             "9999999999",
		Nonce:              "1",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + logicRepeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "updated_by_order_executed_event",
		ExecutedTxHash:     "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		SettledAmountOut:   "120",
		SettledExecutorFee: "1",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_EXECUTED", resp.Notice.Code)
	require.Equal(t, "finalized", resp.Notice.Stage)
}

func TestGetOrderReturnsChainConfirmedExecutedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
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
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "11",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "executed",
		StatusReason:      "confirmed_by_chain_state",
		ExecutedTxHash:    "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_EXECUTED", resp.Notice.Code)
	require.Contains(t, resp.Notice.Message, "按链上状态确认")
	require.Contains(t, resp.Notice.Hint, "不要假设成交明细已经完整")
}

func TestGetOrderReturnsChainConfirmedCancelledNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "12",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "confirmed_by_chain_state",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CANCELLED", resp.Notice.Code)
	require.Contains(t, resp.Notice.Message, "按链上状态确认撤销")
	require.Contains(t, resp.Notice.Hint, "不要假设 cancelledTxHash 一定存在")
}

func TestGetOrderReturnsBalanceBlockedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "2",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "insufficient_balance",
		LastBlockReason:   "insufficient_balance_required_100_actual_10_token_0x3333333333333333333333333333333333333333",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_BLOCKED_BY_BALANCE", resp.Notice.Code)
	require.Equal(t, "readiness", resp.Notice.Stage)
}

func TestGetOrderReturnsPendingCancelNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
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
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "3",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_confirmed_waiting_for_indexer",
		CancelledTxHash:   "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CANCELLATION_CONFIRMING", resp.Notice.Code)
	require.Equal(t, "cancel", resp.Notice.Stage)
}

func TestGetOrderReturnsRetryableOpenNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "4",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "tx_reverted_retryable",
		LastBlockReason:   "tx_reverted_retryable",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_RETRYABLE", resp.Notice.Code)
	require.Equal(t, "recovery", resp.Notice.Stage)
}

func TestGetOrderReturnsInvalidPayloadNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x0101010101010101010101010101010101010101010101010101010101010101",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "13",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "order_payload_invalid: invalid input token address",
		LastBlockReason:   "order_payload_invalid: invalid input token address",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_RECORD_INVALID_PAYLOAD", resp.Notice.Code)
	require.Equal(t, "recovery", resp.Notice.Stage)
}

func TestGetOrderReturnsPendingTxLostNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x0202020202020202020202020202020202020202020202020202020202020202",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "14",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "pending_without_valid_tx_hash",
		LastBlockReason:   "pending_without_valid_tx_hash",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_PENDING_TX_LOST", resp.Notice.Code)
	require.Equal(t, "recovery", resp.Notice.Stage)
}

func TestGetOrderReturnsPairBlockedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1111111111111111111111111111111111111111111111111111111111111111",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "5",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "PAIR_NOT_FOUND",
		LastBlockReason:   "PAIR_NOT_FOUND",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_BLOCKED_BY_PAIR", resp.Notice.Code)
	require.Equal(t, "readiness", resp.Notice.Stage)
}

func TestGetOrderReturnsPriceBlockedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
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
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "6",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "PRICE_NOT_REACHED",
		LastBlockReason:   "PRICE_NOT_REACHED",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_BLOCKED_BY_PRICE", resp.Notice.Code)
}

func TestGetOrderReturnsLiquidityBlockedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1313131313131313131313131313131313131313131313131313131313131313",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "7",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "INSUFFICIENT_OUTPUT",
		LastBlockReason:   "INSUFFICIENT_OUTPUT",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_BLOCKED_BY_LIQUIDITY", resp.Notice.Code)
}

func TestGetOrderReturnsInitialExecutorRewardBlockedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1414141414141414141414141414141414141414141414141414141414141414",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "8",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		StatusReason:      "",
		LastBlockReason:   "max_executor_reward_10_below_required_20",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_BLOCKED_BY_EXECUTOR_REWARD", resp.Notice.Code)
}

func TestGetOrderReturnsCreatePhaseChainClientDegradedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1515151515151515151515151515151515151515151515151515151515151515",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "9",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		LastBlockReason:   "chain_client_unavailable_at_create",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CHECK_DEGRADED", resp.Notice.Code)
	require.Equal(t, "readiness", resp.Notice.Stage)
}

func TestGetOrderReturnsCreatePhaseFeeQuoteDegradedNotice(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1616161616161616161616161616161616161616161616161616161616161616",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "10",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		LastBlockReason:   "initial_executor_fee_quote_failed: router unavailable",
	})

	logic := NewGetOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrder(&executor.GetOrderRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CHECK_DEGRADED", resp.Notice.Code)
	require.Equal(t, "readiness", resp.Notice.Stage)
}

func openGetOrderTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:get_order_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

func createGetOrderFixture(t *testing.T, db *gorm.DB, order *domain.Order) *domain.Order {
	t.Helper()

	now := time.Now().UTC()
	order.CreatedAt = now
	order.UpdatedAt = now
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	return order
}
