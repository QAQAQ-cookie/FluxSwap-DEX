# Chain Modules

当前目录集中放置执行器后端真正使用的链上交互代码，目标是把“合约 binding”和“链上客户端封装”放在同一个位置，便于查看和维护。

目前包含：

- `flux_signed_order_settlement.go`
  - 使用 `abigen` 生成的 Go binding
  - 对应合约：
    - `contracts/contracts/FluxSignedOrderSettlement.sol`

- `settlement_client.go`
  - 执行器实际使用的链上客户端封装
  - 当前负责：
    - 只读检查订单是否可执行 `CanExecuteOrder`
    - 提交订单执行交易 `ExecuteOrder`
    - 提交批量撤单交易 `InvalidateNoncesBySig`
    - 查询交易回执 `ReceiptStatus`

说明：

- 当前运行时实际直接使用的是 `abigen` 生成的 Go binding 文件
- 这里不再保留手写最小 ABI 字符串
- 后续如果需要重新生成 binding，推荐流程：
  1. 在 `contracts` 下重新编译合约
  2. 从最新 artifact 临时导出 ABI
  3. 使用 `abigen` 重新生成 `internal/chain/flux_signed_order_settlement.go`
  4. 生成完成后删除临时 ABI 文件
