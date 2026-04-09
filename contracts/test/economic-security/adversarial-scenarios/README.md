# Adversarial Scenarios 测试说明

本目录用于存放“对抗场景测试”。

这里不再重复常规功能流，而是专门模拟容易在真实环境里出现的恶意顺序、过期报价、异常边界和状态卡点。

## 当前测试文件

### `FluxEconomicAdversarial.test.ts`

- 校验 buyback 使用过期报价时，前置交易造成的滑点恶化会让整笔交易安全回滚。
- 校验多跳 buyback 在连续前置交易同时打坏两跳价格后，也会整笔回滚。
- 校验回滚后 treasury 中的 revenue 与 approved spender allowance 都不会被偷偷消耗。
- 校验 treasury 的 daily spend cap 被压低时，buyback 路径不会留下半消费状态。
- 校验 manager / buyback / distributor 的 treasury 指针漂移时，direct reward 路径会在资金转移前失败。
- 校验微额 direct reward 在 rounding 下触发 `REWARD_TOO_SMALL` 时，不会留下半消费状态。
- 校验在重新报价或恢复 spend cap 后，收入流仍能恢复执行。

## 后续可继续补的方向

- 极端多跳路径下的连续前置交易与报价漂移
- pause / treasury handoff / pool handoff 与收入流交错时的连续性
- 先制造 fee / reward state，再用极小金额或极端顺序调用尝试打穿 accounting
