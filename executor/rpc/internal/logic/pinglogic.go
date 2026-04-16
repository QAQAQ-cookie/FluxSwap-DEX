package logic

import (
	"context"
	"strings"

	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/logx"
)

type PingLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

func NewPingLogic(ctx context.Context, svcCtx *svc.ServiceContext) *PingLogic {
	return &PingLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

func (l *PingLogic) Ping(in *executor.PingRequest) (*executor.PingResponse, error) {
	message := strings.TrimSpace(in.GetMessage())
	if message == "" {
		message = "pong"
	}

	return &executor.PingResponse{
		Message: message,
		Notice: successNotice(
			"PING_OK",
			"服务连通正常",
			"可以继续发起下单、查单和撤单请求。",
			"health_check",
		),
	}, nil
}
