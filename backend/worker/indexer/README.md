# Indexer Worker

这个目录用于承载链上事件索引与回写逻辑。

## 当前已完成

- `Worker.ApplyEvent(...)`
  - 事件回写入口
  - `OrderExecuted` 会返回 1 笔受影响订单快照
  - `NonceInvalidated` 会返回全部受影响订单快照，不再只暴露第一笔
- `Subscriber`
  - WebSocket 订阅器
- `cmd/indexer`
  - 独立启动入口
- 启动时优先从数据库 `sync_cursor` 续跑
- 如果没有 cursor，则回扫最近 `IndexerBackfillBlocks` 个区块
- 如果 `IndexerBackfillBlocks <= 0`，则在“没有 cursor”的情况下不做历史回扫，只从当前订阅开始接后续新事件
- 事件先去重落库，再事务性更新订单状态

## 当前自动识别并回写的事件

- `OrderExecuted`
- `NonceInvalidated`

## 当前实现细节

- 游标不是只记录块高，而是记录 `blockNumber + logIndex`
- 这样在同一区块内有多条日志时，即使中途失败，重启后也不会跳过未处理的后续日志
- 重复事件通过 `order_events` 唯一键去重
- 事件落库与订单状态更新当前在同一个数据库事务内执行
- `Worker.ApplyEvent(...)` 的返回值适合后续给日志、管理端或监控复用
  - `Orders` 表示本次事件实际影响到的订单快照集合
  - `AffectedCount` 表示受影响订单数量

## 启动方式

```bash
go run ./cmd/indexer -f ./executor.yaml
```

## 关键配置

- `Chain.WSRPCURL`
  - 必须是 `ws://` 或 `wss://` WebSocket RPC
- `Chain.SettlementAddress`
  - 限价单结算合约地址
- `Worker.IndexerBackfillBlocks`
  - 首次启动或无 cursor 时的回扫窗口
  - 已存在 `sync_cursor` 时始终优先从 cursor 续跑，不受该值影响
  - 设为 `0` 或负数时，表示“无 cursor 时不做历史回扫”
