package logic

import (
	"context"
	"fmt"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestListOrdersReturnsPagedOrdersSortedByCreatedAtDesc(t *testing.T) {
	db := openListOrdersTestDB(t)
	orderRepo := repo.NewOrderRepository(db)
	base := time.Now().UTC().Add(-time.Hour)

	orders := []*domain.Order{
		buildListOrdersTestOrder("0x1111111111111111111111111111111111111111111111111111111111111111", "open", base.Add(1*time.Minute)),
		buildListOrdersTestOrder("0x2222222222222222222222222222222222222222222222222222222222222222", "executed", base.Add(2*time.Minute)),
		buildListOrdersTestOrder("0x3333333333333333333333333333333333333333333333333333333333333333", "pending_cancel", base.Add(3*time.Minute)),
	}
	for _, order := range orders {
		require.NoError(t, orderRepo.Create(context.Background(), order))
	}

	logic := NewListOrdersLogic(context.Background(), &svc.ServiceContext{DB: db})
	resp, err := logic.ListOrders(&executor.ListOrdersRequest{
		ChainId: 31337,
		Maker:   orders[0].Maker,
		Limit:   2,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.True(t, resp.HasMore)
	require.NotEmpty(t, resp.NextCursor)
	require.Len(t, resp.Orders, 2)
	require.Equal(t, orders[2].OrderHash, resp.Orders[0].OrderHash)
	require.Equal(t, orders[1].OrderHash, resp.Orders[1].OrderHash)

	nextResp, err := logic.ListOrders(&executor.ListOrdersRequest{
		ChainId: 31337,
		Maker:   orders[0].Maker,
		Limit:   2,
		Cursor:  resp.NextCursor,
	})
	require.NoError(t, err)
	require.NotNil(t, nextResp)
	require.False(t, nextResp.HasMore)
	require.Empty(t, nextResp.NextCursor)
	require.Len(t, nextResp.Orders, 1)
	require.Equal(t, orders[0].OrderHash, nextResp.Orders[0].OrderHash)
}

func TestListOrdersSupportsStatusFiltering(t *testing.T) {
	db := openListOrdersTestDB(t)
	orderRepo := repo.NewOrderRepository(db)
	base := time.Now().UTC().Add(-time.Hour)

	openOrder := buildListOrdersTestOrder("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "open", base.Add(1*time.Minute))
	cancelledOrder := buildListOrdersTestOrder("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cancelled", base.Add(2*time.Minute))
	require.NoError(t, orderRepo.Create(context.Background(), openOrder))
	require.NoError(t, orderRepo.Create(context.Background(), cancelledOrder))

	logic := NewListOrdersLogic(context.Background(), &svc.ServiceContext{DB: db})
	resp, err := logic.ListOrders(&executor.ListOrdersRequest{
		ChainId:  31337,
		Maker:    openOrder.Maker,
		Statuses: []string{"OpEn"},
		Limit:    10,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.False(t, resp.HasMore)
	require.Len(t, resp.Orders, 1)
	require.Equal(t, openOrder.OrderHash, resp.Orders[0].OrderHash)
}

func TestListOrdersRejectsInvalidCursor(t *testing.T) {
	db := openListOrdersTestDB(t)
	logic := NewListOrdersLogic(context.Background(), &svc.ServiceContext{DB: db})

	_, err := logic.ListOrders(&executor.ListOrdersRequest{
		ChainId: 31337,
		Maker:   "0x2222222222222222222222222222222222222222",
		Cursor:  "not-a-valid-cursor",
	})
	require.Error(t, err)

	grpcStatus, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, grpcStatus.Code())
}

func openListOrdersTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:list_orders_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

func buildListOrdersTestOrder(orderHash string, status string, createdAt time.Time) *domain.Order {
	return &domain.Order{
		ChainID:                 31337,
		SettlementAddress:       "0x1111111111111111111111111111111111111111",
		OrderHash:               orderHash,
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
		Signature:               "0x" + repeatListOrdersHex("11", 65),
		Source:                  "test",
		Status:                  status,
		StatusReason:            "",
		EstimatedGasUsed:        "0",
		GasPriceAtQuote:         "0",
		FeeQuoteAt:              createdAt,
		LastRequiredExecutorFee: "0",
		LastFeeCheckAt:          createdAt,
		LastExecutionCheckAt:    createdAt,
		LastBlockReason:         "",
		SettledAmountOut:        "0",
		SettledExecutorFee:      "0",
		SubmittedTxHash:         "",
		ExecutedTxHash:          "",
		CancelledTxHash:         "",
		LastCheckedBlock:        0,
		CreatedAt:               createdAt,
		UpdatedAt:               createdAt,
	}
}

func repeatListOrdersHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
