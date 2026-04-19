# RPC Modules

这个目录对应后端的“RPC 接口层”。

它负责对外暴露 gRPC 接口，把前端或其他调用方的请求转入内部共享层完成验签、落库、查单与链上交互。

## 目录结构

- `proto/`
  - gRPC 协议定义
- `executor/`
  - 根据 proto 生成的 pb 文件
- `executorclient/`
  - gRPC 客户端封装
- `internal/logic/`
  - 接口业务逻辑
- `internal/server/`
  - gRPC 服务注册
- `internal/svc/`
  - 服务上下文与依赖装配
- `run.go`
  - RPC 服务启动入口封装

## 层级定位

- 正式职责名
  - RPC 接口层
- 主要职责
  - 对外提供稳定的 gRPC 接口
  - 承接请求参数校验与接口级业务编排
  - 调用内部共享层完成落库、验签与链客户端操作
- 典型上游
  - 前端
  - 运维脚本
  - 其他 Go 进程

## 当前对外接口

- `Executor/CreateOrder`
  - 创建订单
- `Executor/CancelOrders`
  - 批量撤单
- `Executor/GetOrder`
  - 查询单笔订单

## 各接口职责

### `CreateOrder`

- 校验请求字段格式
- 校验 `orderHash` 与订单内容是否一致
- 按结算合约一致的 EIP-712 规则验签
- 读取目标链最新区块时间，拒绝已过期订单
- 在可创建时写入订单表
- 记录执行费快照，供后续展示与执行前复核

### `CancelOrders`

- 处理批量撤单请求
- 这个接口不代替用户发链上交易，只登记用户钱包已经提交的撤单交易哈希
- 校验批量中的：
  - `maker`
  - `settlementAddress`
  - `nonce`
- 校验 `cancelTxHash` 对应的链上交易是否为 `invalidateNoncesBySig`，并确认它覆盖目标 nonce
- 校验成功后把订单登记到 `pending_cancel`
- 最终撤单完成状态由 indexer 根据链上事件回写

### `GetOrder`

- 按 `chainId + settlementAddress + orderHash` 查询订单
- 返回订单当前状态与执行费相关字段

## 关键模块说明

### `internal/logic/`

当前主要逻辑文件包括：

- `createorderlogic.go`
  - 创建订单逻辑
- `cancelorderslogic.go`
  - 批量撤单逻辑
- `getorderlogic.go`
  - 查询订单逻辑
- `order_helpers.go`
  - 订单转换、notice 构造、请求辅助校验

### `internal/svc/`

- 统一初始化数据库连接
- 统一初始化所有链的结算客户端
- 为 logic 层注入共享依赖
- 当前要求启动时必须完成数据库与链客户端初始化，避免 RPC 以半可用状态对外提供服务

### `internal/server/`

- 注册 gRPC Server
- 把 proto 生成的 server 接口与 logic 层连接起来

### `executorclient/`

- 提供给其他 Go 进程调用 RPC 时使用的客户端封装

## 当前返回的订单关键字段

执行费相关字段目前包括：

- `executorFee`
- `executorFeeToken`
- `estimatedGasUsed`
- `gasPriceAtQuote`
- `feeQuoteAt`
- `lastRequiredExecutorFee`
- `lastFeeCheckAt`
- `lastExecutionCheckAt`
- `lastBlockReason`
- `settledAmountOut`
- `settledExecutorFee`

## 启动方式

在 `backend` 根目录下执行：

```bash
go run ./cmd/rpc -f ./executor.yaml
```

## 配置约定

- 当前统一使用 `backend` 根目录下的 `executor.yaml` 或 `executor.docker.yaml`
- 不再使用旧的 `rpc/etc/` 配置目录

## 测试覆盖

当前已补的重点 RPC 测试包括：

- `run_test.go`
- `internal/logic/createorderlogic_test.go`
- `internal/logic/cancelorderslogic_test.go`
- `internal/logic/getorderlogic_test.go`
- `internal/svc/servicecontext_test.go`
