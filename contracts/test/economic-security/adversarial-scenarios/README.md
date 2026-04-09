# Adversarial Scenarios 测试说明

本目录用于存放“对抗场景测试”。

这里不再重复常规功能流，而是专门模拟容易在真实环境里出现的恶意顺序、过期报价、异常边界和状态卡点。

## 当前测试文件

### `FluxEconomicAdversarial.test.ts`

- 校验 buyback 使用过期报价时，前置交易造成的滑点恶化会让整笔交易安全回滚。
- 校验多跳 buyback 在连续前置交易同时打坏两跳价格后，也会整笔回滚。
- 校验回滚后 treasury 中的 revenue 与 approved spender allowance 都不会被偷偷消耗。
- 校验 treasury 的 daily spend cap 被压低时，buyback 路径不会留下半消费状态。
- 校验 treasury pause 插入 buyback 收入流时，会整笔阻断且不消耗已批准额度。
- 校验 manager / buyback / distributor 的 treasury 指针漂移时，direct reward 路径会在资金转移前失败。
- 校验微额 direct reward 在 rounding 下触发 `REWARD_TOO_SMALL` 时，不会留下半消费状态。
- 校验已有 pending reward 状态下，后续微额失败不会冲掉旧奖励或污染 manager accounting。
- 校验在重新报价、恢复 spend cap、解除 pause 或修复 treasury 指针后，收入流仍能恢复执行。
- 校验恢复后的成功路径会真实进入 staking pool，并继续完成 `syncRewards -> getReward -> exit`。

## 当前状态

- 已覆盖单跳 stale quote、双跳 stale quote、daily cap 卡点、treasury pause 夹击、treasury 指针漂移、微额 rounding 六类高风险对抗面。
- 已覆盖已有 pending reward 状态下再次触发微额失败时，旧奖励不会被冲掉，后续有效奖励仍可继续结算。
- 已覆盖失败后 allowance / treasury balance / manager accounting 不泄漏，以及恢复后真实池子仍可继续结算领取。