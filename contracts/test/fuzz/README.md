# Fuzz 测试说明

本目录用于存放基于 Foundry 的模糊测试（Fuzz Tests）。
这类测试会对输入做大范围随机化，重点验证“在大量边界条件下，核心性质是否仍然成立”，适合补足常规单元测试和集成测试难以穷举的输入空间。

## 当前运行方式

当前不额外提供 `npm script` 或自定义 runner，直接在项目的 `contracts` 目录下使用 Foundry 执行即可。
推荐在 `WSL Ubuntu` 终端中运行。

先进入你本地项目的 `contracts` 目录，再执行：

```bash
forge test --match-path 'test/fuzz/*.t.sol' -vv
```

如果只想跑某一份 fuzz 文件，可以使用：

```bash
forge test --match-path test/fuzz/FluxSwapRouterFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapStakingRewardsFuzz.t.sol -vv
```

如果你的项目路径和当前仓库不同，只需要把终端切到你自己的 `contracts` 目录，不需要照抄任何固定绝对路径。

## 当前已覆盖范围

### `FluxSwapRouterFuzz.t.sol`

覆盖 Router 最稳定、最核心的交换与加池路径：

- `token -> token` 的 `swapExactTokensForTokens`
- `token -> token` 的 `swapTokensForExactTokens`
- 既有池子的 `addLiquidity`
- `ETH -> token` 的 `swapExactETHForTokens`

当前重点验证的性质：

- 成交输入输出应与 Router quote 一致
- 既有池子加池时，实际消耗数量不应超过用户给定的 `desired` 数量
- 在较大输入空间下，上述路径不应因为边界值而异常失败

### `FluxSwapStakingRewardsFuzz.t.sol`

覆盖奖励会计最容易出现 rounding / dust / 入场顺序问题的路径：

- 单用户多批次发奖后的奖励累计
- 无人质押时先进入 `queuedRewards`，首个用户入场后的释放
- 双用户先后入场时的历史奖励隔离
- 部分 `withdraw` 之后再次发奖时的奖励连续性

当前重点验证的性质：

- `earned()` 与参考会计模型一致
- `rewardReserve` 必须等于“总注入奖励 - 已支付奖励”
- 合约内实际 `rewardToken` 余额必须与 `rewardReserve` 一致
- `queuedRewards` 不得脱离真实未分配奖励而漂移

## 本轮 fuzz 额外发现并锁定的问题

在补 `FluxSwapStakingRewards` fuzz 的过程中，发现并修复了两类奖励会计边界问题：

- 前一批奖励产生的 rounding dust，在后一批奖励到来后已经变得可领取，但旧实现没有及时把它从 `queuedRewards` 中释放出去
- 多用户 / 部分退出场景下，`queuedRewards` 可能短暂大于真实未分配奖励，形成 1 wei 级别的“幽灵队列”

对应的确定性回归已补到：

- `test/regular/regression/rewards-accounting/FluxRewardsAccountingRegression.test.ts`

## 后续建议补充的 fuzz 方向

下一批优先建议从下面两条线继续扩展：

- `FluxMultiPoolManager`：重点做多池分账、`allocPoint`、`undistributedRewards`、停用池切换等性质
- `FluxSwapTreasury / FluxRevenueDistributor`：重点做额度边界、资金去向、分发守恒、暂停状态与角色组合