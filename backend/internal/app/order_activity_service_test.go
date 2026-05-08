package app

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRecordOrderActivityNormalizesLongDedupeKey(t *testing.T) {
	db := openOrderActivityTestDB(t)

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
		Signature:         "0x" + strings.Repeat("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	longKey := fmt.Sprintf(
		"reorg:restore:cancelled_to_submitting_execute:%d:%s:%s:%s",
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		"0x"+strings.Repeat("f", 64),
	)
	require.Greater(t, len(longKey), maxOrderActivityDedupeKeyLength)

	params := RecordOrderActivityParams{
		Order:        order,
		ActivityType: domain.OrderActivityTypeReorgRestored,
		FromStatus:   "cancelled",
		ToStatus:     "submitting_execute",
		ReasonCode:   "restored_after_reorg",
		Source:       domain.OrderActivitySourceSystem,
		DedupeKey:    longKey,
		OccurredAt:   time.Now().UTC(),
	}

	require.NoError(t, RecordOrderActivity(context.Background(), db, params))
	require.NoError(t, RecordOrderActivity(context.Background(), db, params))

	activities, err := repo.NewOrderActivityRepository(db).ListByOrderHash(
		context.Background(),
		order.ChainID,
		order.SettlementAddress,
		order.OrderHash,
		10,
	)
	require.NoError(t, err)
	require.Len(t, activities, 1)
	require.Equal(t, normalizeActivityDedupeKey(longKey), activities[0].DedupeKey)
	require.LessOrEqual(t, len(activities[0].DedupeKey), maxOrderActivityDedupeKeyLength)
}

func openOrderActivityTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:order_activity_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}
