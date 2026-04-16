# RPC Scaffold

当前目录承载基于 `go-zero` 的 gRPC 服务层。

当前已具备：

- `proto/`
  - gRPC 协议定义
- `etc/`
  - RPC 配置文件
- `internal/logic`
  - RPC 业务逻辑
- `internal/server`
  - gRPC 服务注册
- `internal/svc`
  - 服务上下文与共享依赖

当前可用接口：

- `Executor/Ping`
- `Executor/CreateOrder`
- `Executor/CancelOrders`
- `Executor/ApplyOrderEvent`
- `Executor/GetOrder`

接口说明：

- `CreateOrder`
  - 校验签名订单基础字段
  - 写入订单表
  - 记录签名里的固定 `executorFee`
  - 如果当前链客户端可用，会在创建时顺手记录一份“执行费估算快照”
- `CancelOrders`
  - 使用 `invalidateNoncesBySig` 提交批量 nonce 作废交易
  - 最终状态由 indexer 根据 `NonceInvalidated` 事件回写
- `ApplyOrderEvent`
  - 当前只保留 `OrderExecuted` 事件回写入口
- `GetOrder`
  - 按 `chainId + settlementAddress + orderHash` 查询订单

当前订单返回中新增了以下执行费相关字段：

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

启动方式：

```bash
go run ./cmd/rpc -f ./rpc/etc/executor.yaml
```
