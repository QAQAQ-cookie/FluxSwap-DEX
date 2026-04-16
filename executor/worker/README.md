# Worker Modules

当前目录用于放执行器后台任务模块。

当前包含：

- `executor/`
  - 扫描并执行 `open` 状态订单
- `indexer/`
  - 订阅并回写链上事件

当前行为：

- `executor`
  - 只扫描与当前 `chainId + settlementAddress` 匹配的 `open` 订单
  - 先调用链上 `canExecuteOrder`
  - 若链上报价已满足条件，再重新估算“当前所需执行费”
  - 只有当 `签名 executorFee >= 当前所需 executorFee` 时，才真正发起 `executeOrder`
  - 若执行费不足，不提交链上交易，只更新：
    - `lastRequiredExecutorFee`
    - `lastFeeCheckAt`
    - `lastExecutionCheckAt`
    - `lastBlockReason`
    - `statusReason`

- `indexer`
  - 当前监听：
    - `OrderExecuted`
    - `NonceInvalidated`
  - `OrderExecuted` 会回写：
    - `status = executed`
    - `executedTxHash`
    - `settledAmountOut`
    - `settledExecutorFee`
  - `NonceInvalidated` 会把对应活跃订单回写为 `cancelled`

说明：

- 订单创建时记录的执行费快照，用于订单页展示“预估执行费”。
- worker 执行前重新计算的是“当前所需执行费”，仅用于风控判断，不会覆盖用户签名中的固定 `executorFee`。

启动方式：

```bash
go run ./cmd/executor -f ./rpc/etc/executor.yaml
go run ./cmd/indexer -f ./rpc/etc/executor.yaml
```
