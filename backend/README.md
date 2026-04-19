# FluxSwap Backend

这个目录承载 FluxSwap 限价单后端，负责订单接入、链上执行、事件回写、数据库持久化与运行健康检查。

当前后端采用 Go 实现，核心组合为：

- `go-zero`
  - 提供 gRPC 服务与基础运行框架
- `Gorm + PostgreSQL`
  - 持久化订单、订单事件与同步游标
- `abigen` 生成的 Go binding
  - 对接 `FluxSignedOrderSettlement` 与 `FluxSwapRouter`

## 当前目录结构

- `cmd/`
  - 进程入口层，存放各独立进程的启动入口
- `internal/`
  - 内部共享层，存放后端共用的领域、配置、仓储与链交互能力
- `rpc/`
  - RPC 接口层，承载 gRPC 协议、服务注册、接口逻辑与客户端封装
- `worker/`
  - 后台任务层，承载执行器与索引器任务
- `executor.yaml`
  - 本地开发配置
- `executor.docker.yaml`
  - Docker 运行配置
- `docker-compose.yml`
  - PostgreSQL、migrate、rpc、executor、indexer 一体化编排
- `Dockerfile`
  - 后端镜像构建文件

## 进程入口

- `cmd/rpc`
  - 启动 gRPC 服务，对外提供下单、撤单、查单接口
- `cmd/executor`
  - 启动执行器 worker，扫描可执行订单并尝试链上结算
- `cmd/indexer`
  - 启动索引器 worker，监听结算合约事件并回写数据库状态
- `cmd/migrate`
  - 执行数据库建表与迁移，然后退出

## 核心模块职责

当前后端主目录建议按以下正式职责理解：

- `cmd`
  - 进程入口层
- `internal`
  - 内部共享层
- `rpc`
  - RPC 接口层
- `worker`
  - 后台任务层

### `internal/app`

- 提供跨模块共享的应用服务
- 当前主要包括：
  - 健康检查服务
  - 链上事件应用服务

### `internal/chain`

- 放置执行器真正使用的链上交互代码
- 当前包括：
  - `flux_signed_order_settlement.go`
  - `flux_swap_router.go`
  - `order_signature.go`
  - `settlement_client.go`
- 主要能力包括：
  - 本地验签
  - 查询订单是否可执行
  - 估算执行费
  - 发起订单执行交易
  - 校验用户已提交的批量 nonce 作废交易
  - 查询交易回执

### `internal/config`

- 定义统一配置结构
- 供 `cmd/*`、`rpc`、`worker` 共同使用

### `internal/domain`

- 定义领域模型
- 当前包括：
  - 订单
  - 订单事件
  - 同步游标

### `internal/repo`

- 数据访问层
- 当前负责：
  - 数据库连接初始化
  - 自动迁移
  - 订单读写
  - 订单事件读写
  - 同步游标读写

### `rpc`

- `proto/`
  - gRPC 协议定义
- `executor/`
  - 生成后的 pb 文件
- `executorclient/`
  - gRPC 客户端封装
- `internal/logic/`
  - 接口业务逻辑
- `internal/server/`
  - 服务注册
- `internal/svc/`
  - 服务上下文与依赖装配

### `worker`

- `worker/executor/`
  - 执行器 worker
- `worker/indexer/`
  - 索引器 worker

## 当前接口

后端当前已提供以下 gRPC 接口：

- `Executor/CreateOrder`
  - 创建链下签名订单并落库
- `Executor/CancelOrders`
  - 批量登记用户钱包已提交的链上撤单交易
- `Executor/GetOrder`
  - 查询单笔订单详情

## 当前业务链路

### 下单链路

1. 前端调用 `CreateOrder`
2. 后端校验基础字段、`orderHash` 与 EIP-712 签名
3. 后端读取目标链最新区块时间，拒绝已过期订单
4. 后端记录订单与执行费快照
5. 订单进入后续执行扫描流程

### 执行链路

1. executor worker 扫描目标链下的 `open` 订单
2. 调用链上 `canExecuteOrder`
3. 在满足条件时重新估算执行费
4. 校验 maker 余额与授权
5. 满足执行条件后发起 `executeOrder`
6. 写入 `pending_execute`
7. 等待 indexer 或回执自愈流程收口为 `executed`

### 撤单链路

