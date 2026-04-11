# Economic Security 测试说明

本目录用于存放“经济安全测试”。

这类测试不以权限边界为主，而是聚焦协议里的价值流是否可对账，包括：

- AMM 交易手续费如何沉淀到 treasury
- treasury 收入如何通过 buyback / burn / distribute 再分配
- 多池奖励分发在整数除法与舍入场景下是否会丢账
- 极端或对抗路径下，经济结果是否仍然符合协议预期

## 目录分层

### `integrated-amm`

- 放 AMM 中 Factory / Router / Pair 主流程的综合经济行为测试
- 当前文件：`FluxSwap.test.ts`

### `fee-model`

- 放手续费、收入分账、奖励分配模型的精确对账测试
- 当前文件：`FluxFeeModel.test.ts`

### `adversarial-scenarios`

- 放极端价格冲击、路径操纵、流动性失衡、夹层调用等对抗场景测试
- 当前文件：`FluxEconomicAdversarial.test.ts`

## 执行方式

运行全部 `economic-security` 测试：

```bash
npm run test:economic-security
```

运行单个测试文件：

```bash
npx hardhat test test/economic-security/fee-model/FluxFeeModel.test.ts
```

## 当前状态

- `integrated-amm` 已覆盖 DEX 主链路与协议费基础行为
- `fee-model` 已把协议费沉淀、treasury handoff、buyback / burn / distribute、manager rounding dust 拉成独立对账测试
- `adversarial-scenarios` 已覆盖 stale quote、前置交易冲击、daily cap 卡点、treasury pause 夹击
- `adversarial-scenarios` 已覆盖多跳路径下的连续前置交易与逐跳报价失真
- `adversarial-scenarios` 已覆盖 direct reward 在 treasury 指针漂移、微额 rounding 边界下的失败与恢复路径
- `adversarial-scenarios` 已覆盖已有 pending reward 状态下再次触发微额失败时，旧奖励不会被冲掉，后续有效奖励仍可继续结算
- 恢复后的成功路径已进一步验证真实 staking pool 的 `syncRewards -> getReward -> exit` 闭环，而不是只停在 manager 内部账本

## 后续维护约束

- 新增经济对账测试时，应优先放入已有三层之一，并同步更新对应 README
- 若某条测试同时涉及系统链路与精确对账，应优先按“主要断言目标”决定归属
