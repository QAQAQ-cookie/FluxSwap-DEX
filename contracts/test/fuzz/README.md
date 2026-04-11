# Fuzz 测试说明

本目录用于存放基于 Foundry 的模糊测试。  
这类测试会在较大的输入空间里随机化参数，重点验证“核心性质在大量边界条件下是否依然成立”，用来补足常规单元、集成、回归测试难以穷举的输入组合。

## 运行方式

先进入项目的 `contracts` 目录，再执行：

```bash
npm run test:fuzz
```

如果你已经在当前终端环境里配置好了 Foundry，也可以直接执行：

```bash
forge test --match-path 'test/fuzz/*.t.sol' -vv
```

如果只想跑单个 fuzz 文件，可以用：

```bash
forge test --match-path test/fuzz/FluxSwapRouterFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapStakingRewardsFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxMultiPoolManagerFuzz.t.sol -vv
```

说明：

- `scripts/run-fuzz-tests.mjs` 会自动枚举 `test/fuzz` 下的 `*.t.sol` 文件逐个执行。
- 在 `forge` 已加入当前 shell 的 `PATH` 时，脚本会直接调用本机 `forge`。
- 在 Windows 下如果当前 shell 找不到 `forge`，脚本会尝试走默认 `WSL Ubuntu` 环境执行。
- 不需要写死任何本地绝对路径，只要先切到你自己的 `contracts` 目录即可。

## 当前覆盖范围

### `FluxSwapRouterFuzz.t.sol`

覆盖 Router 最核心、最容易被输入边界打到的 7 条路径：

- `swapExactTokensForTokens`
- `swapTokensForExactTokens`
- `addLiquidity`
- `removeLiquidity`
- `swapExactETHForTokens`
- `swapExactTokensForETH`
- `swapETHForExactTokens`

当前重点验证的性质：

- `exact-input / exact-output` 交换执行结果必须与 Router quote 一致
- 已有池子的 `addLiquidity` 不得超过用户给定的 `desired` 数量
- `swapETHForExactTokens` 在超额付款时必须正确退款
- `removeLiquidity` 必须按 LP 份额精确返还底层资产

### `FluxSwapStakingRewardsFuzz.t.sol`

覆盖奖励会计最容易出现 rounding / dust / 入场顺序问题的路径：

- 单用户多批次发奖后的奖励累计
- 无人质押时先进入 `queuedRewards`，首个用户入场后的释放
- 双用户先后入场时的历史奖励隔离
- 部分 `withdraw` 之后再次发奖时的奖励连续性

当前重点验证的性质：

- `earned()` 必须与参考会计模型一致
- `rewardReserve` 必须等于“总注入奖励 - 已支付奖励”
- 合约内实际 `rewardToken` 余额必须与 `rewardReserve` 一致
- `queuedRewards` 不得脱离真实未分配奖励而漂移

### `FluxMultiPoolManagerFuzz.t.sol`

覆盖多池奖励分账最容易出错的几类会计边界：

- `setPool` 重配 `allocPoint` 后的多轮发奖与 claim
- 池子停用后的奖励停止累计语义
- 小额奖励多轮发放下的 `undistributedRewards` / carry-forward dust

当前重点验证的性质：

- `totalPendingRewards + undistributedRewards` 始终不能超过 manager 实际余额
- 停用池在后续发奖后不得继续新增 `pendingPoolRewards`
- 所有已注入奖励最终都必须能被解释为“pool 已领取 + manager 剩余保留金”

## 本轮 fuzz 锁定的问题

这轮除了延续 `FluxSwapStakingRewards` 的 rounding / dust 检查外，还把 `FluxMultiPoolManager` 新增了一层 fuzz 防线，专门覆盖：

- 多轮 `distributeRewards` 之间穿插 `setPool`
- claim 时不得提前吞掉 `undistributedRewards`
- 停用池与活跃池混合切换时，保留金必须始终可覆盖

对应的确定性回归也已经补到：

- `test/regular/regression/rewards-accounting/FluxRewardsAccountingRegression.test.ts`

## 后续可继续补强的方向

- `FluxSwapTreasury / FluxRevenueDistributor`：额度边界、暂停态、资金去向与守恒
- `FluxPoolFactory / managed pool`：工厂创建后与 manager / pool 的联动模糊场景
- Router fee-on-transfer 路径：带税代币输入下的滑点、到账与 quote 偏差边界
