# Chain Modules

这个目录保存后端真实使用的链上交互代码。

## 文件说明

- `flux_signed_order_settlement.go`
  - 使用 `abigen` 基于 `FluxSignedOrderSettlement` 最新编译产物生成。
  - 当前 `SignedOrder` 使用 `maxExecutorRewardBps`，表示执行器最多可拿走 surplus 的比例上限。
- `flux_swap_router.go`
  - 使用 `abigen` 基于 `FluxSwapRouter` 最新编译产物生成。
  - 用于查询兑换路径、估算执行成本对应的输出代币数量。
- `settlement_client.go`
  - 封装执行器使用的链上读写能力。
  - 负责读取订单报价、检查订单是否可执行、估算执行成本、提交执行交易、校验撤单交易和读取回执。
- `order_signature.go`
  - 按合约一致的 EIP-712 规则计算订单哈希和签名摘要。

## 当前限价单费用模型

- 用户签名里不再写固定 `executorFee` 数量。
- 用户签名里写 `maxExecutorRewardBps`，表示执行器最多可拿走成交 surplus 的多少比例。
- 执行器执行前会读取当前报价，计算：
  - `surplus = amountOut - minAmountOut`
  - `maxExecutorReward = surplus * maxExecutorRewardBps / 10000`
- 执行器再根据当前 gas 成本估算本次需要的 `executorReward`。
- 链上 `executeOrder` 会再次校验 `executorReward <= maxExecutorReward`，并保证用户至少收到 `minAmountOut`。

## 生成命令

在 `backend` 目录下执行：

```bash
go run github.com/ethereum/go-ethereum/cmd/abigen --abi <FluxSignedOrderSettlement.abi.json> --pkg chain --type FluxSignedOrderSettlement --out internal/chain/flux_signed_order_settlement.go
```

`<FluxSignedOrderSettlement.abi.json>` 可以从 `contracts/artifacts/contracts/FluxSignedOrderSettlement.sol/FluxSignedOrderSettlement.json` 中提取 `abi` 字段生成。
