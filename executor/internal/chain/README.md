# Chain Modules

当前目录放的是执行器真正使用的链上交互代码。

包含内容：

- `flux_signed_order_settlement.go`
  - 使用 `abigen` 基于 `FluxSignedOrderSettlement` 最新 artifact 重新生成
- `flux_swap_router.go`
  - 使用 `abigen` 基于 `FluxSwapRouter` 最新 artifact 生成
- `settlement_client.go`
  - 执行器使用的结算客户端
  - 结算合约和 Router 都直接依赖 `abigen` 重新生成后的 Go binding
  - 当前负责：
    - 查询订单是否可执行 `CanExecuteOrder`
    - 估算输出币口径的执行费 `SuggestExecutorFee`
    - 提交订单执行交易 `ExecuteOrder`
    - 提交批量 nonce 撤单交易 `InvalidateNoncesBySig`
    - 查询交易回执 `ReceiptStatus`

说明：

- 当前 [flux_signed_order_settlement.go](/D:/work/CodeLab/FluxSwap-DEX/executor/internal/chain/flux_signed_order_settlement.go) 已按最新合约重新生成，`SignedOrder` 已包含 `executorFee`。
- 当前 [flux_swap_router.go](/D:/work/CodeLab/FluxSwap-DEX/executor/internal/chain/flux_swap_router.go) 也已生成，执行费估算使用的是它的 `GetAmountsIn`。
- 之后如果合约结构继续变动，建议先重新编译 `contracts`，再重新生成这份 binding。
