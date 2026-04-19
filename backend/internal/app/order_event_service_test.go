package app

import (
	"context"
	"fmt"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// 当订单不存在时，OrderExecuted 事件应直接失败，且不能留下孤立事件记录。
func TestApplyOrderEventRejectsMissingOrderWithoutPersistingEvent(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	_, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    "0x1111111111111111111111111111111111111111",
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Maker:              "0x2222222222222222222222222222222222222222",
		Nonce:              "7",
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var count int64
	require.NoError(t, db.Model(&domain.OrderEvent{}).Count(&count).Error)
	require.Equal(t, int64(0), count)
}

// 这里通过模拟订单表异常，验证 NonceInvalidated 回写不会留下孤立事件记录。
func TestApplyNonceInvalidatedRollsBackWhenOrderUpdateFails(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
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
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	require.NoError(t, db.Exec("DROP TABLE orders").Error)

	_, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		LogIndex:        1,
		BlockNumber:     124,
		OrderHash:       order.OrderHash,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.Error(t, err)

	var count int64
	require.NoError(t, db.Model(&domain.OrderEvent{}).Count(&count).Error)
	require.Equal(t, int64(0), count)
}

func TestRevertOrderExecutedRestoresOpenStateWhenNoEventRemains(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

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
		Nonce:             "7",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	_, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:        0,
		BlockNumber:     123,
		OrderHash:       order.OrderHash,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.StatusReason)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
}

func TestRevertOrderExecutedRestoresExpiredWhenDerivedFromExpired(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacacac",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "79",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "expired",
		StatusReason:      "expired_by_chain_time",
		LastBlockReason:   "ORDER_EXPIRED",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrder, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)
	require.NotNil(t, updatedOrder)
	require.Equal(t, "executed", updatedOrder.Status)
	require.Equal(t, "updated_by_order_executed_event_after_expired", updatedOrder.StatusReason)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:        0,
		BlockNumber:     123,
		OrderHash:       order.OrderHash,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "expired", stored.Status)
	require.Equal(t, "expired_by_chain_time", stored.StatusReason)
	require.Equal(t, "ORDER_EXPIRED", stored.LastBlockReason)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
}

func TestRevertOrderExecutedDoesNotOverwriteUnrelatedConcurrentFields(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	baseTime := time.Now().UTC().Add(-time.Minute)
	feeCheckAt := baseTime.Add(10 * time.Second)
	executionCheckAt := baseTime.Add(20 * time.Second)
	updatedAt := baseTime.Add(30 * time.Second)

	order := &domain.Order{
		ChainID:                 31337,
		SettlementAddress:       "0x1111111111111111111111111111111111111111",
		OrderHash:               "0x9898989898989898989898989898989898989898989898989898989898989898",
		Maker:                   "0x2222222222222222222222222222222222222222",
		InputToken:              "0x3333333333333333333333333333333333333333",
		OutputToken:             "0x4444444444444444444444444444444444444444",
		AmountIn:                "100",
		MinAmountOut:            "90",
		ExecutorFee:             "1",
		ExecutorFeeToken:        "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:         "1",
		Expiry:                  "9999999999",
		Nonce:                   "77",
		Recipient:               "0x5555555555555555555555555555555555555555",
		Signature:               "0x" + repeatHex("11", 65),
		Source:                  "test",
		Status:                  "executed",
		StatusReason:            "updated_by_order_executed_event",
		EstimatedGasUsed:        "400000",
		GasPriceAtQuote:         "12",
		FeeQuoteAt:              baseTime,
		LastRequiredExecutorFee: "15",
		LastFeeCheckAt:          feeCheckAt,
		LastExecutionCheckAt:    executionCheckAt,
		LastBlockReason:         "",
		SettledAmountOut:        "260",
		SettledExecutorFee:      "12",
		SubmittedTxHash:         "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		ExecutedTxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CancelledTxHash:         "",
		LastCheckedBlock:        130,
		CreatedAt:               baseTime.Add(-time.Minute),
		UpdatedAt:               updatedAt,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             order.ExecutedTxHash,
		LogIndex:           1,
		BlockNumber:        130,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "260",
		RecipientAmountOut: "248",
		ExecutorFeeAmount:  "12",
		ObservedAt:         time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          order.ExecutedTxHash,
		LogIndex:        1,
		BlockNumber:     130,
		OrderHash:       order.OrderHash,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.StatusReason)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
	require.Equal(t, "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", stored.SubmittedTxHash)
	require.Equal(t, "400000", stored.EstimatedGasUsed)
	require.Equal(t, "12", stored.GasPriceAtQuote)
	require.Equal(t, "15", stored.LastRequiredExecutorFee)
	require.True(t, stored.LastFeeCheckAt.Equal(feeCheckAt))
	require.True(t, stored.LastExecutionCheckAt.Equal(executionCheckAt))
}

