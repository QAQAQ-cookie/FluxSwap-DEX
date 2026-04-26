# Redis Router Graph

这个目录负责图谱元数据在 Redis 里的业务读写封装。

当前包含：

- `PairMetadata`
- `TokenNeighbors`
- Redis key 规则
- 基于 `backend/redis` 的最小读写封装

当前不包含：

- factory 全量扫描
- `PairCreated` 事件监听
- reserve / 报价缓存
- worker 调度逻辑
