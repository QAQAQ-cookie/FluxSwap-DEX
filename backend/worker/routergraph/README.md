# Router Graph Worker

这个 worker 负责从链上同步 AMM 路由图谱元数据，并写入 Redis。

当前行为：

- 启动时先做一次全量扫描
- 运行过程中按 `SyncInterval` 定时全量同步
- 同时监听 `PairCreated` 事件，增量补充新建交易对
- 订阅断开或 worker 重启后，会按区块范围补扫 `PairCreated` 日志，避免漏同步

当前会同步的数据：

- settlement 对应的 factory 地址
- factory 下全部 pair
- 每个 pair 对应的 `token0` 和 `token1`
- pair 元数据
- token 邻接表
- routergraph 自己的同步游标

当前不包含：

- reserve 同步
- 实时报价缓存
- 最优路径计算

## 本地验证

先确认本地链和 Redis 都已启动，并且配置文件里已启用 Redis。

执行一次全量同步：

```bash
go run ./cmd/routergraph -f ./executor.yaml -once
```

读取某个 token 的邻接表：

```bash
go run ./cmd/routergraph -f ./executor.yaml -chain-id 31337 -print-neighbors 0x...
```

读取某个 pair 的元数据：

```bash
go run ./cmd/routergraph -f ./executor.yaml -chain-id 31337 -print-pair 0x...
```

常驻运行 worker：

```bash
go run ./cmd/routergraph -f ./executor.yaml
```

## Docker 验证

Docker 配置里已经包含 `redis` 和 `routergraph` 服务。

启动整套服务：

```bash
docker compose up --build
```

其中会包括：

- `postgres`
- `redis`
- `migrate`
- `rpc`
- `executor`
- `indexer`
- `routergraph`

如果只想手动触发一轮同步，也可以执行：

```bash
go run ./cmd/routergraph -f ./executor.docker.yaml -once
```
