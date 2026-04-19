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

type GetOrderLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

// NewGetOrderLogic 创建查单逻辑处理器。
func NewGetOrderLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetOrderLogic {
	return &GetOrderLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// GetOrder 按业务唯一键读取订单，并补充适合前端展示的 notice。
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
	response.Notice = buildOrderStatusNotice(order)
	return response, nil
}

