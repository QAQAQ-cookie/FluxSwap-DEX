# Invariant 测试说明

本目录用于存放基于 Foundry 的 invariant 测试，通过 handler 在长序列随机动作下持续验证底层约束是否始终成立。

## 执行方式

- `npm run test:invariant`
- 或直接运行：`forge test --match-path 'test/invariant/*.t.sol' -vv`

## 当前覆盖方向

- `FluxSwapStakingRewards`
- `FluxMultiPoolManager`
- `FluxSwapTreasury`
- `FluxRevenueDistributor + FluxPoolFactory + FluxMultiPoolManager + managed pools`
- `FluxRevenueTreasuryManager` 联动链路
- `FluxSignedOrderSettlement`
- `FluxSwapFactory + FluxSwapRouter + FluxSwapPair` 的标准 token-token AMM
- `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH` 的标准 token-ETH / WETH AMM
- Router 成功路径与异常路径混排
- 共享 token 的双 Pair 混排

## 兼容性说明

- 当前协议已明确不支持 `fee-on-transfer` / `taxed token`。
- 因此相关 invariant 已从本目录移除。
