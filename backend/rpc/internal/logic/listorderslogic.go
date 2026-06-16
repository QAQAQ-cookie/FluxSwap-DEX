package logic

import (
	"context"
	"errors"
	"strings"

	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type ListOrdersLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewListOrdersLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListOrdersLogic {
	return &ListOrdersLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *ListOrdersLogic) ListOrders(in *executor.ListOrdersRequest) (*executor.ListOrdersResponse, error) {
	if in.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if !isAddress(in.GetMaker()) {
		return nil, status.Error(codes.InvalidArgument, "maker must be a valid address")
	}
	if settlementAddress := strings.TrimSpace(in.GetSettlementAddress()); settlementAddress != "" && !isAddress(settlementAddress) {
		return nil, status.Error(codes.InvalidArgument, "settlementAddress must be a valid address")
	}
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}

	limit := int(in.GetLimit())
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	result, err := repo.NewOrderRepository(l.svcCtx.DB).ListByMaker(l.ctx, repo.ListOrdersByMakerParams{
		ChainID:           in.GetChainId(),
		SettlementAddress: in.GetSettlementAddress(),
		Maker:             in.GetMaker(),
		Statuses:          in.GetStatuses(),
		Limit:             limit,
		Cursor:            in.GetCursor(),
	})
	if err != nil {
		if errors.Is(err, repo.ErrInvalidOrderListCursor) {
			return nil, status.Error(codes.InvalidArgument, "cursor is invalid")
		}
		l.Errorf("list orders failed: %v", err)
		return nil, status.Error(codes.Internal, "list orders failed")
	}

	orders := make([]*executor.GetOrderResponse, 0, len(result.Orders))
	for i := range result.Orders {
		orders = append(orders, orderToResponse(&result.Orders[i]))
	}

	return &executor.ListOrdersResponse{
		Orders:        orders,
		NextCursor:    result.NextCursor,
		HasMore:       result.HasMore,
		UpdatesCursor: "",
		Notice: successNotice(
			"ORDERS_LISTED",
			"orders listed successfully",
			"the current page is sorted by createdAt descending",
			"query",
		),
	}, nil
}
