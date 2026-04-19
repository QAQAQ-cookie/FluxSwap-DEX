package repo

import (
	"context"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestIsDuplicateKeyErrorDetectsSQLiteUniqueViolation(t *testing.T) {
	dsn := "file:repo_duplicate_key_test?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, AutoMigrate(db))

	orderRepo := NewOrderRepository(db)
	order := &domain.Order{
		ChainID:                 31337,
		SettlementAddress:       "0x1111111111111111111111111111111111111111",
		OrderHash:               "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
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
		Signature:               "0x" + repeatRepoErrorHex("11", 65),
		Source:                  "test",
		Status:                  "open",
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

	require.NoError(t, orderRepo.Create(context.Background(), order))

	duplicate := *order
	err = orderRepo.Create(context.Background(), &duplicate)
	require.Error(t, err)
	require.True(t, IsDuplicateKeyError(err))
}

func repeatRepoErrorHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
