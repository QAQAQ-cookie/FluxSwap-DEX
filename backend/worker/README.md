# Worker Modules

这个目录对应后端的“后台任务层”。

它负责持续运行的异步任务，包括订单执行扫描、链上回执确认、事件订阅与状态回写。

## 目录结构

- `executor/`
  - 可执行订单扫描与链上执行
- `indexer/`
  - 链上事件订阅与订单状态回写

## 层级定位

- 正式职责名
  - 后台任务层
- 主要职责
  - 异步扫描待执行订单
  - 跟踪链上交易回执
  - 消费链上事件并回写数据库
- 主要组成
  - `executor/`
  - `indexer/`

## executor 模块

`worker/executor/` 负责订单执行侧的主动扫描与链上结算。

### 当前职责

- 扫描与当前 `chainId + settlementAddress` 匹配的 `open` 订单
- 调用链上 `canExecuteOrder`
- 在报价满足条件时重新估算当前所需执行费
- 校验 maker 余额与授权
- 满足条件后提交 `executeOrder`
- 持续轮询 `pending_execute` / `pending_cancel` 订单的链上回执

### 当前关键行为

- 只有当 `签名中的 executorFee >= 当前所需 executorFee` 时，才会真正发起执行交易
- 如果执行费不足，不提交链上交易，只更新：
  - `lastRequiredExecutorFee`
  - `lastFeeCheckAt`
  - `lastExecutionCheckAt`
  - `lastBlockReason`
  - `statusReason`
- 若 maker 余额不足或授权不足，订单保持 `open`
- 若订单在扫描时已过期，会直接收口为 `expired`

### Pending 自愈

- 如果 receipt 已确认但 indexer 尚未回写，executor 会继续检查链上最终状态并主动收口
- 执行单可直接收口为 `executed`
- 撤单可直接收口为 `cancelled`

### 阻塞冷却

- 当协议侧返回 `PAUSED`、`EXECUTOR_NOT_SET` 等阻塞原因时
- executor 不会在每个扫描周期都重复打链
- 会按 `ProtocolBlockedRetryMs` 做冷却后再检查

## indexer 模块

`worker/indexer/` 负责链上事件消费与数据库状态同步。

### 当前职责

- 订阅结算合约日志
- 解析事件
- 回写订单状态
- 推进同步游标

### 当前监听事件

- `OrderExecuted`
- `NonceInvalidated`

### 当前回写行为

`OrderExecuted` 会回写：

- `status = executed`
- `executedTxHash`
- `settledAmountOut`
- `settledExecutorFee`

`NonceInvalidated` 会回写：

- `status = cancelled`

### 游标推进

- 当前按 `blockNumber + logIndex` 精确推进同步游标
- 用于避免重复消费与支持断点续跑

## 启动方式

在 `backend` 根目录下执行：

```bash
go run ./cmd/executor -f ./executor.yaml
go run ./cmd/indexer -f ./executor.yaml
```

## 与订单页相关的说明

- 创建订单时记录的执行费快照，用于订单页展示“预估执行费”
- worker 执行前重算的是“当前所需执行费”
- 这个重算值用于执行判断，不会覆盖用户签名中的固定 `executorFee`

## 测试覆盖

当前已补的重点 worker 测试包括：

- `executor/worker_test.go`
- `indexer/subscriber_test.go`
- `indexer/worker_test.go`
