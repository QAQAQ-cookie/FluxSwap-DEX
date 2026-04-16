# FluxSwap Executor

当前目录用于重建 FluxSwap 的执行器后端。

当前已经具备的基础能力：

- 初始化 Go 模块 `fluxswap-executor`
- 引入 `go-zero` 作为后端基础框架
- 提供 go-zero gRPC 服务骨架与可运行入口
- 接入 `gorm + PostgreSQL`
- 支持统一数据库自动建表与独立迁移命令
- 新增真实接口 `Executor/CreateOrder`、`Executor/CancelOrders`、`Executor/ApplyOrderEvent`、`Executor/GetOrder`
- `Executor/CancelOrders` 已切换为链上撤单模式：通过 `invalidateNoncesBySig` 提交 nonce 失效交易，最终状态由 indexer 按 `NonceInvalidated` 事件回写
- 当前后端已支持单实例多链：同一个 rpc / executor / indexer 进程可同时加载多条链配置，按 `chainId + settlementAddress` 分流
- 实现订单仓储、事件仓储与同步游标仓储
- 实现链上事件回写服务 `internal/app/order_event_service.go`
- 实现索引器 `cmd/indexer`，支持回补区块 + WebSocket 实时订阅
- 实现执行器 `cmd/executor`，支持判定订单是否到价并真实提交 `executeOrder` 交易

当前目录结构职责：

- `rpc/`: gRPC 协议与接口实现
- `cmd/migrate`: 数据库迁移入口
- `internal/domain`: 订单、事件、游标等领域模型
- `internal/repo`: PostgreSQL 持久层
- `internal/app`: 共享业务服务
- `worker/indexer`: 链上事件订阅与状态回写
- `worker/executor`: 到价检测与执行交易提交
- `cmd/indexer`: 索引器进程入口
- `cmd/executor`: 执行器进程入口

当前已具备的链上自动回写基础：

- `cmd/indexer`: 独立的 indexer 启动入口
- `worker/indexer/subscriber.go`: WebSocket 订阅器
- `internal/app/order_event_service.go`: 链上事件回写服务

当前已具备的执行器基础：

- `cmd/executor`: 独立的执行器启动入口
- `worker/executor/worker.go`: 扫描订单，判定可执行性，并使用执行器私钥提交 `executeOrder`
- `worker/executor/worker.go`: 轮询 `pending_execute` 订单回执，确认交易成功或在失败时回退重试

数据库初始化方式：

```bash
go run ./cmd/migrate -f ./rpc/etc/executor.yaml
```

默认配置中 `Database.AutoMigrate: true`，因此在开发环境下直接启动 `rpc`、`executor`、`indexer` 时也会自动建表。

常用启动方式：

```bash
go run ./cmd/rpc -f ./rpc/etc/executor.yaml
go run ./cmd/executor -f ./rpc/etc/executor.yaml
go run ./cmd/indexer -f ./rpc/etc/executor.yaml
```

健康检查：

- RPC: gRPC health service，跟随主服务监听地址一起暴露
- Executor worker: `GET /healthz`，默认监听 `0.0.0.0:9101`
- Indexer worker: `GET /healthz`，默认监听 `0.0.0.0:9102`

Docker 运行方式：

```bash
docker compose up --build
```

容器编排文件：

- [docker-compose.yml](D:/work/CodeLab/FluxSwap-DEX/executor/docker-compose.yml)
- [Dockerfile](D:/work/CodeLab/FluxSwap-DEX/executor/Dockerfile)
- [executor.docker.yaml](D:/work/CodeLab/FluxSwap-DEX/executor/rpc/etc/executor.docker.yaml)

Docker 默认服务说明：

- `postgres`: PostgreSQL 17
- `migrate`: 启动时执行一次建表迁移
- `rpc`: gRPC 服务，默认映射 `9001`
- `executor`: 订单执行 worker，默认映射健康检查 `9101`
- `indexer`: 事件索引 worker，默认映射健康检查 `9102`

Docker 配置注意事项：

- `Chain.HTTPRPCURL` 供 `rpc` 和 `executor` 使用，指向可写交易与只读调用的 HTTP RPC
- `Chain.WSRPCURL` 供 `indexer` 使用，指向 WebSocket RPC 以便实时订阅事件
- 默认示例使用 `ws://host.docker.internal:8545`，适合容器访问宿主机上的本地区块链
- 启动前需要把 `executor.docker.yaml` 里的 `SettlementAddress` 和 `ExecutorPrivateKey` 改成实际值
- 如果你的链不在宿主机，而在别的容器或远端节点，请把 `Chain.HTTPRPCURL` 和 `Chain.WSRPCURL` 分别改成对应地址

开发环境排查建议：

- 若订单一直停在 `open`，先看 executor 日志中的 `canExecuteOrder` reason
- 若订单进入 `pending_execute` 但未最终落为 `executed`，先看 executor 回执日志，再看 indexer 是否收到 `OrderExecuted`
- 若 indexer 未消费到事件，优先检查 `Chain.WSRPCURL` 是否为 WebSocket 地址