func TestApplyOrderEventTreatsSQLiteUniqueViolationAsDuplicate(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xa8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8a8",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "78",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	params := ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		Nonce:              order.Nonce,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	}

	_, err := service.Apply(context.Background(), params)
	require.NoError(t, err)

	_, err = service.Apply(context.Background(), params)
	require.ErrorIs(t, err, ErrDuplicateOrderEvent)
}

func TestRevertOrderExecutedKeepsConfirmedByChainState(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1",
		Expiry:             "9999999999",
		Nonce:              "11",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + repeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "confirmed_by_chain_state",
		LastBlockReason:    "",
		ExecutedTxHash:     "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		SettledAmountOut:   "200",
		SettledExecutorFee: "10",
		LastCheckedBlock:   123,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          order.ExecutedTxHash,
		LogIndex:        0,
		BlockNumber:     123,
		OrderHash:       order.OrderHash,
		ObservedAt:      time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          order.ExecutedTxHash,
		LogIndex:        0,
		BlockNumber:     123,
		OrderHash:       order.OrderHash,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.ExecutedTxHash)
	require.Equal(t, "200", stored.SettledAmountOut)
	require.Equal(t, "10", stored.SettledExecutorFee)
	require.Equal(t, int64(123), stored.LastCheckedBlock)
}

func TestRevertOrderExecutedRestoresLatestRemainingAmounts(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0x1212121212121212121212121212121212121212121212121212121212121212",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1",
		Expiry:             "9999999999",
		Nonce:              "21",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + repeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "updated_by_order_executed_event",
		ExecutedTxHash:     "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		SettledAmountOut:   "260",
		SettledExecutorFee: "12",
		LastCheckedBlock:   130,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        120,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
		ObservedAt:         time.Now().UTC(),
	}))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             order.ExecutedTxHash,
		LogIndex:           1,
		BlockNumber:        130,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "260",
		RecipientAmountOut: "248",
		ExecutorFeeAmount:  "12",
		ObservedAt:         time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          order.ExecutedTxHash,
		LogIndex:        1,
		BlockNumber:     130,
		OrderHash:       order.OrderHash,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.ExecutedTxHash)
	require.Equal(t, "200", stored.SettledAmountOut)
	require.Equal(t, "10", stored.SettledExecutorFee)
	require.Equal(t, int64(120), stored.LastCheckedBlock)
}

