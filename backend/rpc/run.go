package rpc

import (
	"fmt"

	"fluxswap-backend/internal/config"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/server"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/zeromicro/go-zero/core/service"
	"github.com/zeromicro/go-zero/zrpc"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

// Run 启动 go-zero gRPC 服务，并注册执行器 RPC 接口。
func Run(c config.Config) error {
	// 先初始化 RPC 运行依赖，包括数据库连接和各条链的结算客户端。
	ctx, err := svc.NewServiceContext(c)
	if err != nil {
		// 依赖初始化失败时直接返回，让上层决定退出进程。
		return err
	}
	// RPC 进程退出时统一释放数据库和链客户端资源。
	defer ctx.Close()

	// 创建 go-zero 的 gRPC 服务实例，并在回调里完成服务注册。
	s, err := zrpc.NewServer(c.RpcServerConf, func(grpcServer *grpc.Server) {
		// 注册业务 RPC 服务，把 proto 方法映射到本地服务端实现。
		executor.RegisterExecutorServer(grpcServer, server.NewExecutorServer(ctx))

		// 在开发和测试模式下开启 reflection，便于使用 grpcurl / Postman 等工具调试。
		if c.Mode == service.DevMode || c.Mode == service.TestMode {
			reflection.Register(grpcServer)
		}
	})
	if err != nil {
		// gRPC Server 创建失败时直接返回，让上层终止启动流程。
		return err
	}
	// 退出 Run 时停止 gRPC 服务，释放监听端口和内部资源。
	defer s.Stop()

	// 打印当前监听地址，方便本地调试和日志排查。
	fmt.Printf("Starting rpc server at %s...\n", c.ListenOn)
	// 阻塞启动 gRPC 服务；正常情况下会一直运行直到进程退出。
	s.Start()
	// Start 返回后视为正常结束，这里返回 nil。
	return nil
}

