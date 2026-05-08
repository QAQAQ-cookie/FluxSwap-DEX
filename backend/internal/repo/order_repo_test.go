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

// open 订单扫描应优先返回最久没有做执行检查的订单，避免前排长期阻塞订单饿死后续新单。
func TestListOpenOrdersForSettlementPrefersOldestExecutionCheck(t *testing.T) {
	db := openOrderRepoTestDB(t)
	orderRepo := NewOrderRepository(db)
	now := time.Now().UTC()

	orders := []*domain.Order{
		buildOrderRepoTestOrder("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", now.Add(-2*time.Minute), now.Add(-2*time.Minute)),
		buildOrderRepoTestOrder("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", now.Add(-10*time.Minute), now.Add(-time.Minute)),
		buildOrderRepoTestOrder("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", now.Add(-5*time.Minute), now.Add(-30*time.Second)),
	}

	for _, order := range orders {
		require.NoError(t, orderRepo.Create(context.Background(), order))
	}

	result, err := orderRepo.ListOpenOrdersForSettlement(
		context.Background(),
		31337,
		"0x1111111111111111111111111111111111111111",
		2,
	)
	require.NoError(t, err)
	require.Len(t, result, 2)
	require.Equal(t, orders[1].OrderHash, result[0].OrderHash)
	require.Equal(t, orders[2].OrderHash, result[1].OrderHash)
}

func TestUpdateFieldsPersistsRuntimeAtomically(t *testing.T) {
	db := openOrderRepoTestDB(t)
	orderRepo := NewOrderRepository(db)
	order := buildOrderRepoTestOrder("0xdededededededededededededededededededededededededededededededede", time.Now().UTC(), time.Now().UTC())
	require.NoError(t, orderRepo.Create(context.Background(), order))

	err := orderRepo.UpdateFields(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		map[string]interface{}{
			"status":            "pending_execute",
			"status_reason":     "submitted_to_chain",
			"submitted_tx_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"updated_at":        time.Now().UTC(),
		},
	)
	require.NoError(t, err)

	stored, err := orderRepo.GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.SubmittedTxHash)
}

func TestClaimOpenOrderForExecutionPersistsRuntimeAtomically(t *testing.T) {
	db := openOrderRepoTestDB(t)
	orderRepo := NewOrderRepository(db)
	now := time.Now().UTC()
	order := buildOrderRepoTestOrder("0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef", now, now)
	require.NoError(t, orderRepo.Create(context.Background(), order))

	claimed, err := orderRepo.ClaimOpenOrderForExecution(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash, now)
	require.NoError(t, err)
	require.True(t, claimed)

	stored, err := orderRepo.GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "submitting_execute", stored.Status)
	require.Equal(t, "claimed_for_submission", stored.StatusReason)
	require.Equal(t, "", stored.SubmittedTxHash)
	require.WithinDuration(t, now, stored.LastExecutionCheckAt, time.Second)
}

func openOrderRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:order_repo_test_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, AutoMigrate(db))
	return db
}

func buildOrderRepoTestOrder(orderHash string, lastExecutionCheckAt time.Time, updatedAt time.Time) *domain.Order {
	return &domain.Order{
		ChainID:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            orderHash,
		Maker:                "0x2222222222222222222222222222222222222222",
		InputToken:           "0x3333333333333333333333333333333333333333",
		OutputToken:          "0x4444444444444444444444444444444444444444",
		AmountIn:             "100",
		MinAmountOut:         "90",
		ExecutorFee:          "1",
		ExecutorFeeToken:     "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:      "1",
		Expiry:               "9999999999",
		Nonce:                "1",
		Recipient:            "0x5555555555555555555555555555555555555555",
		Signature:            "0x" + repeatOrderRepoHex("11", 65),
		Source:               "test",
		Status:               "open",
		StatusReason:         "",
		EstimatedGasUsed:     "0",
		GasPriceAtQuote:      "0",
		FeeQuoteAt:           updatedAt,
		LastRequiredExecutorFee: "0",
		LastFeeCheckAt:       updatedAt,
		LastExecutionCheckAt: lastExecutionCheckAt,
		LastBlockReason:      "",
		SettledAmountOut:     "0",
		SettledExecutorFee:   "0",
		SubmittedTxHash:      "",
		ExecutedTxHash:       "",
		CancelledTxHash:      "",
		LastCheckedBlock:     0,
		CreatedAt:            updatedAt.Add(-time.Minute),
		UpdatedAt:            updatedAt,
	}
}

func repeatOrderRepoHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}

