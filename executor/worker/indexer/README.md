# Indexer Worker

当前目录用于承载链上事件索引与回写逻辑。

当前已完成：

- `Worker.ApplyEvent(...)` 事件回写入口
- `Subscriber` WebSocket 订阅器
- 独立启动入口 `cmd/indexer`
- 启动时优先从数据库 `sync_cursor` 续跑
- 如果没有 cursor，则回扫最近 `IndexerBackfillBlocks` 个区块
- 事件会落库到 `order_events` 表，重复事件按幂等跳过

当前自动识别并回写：

- `OrderExecuted`
- `OrderCancelled`
- `NonceInvalidated`
- `MinValidNonceUpdated`

启动方式：

```bash
go run ./cmd/indexer -f ./rpc/etc/executor.yaml
```

关键配置：

- `Chain.WSRPCURL`: 必须是 `ws://` 或 `wss://` WebSocket RPC
- `Chain.SettlementAddress`: 签名订单结算合约地址
- `Worker.IndexerBackfillBlocks`: 首次启动或无 cursor 时的回扫窗口

后续仍建议补充：

- 更细粒度的断线恢复策略
- 独立事件落库表
- 更完整的 cursor 元信息
