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

type ListOrderUpdatesLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewListOrderUpdatesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListOrderUpdatesLogic {
	return &ListOrderUpdatesLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *ListOrderUpdatesLogic) ListOrderUpdates(in *executor.ListOrderUpdatesRequest) (*executor.ListOrderUpdatesResponse, error) {
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

	result, err := repo.NewOrderRepository(l.svcCtx.DB).ListUpdatesByMaker(l.ctx, repo.ListOrderUpdatesByMakerParams{
		ChainID:           in.GetChainId(),
		SettlementAddress: in.GetSettlementAddress(),
		Maker:             in.GetMaker(),
		Statuses:          in.GetStatuses(),
		Limit:             limit,
		Cursor:            in.GetCursor(),
	})
	if err != nil {
		if errors.Is(err, repo.ErrInvalidOrderUpdatesCursor) {
			return nil, status.Error(codes.InvalidArgument, "cursor is invalid")
		}
		l.Errorf("list order updates failed: %v", err)
		return nil, status.Error(codes.Internal, "list order updates failed")
	}

	orders := make([]*executor.GetOrderResponse, 0, len(result.Orders))
	for i := range result.Orders {
		orders = append(orders, orderToResponse(&result.Orders[i]))
	}

	return &executor.ListOrderUpdatesResponse{
		Orders:     orders,
		NextCursor: result.NextCursor,
		HasMore:    result.HasMore,
		Notice: successNotice(
			"ORDER_UPDATES_LISTED",
			"order updates listed successfully",
			"the current page is sorted by updatedAt descending",
			"query",
		),
	}, nil
}
