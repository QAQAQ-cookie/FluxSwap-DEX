# Worker Modules

当前目录用于放置后台任务模块。

当前规划：

- `executor/`: 扫描与执行订单
- `indexer/`: 订阅并回写链上事件

当前已补充：

- `indexer/events.go`: 事件名称与最小事件结构
- `indexer/worker.go`: 事件回写入口，会复用 `ApplyOrderEvent` 逻辑
- `executor/worker.go`: 扫描 `open` 订单，先调用 `canExecuteOrder` 判定，再使用执行器私钥提交 `executeOrder` 交易
- `cmd/executor`: 独立的执行器启动入口
- `cmd/indexer`: 独立的索引器启动入口

当前可用启动方式：

```bash
go run ./cmd/executor -f ./rpc/etc/executor.yaml
go run ./cmd/indexer -f ./rpc/etc/executor.yaml
```

健康检查：

- executor worker: `GET /healthz`，默认 `0.0.0.0:9101`
- indexer worker: `GET /healthz`，默认 `0.0.0.0:9102`

当前行为说明：

- `executor` 只扫描与当前 `chainId + settlementAddress` 匹配的 `open` 订单
- 若 `canExecuteOrder` 返回可执行，执行器会构造并签名 `executeOrder` 交易
- 交易提交成功后，订单会被更新为 `pending_execute`，并回写 `submitted_tx_hash`
- 执行器会额外轮询 `pending_execute` 订单的链上回执
- 若交易确认成功，状态原因会更新为 `tx_confirmed_waiting_for_indexer`
- 若交易失败，订单会回退为 `open`，清空 `submitted_tx_hash`，等待后续重新检查与再次提交
- 最终的 `executed / cancelled` 状态仍由 `indexer` 根据链上事件统一确认

后续仍待补充：

- metrics 指标暴露
