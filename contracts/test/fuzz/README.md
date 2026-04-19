# Fuzz 测试说明

本目录用于存放基于 Foundry 的 fuzz 与 stateful fuzz 测试。

## 执行方式

- `npm run test:fuzz`
- 或直接运行：`forge test --match-path 'test/fuzz/*.t.sol' -vv`

## 当前覆盖方向

- Router 常规输入输出路径
- Router 异常路径
- SignedOrderSettlement 最小链上状态
- AMM token-token / token-ETH 生命周期状态机
- Treasury / RevenueDistributor / BuybackExecutor / Factory / PoolFactory / LP Pool / MultiPoolManager
- Revenue pipeline 与 managed pool 生命周期长序列

## 兼容性说明

- 当前协议已明确不支持 `fee-on-transfer` / `taxed token`。
- 因此 fuzz 不再覆盖税币 supporting 路径，也不再保留相关状态机。