func TestRevertOrderExecutedKeepsCancelledWhenNonceInvalidatedStillExists(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0x3434343434343434343434343434343434343434343434343434343434343434",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1",
		Expiry:             "9999999999",
		Nonce:              "31",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + repeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "updated_by_order_executed_event",
		ExecutedTxHash:     "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		SettledAmountOut:   "260",
		SettledExecutorFee: "12",
		LastCheckedBlock:   130,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             order.ExecutedTxHash,
		LogIndex:           1,
		BlockNumber:        130,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		Nonce:              order.Nonce,
		GrossAmountOut:     "260",
		RecipientAmountOut: "248",
		ExecutorFeeAmount:  "12",
		ObservedAt:         time.Now().UTC(),
	}))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		LogIndex:        2,
		BlockNumber:     131,
		OrderHash:       "",
		Maker:           order.Maker,
		Nonce:           order.Nonce,
		ObservedAt:      time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          order.ExecutedTxHash,
		LogIndex:        1,
		BlockNumber:     130,
		OrderHash:       order.OrderHash,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "updated_by_nonce_invalidated_event", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
	require.Equal(t, int64(131), stored.LastCheckedBlock)
}

func TestRevertOrderExecutedRestoresPendingCancelWhenCancelTxStillRecorded(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x3535353535353535353535353535353535353535353535353535353535353535",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "32",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	_, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           1,
		BlockNumber:        130,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		Nonce:              order.Nonce,
		GrossAmountOut:     "260",
		RecipientAmountOut: "248",
		ExecutorFeeAmount:  "12",
	})
	require.NoError(t, err)

	require.NoError(t, repo.NewOrderRepository(db).UpdateFields(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash, map[string]interface{}{
		"status":               "pending_cancel",
		"status_reason":        "cancel_tx_submitted_by_user",
		"cancelled_tx_hash":    "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		"executed_tx_hash":     "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"settled_amount_out":   "260",
		"settled_executor_fee": "12",
		"last_checked_block":   int64(130),
		"updated_at":           time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:        1,
		BlockNumber:     130,
		OrderHash:       order.OrderHash,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "cancel_tx_submitted_by_user", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
}

func TestRevertOrderExecutedRestoresPendingCancelAfterRealApplyFlow(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x3636363636363636363636363636363636363636363636363636363636363636",
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
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrder, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           1,
		BlockNumber:        130,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		Nonce:              order.Nonce,
		GrossAmountOut:     "260",
		RecipientAmountOut: "248",
		ExecutorFeeAmount:  "12",
	})
	require.NoError(t, err)
	require.NotNil(t, updatedOrder)
	require.Equal(t, "executed", updatedOrder.Status)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "OrderExecuted",
		TxHash:          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:        1,
		BlockNumber:     130,
		OrderHash:       order.OrderHash,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "cancel_tx_submitted_by_user", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
	require.Equal(t, "", stored.ExecutedTxHash)
	require.Equal(t, "0", stored.SettledAmountOut)
	require.Equal(t, "0", stored.SettledExecutorFee)
}

func TestRevertNonceInvalidatedRestoresOpenStateWhenNoEventRemains(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
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
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	_, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.StatusReason)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestRevertNonceInvalidatedKeepsConfirmedByChainState(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

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
		Expiry:            "9999999999",
		Nonce:             "12",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "confirmed_by_chain_state",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LastCheckedBlock:  124,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
		ObservedAt:      time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "confirmed_by_chain_state", stored.StatusReason)
	require.Equal(t, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", stored.CancelledTxHash)
	require.Equal(t, int64(124), stored.LastCheckedBlock)
	require.Equal(t, "", stored.LastBlockReason)
}

