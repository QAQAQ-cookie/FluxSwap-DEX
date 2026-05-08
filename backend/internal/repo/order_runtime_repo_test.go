package repo

import (
	"context"
	"fmt"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAutoMigrateBackfillsOrderRuntime(t *testing.T) {
	dsn := fmt.Sprintf("file:repo_order_runtime_backfill_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)

	require.NoError(t, db.AutoMigrate(&legacyOrderRecord{}))

	now := time.Now().UTC()
	legacy := &legacyOrderRecord{
		ChainID:                 31337,
		SettlementAddress:       "0x1111111111111111111111111111111111111111",
		OrderHash:               "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:                   "0x2222222222222222222222222222222222222222",
		InputToken:              "0x3333333333333333333333333333333333333333",
		OutputToken:             "0x4444444444444444444444444444444444444444",
		AmountIn:                "100",
		MinAmountOut:            "90",
		ExecutorFee:             "1",
		ExecutorFeeToken:        "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:         "1",
		Expiry:                  "9999999999",
		Nonce:                   "1",
		Recipient:               "0x5555555555555555555555555555555555555555",
		Signature:               "0x" + repeatRuntimeHex("11", 65),
		Source:                  "test",
		Status:                  "pending_execute",
		StatusReason:            "submitted_to_chain",
		EstimatedGasUsed:        "400000",
		GasPriceAtQuote:         "12",
		FeeQuoteAt:              now,
		LastRequiredExecutorFee: "15",
		LastFeeCheckAt:          now,
		LastExecutionCheckAt:    now,
		LastBlockReason:         "",
		SettledAmountOut:        "200",
		SettledExecutorFee:      "10",
		SubmittedTxHash:         "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ExecutedTxHash:          "",
		CancelledTxHash:         "",
		LastCheckedBlock:        123,
		CreatedAt:               now,
		UpdatedAt:               now,
	}
	require.NoError(t, db.Create(legacy).Error)

	require.NoError(t, AutoMigrate(db))

	var order domain.Order
	require.NoError(t, db.Where("order_hash = ?", legacy.OrderHash).First(&order).Error)

	runtime, err := NewOrderRuntimeRepository(db).GetByOrderID(context.Background(), order.ID)
	require.NoError(t, err)
	require.Equal(t, "submitted_to_chain", runtime.StatusReason)
	require.Equal(t, "400000", runtime.EstimatedGasUsed)
	require.Equal(t, "12", runtime.GasPriceAtQuote)
	require.Equal(t, "15", runtime.LastRequiredExecutorFee)
	require.Equal(t, "200", runtime.SettledAmountOut)
	require.Equal(t, "10", runtime.SettledExecutorFee)
	require.Equal(t, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", runtime.SubmittedTxHash)
	require.Equal(t, int64(123), runtime.LastCheckedBlock)

	for _, column := range legacyOrderRuntimeColumns {
		require.Falsef(t, db.Migrator().HasColumn("orders", column), "legacy column %s should be dropped", column)
	}
}

func TestOrderRuntimeRepositoryCreateAndUpdate(t *testing.T) {
	dsn := fmt.Sprintf("file:repo_order_runtime_repo_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, AutoMigrate(db))

	runtime := &domain.OrderRuntime{
		OrderID:                 99,
		StatusReason:            "open",
		EstimatedGasUsed:        "0",
		GasPriceAtQuote:         "0",
		FeeQuoteAt:              time.Now().UTC(),
		LastRequiredExecutorFee: "0",
		LastFeeCheckAt:          time.Now().UTC(),
		LastExecutionCheckAt:    time.Now().UTC(),
		LastBlockReason:         "",
		SettledAmountOut:        "0",
		SettledExecutorFee:      "0",
		SubmittedTxHash:         "",
		ExecutedTxHash:          "",
		CancelledTxHash:         "",
		LastCheckedBlock:        0,
		CreatedAt:               time.Now().UTC(),
		UpdatedAt:               time.Now().UTC(),
	}

	repository := NewOrderRuntimeRepository(db)
	require.NoError(t, repository.Create(context.Background(), runtime))
	require.NoError(t, repository.UpdateByOrderID(context.Background(), runtime.OrderID, map[string]interface{}{
		"status_reason":     "submitted_to_chain",
		"submitted_tx_hash": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	}))

	stored, err := repository.GetByOrderID(context.Background(), runtime.OrderID)
	require.NoError(t, err)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.SubmittedTxHash)
}

func repeatRuntimeHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
