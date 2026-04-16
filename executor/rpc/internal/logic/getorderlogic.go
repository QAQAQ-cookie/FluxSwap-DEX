package logic

import (
	"context"
	"errors"
	"strings"

	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type GetOrderLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewGetOrderLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetOrderLogic {
	return &GetOrderLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *GetOrderLogic) GetOrder(in *executor.GetOrderRequest) (*executor.GetOrderResponse, error) {
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
	order, err := orderRepo.GetByOrderHash(
		l.ctx,
		in.GetChainId(),
		in.GetSettlementAddress(),
		in.GetOrderHash(),
	)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Error(codes.NotFound, "order not found")
		}
		l.Errorf("query order failed: %v", err)
		return nil, status.Error(codes.Internal, "query order failed")
	}

	response := orderToResponse(order)
	response.Notice = successNotice(
		"ORDER_LOADED",
		"订单查询成功",
		"请结合 status、statusReason 和交易哈希字段判断当前订单进度。",
		"query",
	)
	return response, nil
}