1. 前端钱包先发起链上 `invalidateNoncesBySig` 撤单交易
2. 前端拿到 `cancelTxHash` 后调用 `CancelOrders`
3. 后端校验批量中的 `maker`、`settlementAddress`、`nonce`，并确认 `cancelTxHash` 确实覆盖目标 nonce
4. 校验通过后订单进入 `pending_cancel`
5. indexer 监听 `NonceInvalidated` 后回写为 `cancelled`

### 事件回写链路

1. indexer 监听结算合约事件
2. 消费 `OrderExecuted`
3. 消费 `NonceInvalidated`
4. 通过事务写入事件表与订单状态
5. 推进同步游标，避免重复消费

## 当前实现特点

- 支持单实例多链运行
  - 按 `chainId + settlementAddress` 隔离订单与链客户端
- 支持执行费快照与执行前重估
  - 便于订单页展示预估执行费，也便于执行前风险控制
- 支持 pending 状态自愈
  - receipt 成功但 indexer 暂未回写时，executor 会按链上最终状态主动收口
- 支持协议阻塞冷却
  - `PAUSED`、`EXECUTOR_NOT_SET` 等协议侧阻塞不会在每轮扫描里反复打链
- 支持执行前资金预检
  - 提前识别余额不足与授权不足，减少无意义 revert
- 支持过期订单自动收口
  - 已过期订单不会继续参与执行扫描

## 启动方式

建议启动顺序如下：

### 1. 执行数据库迁移

```bash
go run ./cmd/migrate -f ./executor.yaml
```

### 2. 启动 RPC 服务

```bash
go run ./cmd/rpc -f ./executor.yaml
```

### 3. 启动执行器

```bash
go run ./cmd/executor -f ./executor.yaml
```

### 4. 启动索引器

```bash
go run ./cmd/indexer -f ./executor.yaml
```

开发配置中 `Database.AutoMigrate: true`，因此开发环境下直接启动 `rpc`、`executor`、`indexer` 也会自动建表；但更推荐先显式执行一次 `migrate`。

## 配置说明

当前统一使用 backend 根目录下的配置文件：

- `executor.yaml`
- `executor.docker.yaml`

链配置中重点字段包括：

- `HTTPRPCURL`
  - 供 `rpc` 与 `executor` 使用
- `WSRPCURL`
  - 供 `indexer` 使用
- `SettlementAddress`
  - 当前链对应的结算合约地址
- `ExecutorPrivateKey`
  - 执行器代发链上执行交易时使用的私钥

worker 关键参数包括：

```yaml
Worker:
  ExecutorScanIntervalMs: 5000
  ExecutorBatchSize: 20
  ExecutorTxDeadlineSec: 120
  ExecutorEstimatedGasUsed: 400000
  ExecutorFeeSafetyBps: 20000
  ProtocolBlockedRetryMs: 30000
  ReceiptPollIntervalMs: 5000
```

## 健康检查

- RPC
  - 使用 gRPC health service
- Executor worker
  - `GET /healthz`
  - 默认监听 `0.0.0.0:9101`
- Indexer worker
  - `GET /healthz`
  - 默认监听 `0.0.0.0:9102`

## Docker 运行

直接在 backend 目录下执行：

```bash
docker compose up --build
```

默认包含以下服务：

- `postgres`
- `migrate`
- `rpc`
- `executor`
- `indexer`

Docker 配置的默认示例使用 `host.docker.internal` 访问宿主机本地链。

## 测试与校验

当前测试文件直接放在对应源码包下，便于使用标准 Go 命令执行：

```bash
go test ./...
go vet ./...
```

当前已补上的重点测试覆盖包括：

- `internal/app/order_event_service_test.go`
- `internal/repo/cursor_repo_test.go`
- `internal/repo/order_repo_test.go`
- `rpc/internal/logic/createorderlogic_test.go`
- `rpc/internal/logic/cancelorderslogic_test.go`
- `rpc/internal/logic/getorderlogic_test.go`
- `rpc/internal/svc/servicecontext_test.go`
- `worker/executor/worker_test.go`
- `worker/indexer/subscriber_test.go`
- `worker/indexer/worker_test.go`

## 排查建议

- 订单长期停在 `open`
  - 先看 executor 日志里的 `canExecuteOrder` reason 与 `statusReason`
- 订单卡在 `pending_execute`
  - 先看执行交易回执，再看 indexer 是否收到 `OrderExecuted`
- 订单卡在 `pending_cancel`
  - 先看链上撤单交易回执，再看 indexer 是否收到 `NonceInvalidated`
- indexer 没有消费到事件
  - 优先检查 `WSRPCURL` 是否为可用的 WebSocket RPC
