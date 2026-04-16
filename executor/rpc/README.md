# RPC Scaffold

当前目录用于承载基于 `go-zero` 的 gRPC 服务层。

目前已经具备的结构与能力：

- `proto/`：存放 gRPC 协议定义
- `etc/`：存放 RPC 配置文件
- `cmd/rpc/main.go`：gRPC 服务启动入口
- `internal/logic`：RPC 业务逻辑层
- `internal/server`：gRPC 服务注册层
- `internal/svc`：服务上下文与共享依赖
- 已接入 `gorm + PostgreSQL`
- 支持 `Database.AutoMigrate` 自动建表

当前可用 RPC：

- `Executor/Ping`
- `Executor/CreateOrder`
- `Executor/CancelOrders`
- `Executor/ApplyOrderEvent`
- `Executor/GetOrder`

接口说明：

- `CreateOrder`：校验订单基础字段，并写入 `orders` 表
- `CancelOrders`：统一撤单入口，传 1 条订单就是单撤，传多条订单就是批量撤单；请求需要额外携带 maker 对 nonce 批次签出的 `deadline` 和 `cancelSignature`，服务端会提交 `invalidateNoncesBySig` 到链上，并返回逐笔处理结果
- `ApplyOrderEvent`：接收链上事件回写，目前支持 `OrderExecuted`、`OrderCancelled`
- `GetOrder`：按 `chainId + settlementAddress + orderHash` 查询订单

多链说明：

- 当前 RPC 已支持单实例多链
- 服务会根据请求中的 `chainId + settlementAddress` 路由到对应链配置
- 配置推荐使用 `Chains:` 列表；旧的单链 `Chain:` 仍保留兼容

启动方式：

```bash
go run ./cmd/rpc -f ./rpc/etc/executor.yaml
```

说明：

- 服务默认监听 `0.0.0.0:9001`
- 前台持续运行属于正常行为，需要手动按 `Ctrl + C` 停止
- 当 `Database.AutoMigrate: true` 时，服务启动会自动初始化 `orders`、`order_events`、`sync_cursor`
- 服务同时注册标准 gRPC health service，方便健康检查与编排探测
