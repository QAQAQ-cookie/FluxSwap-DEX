# Worker 模块

这个目录是后端的异步任务层，负责持续运行的后台任务，包括限价单执行扫描、链上回执确认、事件订阅和状态回写。

## 目录结构

- `executor/`：扫描可执行限价单，并在条件满足时提交链上 `executeOrder`。
- `indexer/`：监听结算合约事件，并把链上终态回写到数据库。

## Executor 职责

- 扫描当前 `chainId + settlementAddress` 下的 `open` 订单。
- 调用链上 `canExecuteOrder` 检查订单是否满足基础执行条件。
- 检查 maker 的输入代币余额和对 settlement 合约的授权额度。
- 读取当前订单报价，计算本次可分配给执行器的 surplus 奖励上限。
- 根据当前 gas 成本估算本次需要的执行奖励。
- 只有当前 surplus 可覆盖执行成本时，才提交链上 `executeOrder`。
- 持续轮询 `pending_execute` / `pending_cancel` 订单的链上回执。

## 执行奖励模型

当前限价单不再使用“签名固定执行费”模式。

- 前端签名字段是 `maxExecutorRewardBps`，表示执行器最多能从 surplus 中拿走的比例，上限是 `10000`。
- 数据库字段 `executor_fee` 暂时保留旧名字，但业务含义已经是 `maxExecutorRewardBps`。
- 执行器执行前会读取当前报价：
  - `surplus = amountOut - minAmountOut`
  - `maxExecutorReward = surplus * maxExecutorRewardBps / 10000`
- 执行器再估算当前 gas 成本对应的输出代币数量，作为本次传给合约的 `executorReward`。
- 如果 `executorReward > maxExecutorReward`，执行器不会提交链上交易，订单保持 `open`，等待后续价格或 gas 条件变化。
- 合约执行时会再次校验 `executorReward` 没有超过比例上限，并保证用户至少收到 `minAmountOut`。

## Pending 自愈

- 如果执行交易已经有成功回执，但 indexer 尚未回写，executor 会继续检查链上状态并主动收口为 `executed`。
- 如果撤单交易已经有成功回执，但 indexer 尚未回写，executor 会继续检查 nonce 状态并主动收口为 `cancelled`。
- 如果 pending 交易丢失或回滚，executor 会根据订单是否过期、nonce 是否失效等链上状态把订单恢复到可重试或终态。

## Indexer 职责

- 监听 `OrderExecuted`。
- 监听 `NonceInvalidated`。
- 按 `blockNumber + logIndex` 推进同步游标。
- 将成交数量、执行奖励、成交交易哈希和撤单状态回写到数据库。

## 启动方式

在 `backend` 根目录执行：

```bash
go run ./cmd/executor -f ./executor.yaml
go run ./cmd/indexer -f ./executor.yaml
```

## 测试覆盖

当前重点测试文件包括：

- `executor/worker_test.go`
- `indexer/subscriber_test.go`
- `indexer/worker_test.go`