func TestRevertNonceInvalidatedKeepsExecutedOrdersWhenAnotherCancelEventRemains(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	executedOrder := &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0xababcdcdababcdcdababcdcdababcdcdababcdcdababcdcdababcdcdababcdcd",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1",
		Expiry:             "9999999999",
		Nonce:              "51",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + repeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "updated_by_order_executed_event",
		ExecutedTxHash:     "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		SettledAmountOut:   "200",
		SettledExecutorFee: "10",
		LastCheckedBlock:   120,
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
	cancelledOrder := &domain.Order{
		ChainID:           31337,
		SettlementAddress: executedOrder.SettlementAddress,
		OrderHash:         "0xcdcdababcdcdababcdcdababcdcdababcdcdababcdcdababcdcdababcdcdabab",
		Maker:             executedOrder.Maker,
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             executedOrder.Nonce,
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("22", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "updated_by_nonce_invalidated_event",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LastCheckedBlock:  130,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), executedOrder))
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), cancelledOrder))

	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: executedOrder.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     130,
		Maker:           executedOrder.Maker,
		Nonce:           executedOrder.Nonce,
		ObservedAt:      time.Now().UTC(),
	}))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: executedOrder.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		LogIndex:        2,
		BlockNumber:     140,
		Maker:           executedOrder.Maker,
		Nonce:           executedOrder.Nonce,
		ObservedAt:      time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: executedOrder.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		LogIndex:        2,
		BlockNumber:     140,
		Maker:           executedOrder.Maker,
		Nonce:           executedOrder.Nonce,
	}))

	storedExecuted, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), executedOrder.ChainID, executedOrder.SettlementAddress, executedOrder.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "executed", storedExecuted.Status)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", storedExecuted.ExecutedTxHash)
	require.Equal(t, "", storedExecuted.CancelledTxHash)

	storedCancelled, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), cancelledOrder.ChainID, cancelledOrder.SettlementAddress, cancelledOrder.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "cancelled", storedCancelled.Status)
	require.Equal(t, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", storedCancelled.CancelledTxHash)
	require.Equal(t, int64(130), storedCancelled.LastCheckedBlock)
}

func TestRevertNonceInvalidatedDoesNotOverwriteChangedPendingOrder(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9191919191919191919191919191919191919191919191919191919191919191",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "61",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "updated_by_nonce_invalidated_event",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LastCheckedBlock:  124,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, repo.NewOrderEventRepository(db).Create(context.Background(), &domain.OrderEvent{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
		ObservedAt:      time.Now().UTC(),
	}))

	require.NoError(t, repo.NewOrderRepository(db).UpdateFields(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash, map[string]interface{}{
		"status":            "pending_execute",
		"status_reason":     "submitted_to_chain",
		"submitted_tx_hash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		"updated_at":        time.Now().UTC(),
	}))

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.SubmittedTxHash)
	require.Equal(t, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", stored.CancelledTxHash)
}

func TestRevertNonceInvalidatedRestoresPendingCancelWhenDerivedFromPendingCancel(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

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
		Nonce:             "63",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrders, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)
	require.Len(t, updatedOrders, 1)
	require.Equal(t, "cancelled", updatedOrders[0].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event_after_pending_cancel", updatedOrders[0].StatusReason)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          order.CancelledTxHash,
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "cancel_tx_submitted_by_user", stored.StatusReason)
	require.Equal(t, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", stored.CancelledTxHash)
	require.Equal(t, int64(0), stored.LastCheckedBlock)
	require.Equal(t, "", stored.LastBlockReason)
}

func TestRevertNonceInvalidatedRestoresPendingExecuteWhenDerivedFromPendingExecute(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9494949494949494949494949494949494949494949494949494949494949494",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "64",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrders, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)
	require.Len(t, updatedOrders, 1)
	require.Equal(t, "cancelled", updatedOrders[0].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event_after_pending_execute", updatedOrders[0].StatusReason)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.SubmittedTxHash)
	require.Equal(t, "", stored.CancelledTxHash)
	require.Equal(t, int64(0), stored.LastCheckedBlock)
	require.Equal(t, "", stored.LastBlockReason)
}

func TestRevertNonceInvalidatedRestoresExpiredWhenDerivedFromExpired(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x9595959595959595959595959595959595959595959595959595959595959595",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "65",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "expired",
		StatusReason:      "expired_by_chain_time",
		LastBlockReason:   "ORDER_EXPIRED",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrders, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)
	require.Len(t, updatedOrders, 1)
	require.Equal(t, "cancelled", updatedOrders[0].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event_after_expired", updatedOrders[0].StatusReason)

	require.NoError(t, service.Revert(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	}))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "expired", stored.Status)
	require.Equal(t, "expired_by_chain_time", stored.StatusReason)
	require.Equal(t, "", stored.CancelledTxHash)
	require.Equal(t, int64(0), stored.LastCheckedBlock)
	require.Equal(t, "ORDER_EXPIRED", stored.LastBlockReason)
}

