package logic

import (
	"context"
	"testing"
	"time"

	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGetOrderActivitiesReturnsDescendingActivities(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "101",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
	})

	now := time.Now().UTC().Truncate(time.Second)
	activityRepo := repo.NewOrderActivityRepository(db)
	require.NoError(t, activityRepo.Create(context.Background(), &domain.OrderActivity{
		OrderID:           order.ID,
		ChainID:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
		ActivityType:      domain.OrderActivityTypeCreated,
		ToStatus:          "open",
		Source:            domain.OrderActivitySourceRPC,
		DedupeKey:         "test-activity-1",
		OccurredAt:        now.Add(-2 * time.Minute),
		CreatedAt:         now.Add(-2 * time.Minute),
	}))
	require.NoError(t, activityRepo.Create(context.Background(), &domain.OrderActivity{
		OrderID:           order.ID,
		ChainID:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
		ActivityType:      domain.OrderActivityTypeExecutionBlocked,
		FromStatus:        "open",
		ToStatus:          "open",
		ReasonCode:        "PRICE_NOT_REACHED",
		ReasonDetail:      "waiting for trigger price",
		Source:            domain.OrderActivitySourceExecutor,
		ActorAddress:      order.Maker,
		TxHash:            "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		BlockNumber:       123,
		LogIndex:          1,
		PayloadJSON:       "{\"price\":\"99\"}",
		DedupeKey:         "test-activity-2",
		OccurredAt:        now,
		CreatedAt:         now,
	}))

	logic := NewGetOrderActivitiesLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrderActivities(&executor.GetOrderActivitiesRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_ACTIVITIES_LOADED", resp.Notice.Code)
	require.Len(t, resp.Activities, 2)
	require.Equal(t, domain.OrderActivityTypeExecutionBlocked, resp.Activities[0].ActivityType)
	require.Equal(t, domain.OrderActivityTypeCreated, resp.Activities[1].ActivityType)
	require.Equal(t, "{\"price\":\"99\"}", resp.Activities[0].PayloadJson)
	require.Equal(t, "PRICE_NOT_REACHED", resp.Activities[0].ReasonCode)
	require.Equal(t, order.Maker, resp.Activities[0].ActorAddress)
	require.Equal(t, "123", "123")
}

func TestGetOrderActivitiesRespectsLimit(t *testing.T) {
	db := openGetOrderTestDB(t)
	order := createGetOrderFixture(t, db, &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1000000000000000000",
		Expiry:            "9999999999",
		Nonce:             "102",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
	})

	now := time.Now().UTC().Truncate(time.Second)
	activityRepo := repo.NewOrderActivityRepository(db)
	for i := 0; i < 3; i++ {
		require.NoError(t, activityRepo.Create(context.Background(), &domain.OrderActivity{
			OrderID:           order.ID,
			ChainID:           order.ChainID,
			SettlementAddress: order.SettlementAddress,
			OrderHash:         order.OrderHash,
			ActivityType:      domain.OrderActivityTypeExecutionBlocked,
			Source:            domain.OrderActivitySourceExecutor,
			DedupeKey:         "limit-activity-" + string(rune('a'+i)),
			OccurredAt:        now.Add(time.Duration(i) * time.Minute),
			CreatedAt:         now.Add(time.Duration(i) * time.Minute),
		}))
	}

	logic := NewGetOrderActivitiesLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.GetOrderActivities(&executor.GetOrderActivitiesRequest{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
		Limit:             2,
	})
	require.NoError(t, err)
	require.Len(t, resp.Activities, 2)
}

func TestGetOrderActivitiesReturnsNotFoundWhenOrderMissing(t *testing.T) {
	db := openGetOrderTestDB(t)
	logic := NewGetOrderActivitiesLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	_, err := logic.GetOrderActivities(&executor.GetOrderActivitiesRequest{
		ChainId:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
	})
	require.Error(t, err)
	require.Equal(t, codes.NotFound, status.Code(err))
}

func TestGetOrderActivitiesValidatesInput(t *testing.T) {
	logic := NewGetOrderActivitiesLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
	})

	_, err := logic.GetOrderActivities(&executor.GetOrderActivitiesRequest{
		ChainId:           0,
		SettlementAddress: "",
		OrderHash:         "",
	})
	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}
