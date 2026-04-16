package logic

import (
	"context"
	"errors"
	"strings"

	"fluxswap-executor/internal/app"
	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type ApplyOrderEventLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewApplyOrderEventLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ApplyOrderEventLogic {
	return &ApplyOrderEventLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *ApplyOrderEventLogic) ApplyOrderEvent(in *executor.ApplyOrderEventRequest) (*executor.ApplyOrderEventResponse, error) {
	if in.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if !isAddress(in.GetContractAddress()) {
		return nil, status.Error(codes.InvalidArgument, "contractAddress must be a valid address")
	}
	if strings.TrimSpace(in.GetEventName()) == "" {
		return nil, status.Error(codes.InvalidArgument, "eventName is required")
	}
	if !isHash(in.GetTxHash()) {
		return nil, status.Error(codes.InvalidArgument, "txHash must be a valid bytes32 hex string")
	}
	if in.GetBlockNumber() < 0 {
		return nil, status.Error(codes.InvalidArgument, "blockNumber must be greater than or equal to 0")
	}
	if !isHash(in.GetOrderHash()) {
		return nil, status.Error(codes.InvalidArgument, "orderHash must be a valid bytes32 hex string")
	}
	if l.svcCtx.DB == nil {
		return nil, status.Error(codes.FailedPrecondition, "database is not initialized")
	}

	orderRepo := repo.NewOrderRepository(l.svcCtx.DB)
	orderEventRepo := repo.NewOrderEventRepository(l.svcCtx.DB)
	orderEventService := app.NewOrderEventService(orderRepo, orderEventRepo)
	order, err := orderEventService.Apply(l.ctx, app.ApplyOrderEventParams{
		ChainID:         in.GetChainId(),
		ContractAddress: in.GetContractAddress(),
		EventName:       in.GetEventName(),
		TxHash:          in.GetTxHash(),
		LogIndex:        0,
		BlockNumber:     in.GetBlockNumber(),
		OrderHash:       in.GetOrderHash(),
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &executor.ApplyOrderEventResponse{
				Notice: failureNotice(
					"ORDER_NOT_FOUND",
					"事件对应的订单不存在",
					"请先确认订单是否已经写入数据库，再重试事件回写。",
					"event_apply",
				),
			}, status.Error(codes.NotFound, "order not found")
		}
		if errors.Is(err, app.ErrDuplicateOrderEvent) {
			return &executor.ApplyOrderEventResponse{
				Notice: successNotice(
					"EVENT_ALREADY_APPLIED",
					"事件已处理过，本次按幂等成功返回",
					"这是正常的重复回放场景，无需额外处理。",
					"event_apply",
				),
			}, nil
		}
		if errors.Is(err, gorm.ErrInvalidData) {
			return &executor.ApplyOrderEventResponse{
				Notice: failureNotice(
					"UNSUPPORTED_EVENT",
					"当前事件类型不受支持",
					"请确认 eventName 是否在系统支持的事件白名单内。",
					"event_validation",
				),
			}, status.Error(codes.InvalidArgument, "unsupported eventName")
		}
		l.Errorf("apply order event failed: %v", err)
		return &executor.ApplyOrderEventResponse{
			Notice: failureNotice(
				"APPLY_EVENT_FAILED",
				"事件回写失败",
				"请稍后重试，并检查数据库和事件去重状态。",
				"event_apply",
			),
		}, status.Error(codes.Internal, "apply order event failed")
	}

	return &executor.ApplyOrderEventResponse{
		Order: orderToResponse(order),
		Notice: successNotice(
			"EVENT_APPLIED",
			"链上事件已成功回写到订单状态",
			"请继续关注订单的 status、statusReason 和交易哈希字段。",
			"event_apply",
		),
	}, nil
}