func TestGuardedUpdateOrderStatusTreatsMatchingStateAsIdempotent(t *testing.T) {
	db := openTestDB(t)
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
		Nonce:             "62",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "updated_by_nonce_invalidated_event",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LastCheckedBlock:  124,
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	err := guardedUpdateOrderStatus(
		context.Background(),
		repo.NewOrderRepository(db),
		order,
		[]string{"cancelled"},
		map[string]interface{}{
			"status":             "cancelled",
			"status_reason":      "updated_by_nonce_invalidated_event",
			"cancelled_tx_hash":  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			"last_checked_block": int64(124),
			"last_block_reason":  "",
			"updated_at":         time.Now().UTC(),
		},
	)
	require.NoError(t, err)
}

func TestApplyOrderExecutedDoesNotOverwriteCancelledOrder(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xf1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "41",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "cancelled",
		StatusReason:      "confirmed_by_chain_state",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrder, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)
	require.NotNil(t, updatedOrder)
	require.Equal(t, "cancelled", updatedOrder.Status)
	require.Equal(t, "", updatedOrder.ExecutedTxHash)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "cancelled", stored.Status)
	require.Equal(t, "", stored.ExecutedTxHash)
}

func TestApplyOrderExecutedClosesPendingCancelOrderAsExecuted(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xf3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "43",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrder, err := service.Apply(context.Background(), ApplyOrderEventParams{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          "OrderExecuted",
		TxHash:             "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:           0,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)
	require.NotNil(t, updatedOrder)
	require.Equal(t, "executed", updatedOrder.Status)
	require.Equal(t, "updated_by_order_executed_event_after_pending_cancel", updatedOrder.StatusReason)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", updatedOrder.ExecutedTxHash)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", updatedOrder.CancelledTxHash)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "updated_by_order_executed_event_after_pending_cancel", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.ExecutedTxHash)
	require.Equal(t, "200", stored.SettledAmountOut)
	require.Equal(t, "10", stored.SettledExecutorFee)
}

func TestApplyNonceInvalidatedDoesNotOverwriteExecutedOrder(t *testing.T) {
	db := openTestDB(t)
	service := NewOrderEventService(db)

	order := &domain.Order{
		ChainID:            31337,
		SettlementAddress:  "0x1111111111111111111111111111111111111111",
		OrderHash:          "0xf2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2",
		Maker:              "0x2222222222222222222222222222222222222222",
		InputToken:         "0x3333333333333333333333333333333333333333",
		OutputToken:        "0x4444444444444444444444444444444444444444",
		AmountIn:           "100",
		MinAmountOut:       "90",
		ExecutorFee:        "1",
		ExecutorFeeToken:   "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:    "1",
		Expiry:             "9999999999",
		Nonce:              "42",
		Recipient:          "0x5555555555555555555555555555555555555555",
		Signature:          "0x" + repeatHex("11", 65),
		Source:             "test",
		Status:             "executed",
		StatusReason:       "confirmed_by_chain_state",
		ExecutedTxHash:     "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		SettledAmountOut:   "200",
		SettledExecutorFee: "10",
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	updatedOrders, err := service.ApplyNonceInvalidated(context.Background(), ApplyOrderEventParams{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       "NonceInvalidated",
		TxHash:          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		LogIndex:        1,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)
	require.Len(t, updatedOrders, 0)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "executed", stored.Status)
	require.Equal(t, "", stored.CancelledTxHash)
}

// 测试统一使用内存 SQLite，保证本地无需额外数据库依赖即可执行。
func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:order_event_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

// 生成固定长度的十六进制内容，方便构造签名占位值。
func repeatHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
