# RPC 模块

这个目录是后端的 gRPC 接口层，负责接收前端或其他调用方的请求，并完成参数校验、验签、落库、查单和撤单登记。

## 目录结构

- `proto/`：gRPC 协议定义。
- `executor/`：根据 proto 生成的服务端 pb 文件。
- `executorclient/`：根据 proto 生成的 Go 客户端封装。
- `internal/logic/`：接口业务逻辑。
- `internal/server/`：gRPC 服务注册。
- `internal/svc/`：服务上下文与依赖装配。
- `run.go`：RPC 服务启动入口封装。

## 当前接口

- `Executor/CreateOrder`：创建限价单。
- `Executor/CancelOrders`：批量登记用户已提交的撤单交易。
- `Executor/GetOrder`：查询单笔订单。

## CreateOrder

创建订单时会完成：

- 校验请求字段格式。
- 校验 `orderHash` 与订单内容是否一致。
- 按结算合约一致的 EIP-712 规则验签。
- 读取目标链最新区块时间，拒绝已经过期的订单。
- 记录创建时的 gas / 执行成本快照，供订单页展示参考。
- 在可创建时写入订单表。

订单数值字段口径约定：

- `amountIn` 与 `minAmountOut` 都必须是按代币自身 `decimals` 转换后的最小单位整数字符串。
- `triggerPriceX18` 必须是统一到 `1e18` 精度的价格整数字符串，语义是“每 1 个输入币，至少买到多少个输出币”。
- `triggerPriceX18` 不是直接用两个最小单位整数字段做 `minAmountOut / amountIn`，而是需要先按输入/输出代币精度归一后再放大到 `1e18`。
- RPC 只校验并存储这些整数值，不负责把用户展示小数再转换一次。

执行奖励字段说明：

- `maxExecutorRewardBps` 表示执行器最多可从 surplus 中拿走的比例。
- 取值范围是 `0` 到 `10000`，例如 `3000` 表示最高 `30%`。
- 创建阶段不会因为当前 gas 成本过高而拒绝订单，真正是否值得执行由 worker 在执行前按实时报价判断。
- 数据库字段暂时仍叫 `executor_fee`，但这只是存储层旧字段名；RPC 对外不再使用 `executorFee` 入参。

## CancelOrders

撤单接口不替用户发链上交易，只登记用户钱包已经提交的撤单交易哈希。

它会校验：

- `maker`
- `settlementAddress`
- `orderHash`
- `cancelTxHash`
- 链上交易是否调用 `invalidateNoncesBySig`
- 撤单交易是否覆盖目标 nonce

校验成功后，订单会进入 `pending_cancel`，最终状态由 indexer 或 executor 回执轮询收口。

## GetOrder

按 `chainId + settlementAddress + orderHash` 查询订单。

返回的执行奖励相关字段包括：

- `maxExecutorRewardBps`：签名订单允许执行器领取的最大 surplus 比例。
- `executorFeeToken`：当前按输出代币口径记录。
- `estimatedGasUsed`：创建或执行检查时使用的预估 gas。
- `gasPriceAtQuote`：最近一次奖励快照使用的 gasPrice。
- `rewardQuoteAt`：最近一次奖励快照时间。
- `lastRequiredExecutorReward`：最近一次估算出的执行器成本，按输出代币计价。
- `lastRewardCheckAt`：最近一次执行奖励检查时间。
- `settledExecutorReward`：订单实际成交后，链上事件回写的实际执行奖励。

## 启动方式

在 `backend` 根目录执行：

```bash
go run ./cmd/rpc -f ./executor.yaml
```

## 配置约定

- 当前统一使用 `backend` 根目录下的 `executor.yaml` 或 `executor.docker.yaml`。
- 不再使用旧的 `rpc/etc/` 配置目录。

## 测试覆盖

当前重点测试文件包括：

- `run_test.go`
- `internal/logic/createorderlogic_test.go`
- `internal/logic/cancelorderslogic_test.go`
- `internal/logic/getorderlogic_test.go`
- `internal/svc/servicecontext_test.go`
