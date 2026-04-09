# Economic Security 测试说明

本目录用于存放“经济安全测试”。

这类测试不以权限边界为主，而是聚焦协议里的价值流是否可对账，包括：
- AMM 交易手续费如何沉淀到 treasury
- treasury 中的收入如何通过 buyback / burn / distribute 再分配
- 多池奖励分发在整数除法与舍入场景下是否会丢账
- 极端或对抗路径下，经济结果是否仍然符合协议预期

## 目录分层

### `integrated-amm`

- 放 AMM 与 Router / Pair 主流程的综合经济行为测试。
- 当前文件：`FluxSwap.test.ts`

### `fee-model`

- 放手续费、收入分账、奖励分配模型的精确对账测试。
- 当前文件：`FluxFeeModel.test.ts`

### `adversarial-scenarios`

- 放极端价格冲击、路径操纵、流动性失衡、夹层式调用等对抗场景测试。
- 当前文件：`FluxEconomicAdversarial.test.ts`

## 执行方式

- 运行全部 `economic-security` 测试：
  - `npm run test:economic-security`
- 运行单个手续费模型测试文件：
  - `npx hardhat test test/economic-security/fee-model/FluxFeeModel.test.ts`

## 当前状态

- `integrated-amm` 已覆盖 DEX 主链路与协议费基础行为。
- `fee-model` 开始把协议费沉淀、treasury handoff、buyback / burn / distribute、manager rounding dust 单独拉成经济对账测试。
- `adversarial-scenarios` 已开始覆盖 stale quote、前置交易冲击、daily cap 卡点下的收入流安全回滚。
- `adversarial-scenarios` 也开始覆盖多跳路径下的连续前置交易与逐跳报价失真。
