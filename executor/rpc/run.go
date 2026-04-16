package rpc

import (
	"fmt"

	"fluxswap-executor/internal/config"
	"fluxswap-executor/rpc/executor"
	"fluxswap-executor/rpc/internal/server"
	"fluxswap-executor/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/service"
	"github.com/zeromicro/go-zero/zrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthgrpc "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

// Run 启动 go-zero gRPC 服务，并注册执行器 RPC 接口。
func Run(c config.Config) error {
	ctx := svc.NewServiceContext(c)
	defer ctx.Close()

	s := zrpc.MustNewServer(c.RpcServerConf, func(grpcServer *grpc.Server) {
		executor.RegisterExecutorServer(grpcServer, server.NewExecutorServer(ctx))

		healthServer := health.NewServer()
		healthServer.SetServingStatus("", healthgrpc.HealthCheckResponse_SERVING)
		healthgrpc.RegisterHealthServer(grpcServer, healthServer)

		if c.Mode == service.DevMode || c.Mode == service.TestMode {
			reflection.Register(grpcServer)
		}
	})
	defer s.Stop()

	fmt.Printf("Starting rpc server at %s...\n", c.ListenOn)
	s.Start()
	return nil
}
