package indexer

import (
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"github.com/stretchr/testify/require"
)

func TestApplyEventReturnsSingleOrderSnapshotForOrderExecuted(t *testing.T) {
	db := openIndexerTestDB(t)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "2",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "7",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(t.Context(), order))

	worker := NewWorker(db)
	result, err := worker.ApplyEvent(t.Context(), OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          EventOrderExecuted,
		TxHash:             "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:           1,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 1, result.AffectedCount)
	require.Len(t, result.Orders, 1)
	require.Equal(t, order.OrderHash, result.Orders[0].OrderHash)
	require.Equal(t, "executed", result.Orders[0].Status)
	require.Equal(t, "200", result.Orders[0].SettledAmountOut)
	require.Equal(t, "10", result.Orders[0].SettledExecutorFee)
}

func TestApplyEventRestoresExpiredOrderToExecuted(t *testing.T) {
	db := openIndexerTestDB(t)

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "2",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "70",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("11", 65),
		Source:            "test",
		Status:            "expired",
		StatusReason:      "expired_by_chain_time",
		LastBlockReason:   "ORDER_EXPIRED",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(t.Context(), order))

	worker := NewWorker(db)
	result, err := worker.ApplyEvent(t.Context(), OrderEvent{
		ChainID:            31337,
		ContractAddress:    order.SettlementAddress,
		EventName:          EventOrderExecuted,
		TxHash:             "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		LogIndex:           1,
		BlockNumber:        123,
		OrderHash:          order.OrderHash,
		Maker:              order.Maker,
		GrossAmountOut:     "200",
		RecipientAmountOut: "190",
		ExecutorFeeAmount:  "10",
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 1, result.AffectedCount)
	require.Len(t, result.Orders, 1)
	require.Equal(t, "executed", result.Orders[0].Status)
	require.Equal(t, "updated_by_order_executed_event_after_expired", result.Orders[0].StatusReason)
	require.Equal(t, "200", result.Orders[0].SettledAmountOut)
	require.Equal(t, "10", result.Orders[0].SettledExecutorFee)
}

func TestApplyEventReturnsAllAffectedOrdersForNonceInvalidated(t *testing.T) {
	db := openIndexerTestDB(t)
	orderRepo := repo.NewOrderRepository(db)

	now := time.Now().UTC()
	orderA := &domain.Order{
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
		Nonce:             "9",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	orderB := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "200",
		MinAmountOut:      "180",
		ExecutorFee:       "2",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "2",
		Expiry:            "9999999999",
		Nonce:             "9",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("22", 65),
		Source:            "test",
		Status:            "pending_cancel",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, orderRepo.Create(t.Context(), orderA))
	require.NoError(t, orderRepo.Create(t.Context(), orderB))

	worker := NewWorker(db)
	result, err := worker.ApplyEvent(t.Context(), OrderEvent{
		ChainID:         31337,
		ContractAddress: orderA.SettlementAddress,
		EventName:       EventNonceInvalidated,
		TxHash:          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		LogIndex:        2,
		BlockNumber:     124,
		Maker:           orderA.Maker,
		Nonce:           "9",
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 2, result.AffectedCount)
	require.Len(t, result.Orders, 2)

	ordersByHash := make(map[string]*OrderSnapshot, len(result.Orders))
	for _, item := range result.Orders {
		ordersByHash[item.OrderHash] = item
	}

	require.Contains(t, ordersByHash, orderA.OrderHash)
	require.Contains(t, ordersByHash, orderB.OrderHash)
	require.Equal(t, "cancelled", ordersByHash[orderA.OrderHash].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event", ordersByHash[orderA.OrderHash].StatusReason)
	require.Equal(t, "cancelled", ordersByHash[orderB.OrderHash].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event_after_pending_cancel", ordersByHash[orderB.OrderHash].StatusReason)
}

func TestApplyEventRestoresExpiredOrderToCancelled(t *testing.T) {
	db := openIndexerTestDB(t)
	orderRepo := repo.NewOrderRepository(db)

	now := time.Now().UTC()
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xdededededededededededededededededededededededededededededededede",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "71",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("22", 65),
		Source:            "test",
		Status:            "expired",
		StatusReason:      "expired_by_chain_time",
		LastBlockReason:   "ORDER_EXPIRED",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, orderRepo.Create(t.Context(), order))

	worker := NewWorker(db)
	result, err := worker.ApplyEvent(t.Context(), OrderEvent{
		ChainID:         31337,
		ContractAddress: order.SettlementAddress,
		EventName:       EventNonceInvalidated,
		TxHash:          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		LogIndex:        2,
		BlockNumber:     124,
		Maker:           order.Maker,
		Nonce:           order.Nonce,
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, 1, result.AffectedCount)
	require.Len(t, result.Orders, 1)
	require.Equal(t, "cancelled", result.Orders[0].Status)
	require.Equal(t, "updated_by_nonce_invalidated_event_after_expired", result.Orders[0].StatusReason)
	require.Equal(t, "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", result.Orders[0].CancelledTxHash)
}
