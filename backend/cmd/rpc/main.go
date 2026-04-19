package main

import (
	"flag"
	"log"

	"fluxswap-backend/internal/config"
	fluxrpc "fluxswap-backend/rpc"

	"github.com/zeromicro/go-zero/core/conf"
)

var configFile = flag.String("f", "executor.yaml", "the config file")

// main 负责加载配置并启动 gRPC RPC 进程。
func main() {
	// 解析命令行参数，读取 -f 指定的配置文件路径。
	flag.Parse()

	// 准备接收完整后端配置。
	var c config.Config
	// 从配置文件加载 RPC、数据库、链和 worker 相关配置。
	if err := conf.Load(*configFile, &c); err != nil {
		// 配置加载失败时直接退出，避免进程带着空配置启动。
		log.Fatal(err)
	}

	// 启动真正的 gRPC 服务。
	if err := fluxrpc.Run(c); err != nil {
		// RPC 服务初始化或监听失败时直接退出。
		log.Fatal(err)
	}
}

