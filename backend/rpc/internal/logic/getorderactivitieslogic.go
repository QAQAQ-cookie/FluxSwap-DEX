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
	"gorm.io/gorm"
)

const (
	defaultOrderActivitiesLimit = 50
	maxOrderActivitiesLimit     = 200
)

type GetOrderActivitiesLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewGetOrderActivitiesLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetOrderActivitiesLogic {
	return &GetOrderActivitiesLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *GetOrderActivitiesLogic) GetOrderActivities(in *executor.GetOrderActivitiesRequest) (*executor.GetOrderActivitiesResponse, error) {
	if in.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if strings.TrimSpace(in.GetSettlementAddress()) == "" {
		return nil, status.Error(codes.InvalidArgument, "settlementAddress is required")
	}
	if strings.TrimSpace(in.GetOrderHash()) == "" {
		return nil, status.Error(codes.InvalidArgument, "orderHash is required")
	}
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}

	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	_, err := orderRepo.GetByOrderHash(
		l.ctx,
		in.GetChainId(),
		in.GetSettlementAddress(),
		in.GetOrderHash(),
	)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Error(codes.NotFound, "order not found")
		}
		l.Errorf("query order for activity list failed: %v", err)
		return nil, status.Error(codes.Internal, "query order failed")
	}

	limit := normalizeOrderActivitiesLimit(in.GetLimit())
	activityRepo := repo.NewOrderActivityRepository(l.svcCtx.DB)
	activities, err := activityRepo.ListByOrderHash(
		l.ctx,
		in.GetChainId(),
		in.GetSettlementAddress(),
		in.GetOrderHash(),
		limit,
	)
	if err != nil {
		l.Errorf("query order activities failed: %v", err)
		return nil, status.Error(codes.Internal, "query order activities failed")
	}

	items := make([]*executor.OrderActivityView, 0, len(activities))
	for i := range activities {
		items = append(items, orderActivityToView(&activities[i]))
	}

	return &executor.GetOrderActivitiesResponse{
		Activities: items,
		Notice: successNotice(
			"ORDER_ACTIVITIES_LOADED",
			"order activities loaded successfully",
			"activities are sorted from newest to oldest",
			"query",
		),
	}, nil
}

func normalizeOrderActivitiesLimit(limit uint32) int {
	if limit == 0 {
		return defaultOrderActivitiesLimit
	}
	if limit > maxOrderActivitiesLimit {
		return maxOrderActivitiesLimit
	}
	return int(limit)
}
