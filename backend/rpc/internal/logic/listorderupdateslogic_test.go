package logic

import (
	"context"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestListOrderUpdatesReturnsPagedOrdersSortedByUpdatedAtDesc(t *testing.T) {
	db := openListOrdersTestDB(t)
	orderRepo := repo.NewOrderRepository(db)
	base := time.Now().UTC().Add(-time.Hour)

	orders := []*domain.Order{
		buildListOrdersTestOrder("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "open", base.Add(1*time.Minute)),
		buildListOrdersTestOrder("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "executed", base.Add(2*time.Minute)),
		buildListOrdersTestOrder("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "pending_cancel", base.Add(3*time.Minute)),
	}
	for _, order := range orders {
		require.NoError(t, orderRepo.Create(context.Background(), order))
	}

	require.NoError(t, orderRepo.UpdateFields(context.Background(), orders[0].ChainID, orders[0].SettlementAddress, orders[0].OrderHash, map[string]interface{}{"updated_at": base.Add(6 * time.Minute)}))
	require.NoError(t, orderRepo.UpdateFields(context.Background(), orders[1].ChainID, orders[1].SettlementAddress, orders[1].OrderHash, map[string]interface{}{"updated_at": base.Add(5 * time.Minute)}))
	require.NoError(t, orderRepo.UpdateFields(context.Background(), orders[2].ChainID, orders[2].SettlementAddress, orders[2].OrderHash, map[string]interface{}{"updated_at": base.Add(4 * time.Minute)}))

	logic := NewListOrderUpdatesLogic(context.Background(), &svc.ServiceContext{DB: db})
	resp, err := logic.ListOrderUpdates(&executor.ListOrderUpdatesRequest{
		ChainId: 31337,
		Maker:   orders[0].Maker,
		Limit:   2,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.True(t, resp.HasMore)
	require.NotEmpty(t, resp.NextCursor)
	require.Len(t, resp.Orders, 2)
	require.Equal(t, orders[0].OrderHash, resp.Orders[0].OrderHash)
	require.Equal(t, orders[1].OrderHash, resp.Orders[1].OrderHash)

	nextResp, err := logic.ListOrderUpdates(&executor.ListOrderUpdatesRequest{
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
	require.Equal(t, orders[2].OrderHash, nextResp.Orders[0].OrderHash)
}

func TestListOrderUpdatesSupportsStatusFiltering(t *testing.T) {
	db := openListOrdersTestDB(t)
	orderRepo := repo.NewOrderRepository(db)
	base := time.Now().UTC().Add(-time.Hour)

	openOrder := buildListOrdersTestOrder("0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "open", base.Add(1*time.Minute))
	cancelledOrder := buildListOrdersTestOrder("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "cancelled", base.Add(2*time.Minute))
	require.NoError(t, orderRepo.Create(context.Background(), openOrder))
	require.NoError(t, orderRepo.Create(context.Background(), cancelledOrder))

	logic := NewListOrderUpdatesLogic(context.Background(), &svc.ServiceContext{DB: db})
	resp, err := logic.ListOrderUpdates(&executor.ListOrderUpdatesRequest{
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

func TestListOrderUpdatesRejectsInvalidCursor(t *testing.T) {
	db := openListOrdersTestDB(t)
	logic := NewListOrderUpdatesLogic(context.Background(), &svc.ServiceContext{DB: db})

	_, err := logic.ListOrderUpdates(&executor.ListOrderUpdatesRequest{
		ChainId: 31337,
		Maker:   "0x2222222222222222222222222222222222222222",
		Cursor:  "not-a-valid-cursor",
	})
	require.Error(t, err)

	grpcStatus, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.InvalidArgument, grpcStatus.Code())
}
