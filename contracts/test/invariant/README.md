# Invariant 测试说明

本目录用于存放基于 Foundry 的不变量测试（Invariant Tests）。
这类测试不会只验证某一条固定调用路径，而是让 `handler` 在多轮随机动作序列中反复调用合约，再持续检查“无论怎么调用，都必须始终成立”的底层性质。

## 当前运行方式

先进入项目的 `contracts` 目录，再执行：

```bash
npm run test:invariant
```

如果当前终端环境已经能直接调用 `forge`，也可以执行：

```bash
forge test --match-path 'test/invariant/*.t.sol' -vv
```

如果只想跑某一份 invariant 文件，可以使用：

```bash
forge test --match-path test/invariant/FluxSwapStakingRewardsInvariant.t.sol -vv
forge test --match-path test/invariant/FluxMultiPoolManagerInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapTreasuryInvariant.t.sol -vv
```

说明：

- `scripts/run-invariant-tests.mjs` 会自动枚举 `test/invariant` 下的 `*.t.sol` 文件逐个执行。
- 当 `forge` 已加入当前 shell 的 `PATH` 时，脚本会直接调用本机 `forge`。
- 在 Windows 下如果当前 shell 找不到 `forge`，脚本会尝试走默认 `WSL Ubuntu` 环境执行。
- 不需要写死任何本地绝对路径，只要先切到你自己的 `contracts` 目录即可。

## 当前已覆盖范围

截至当前版本，`npm run test:invariant` 已覆盖：

- `3` 个 Foundry invariant 套件
- `12` 个不变量断言
- 覆盖 `FluxSwapStakingRewards`、`FluxMultiPoolManager`、`FluxSwapTreasury`

### `FluxSwapStakingRewardsInvariant.t.sol`

当前通过 `handler` 对下列动作做随机序列调用：

- `stake`
- `withdraw`
- `getReward`
- `exit`
- `notifyRewardAmount`

当前锁定的核心不变量：

- `rewardReserve` 必须始终等于合约内 `rewardToken` 余额
- `pendingUserRewards` 不能超过 `rewardReserve`
- `queuedRewards` 不能超过真实未分配奖励
- 合约内 `stakingToken` 余额必须始终等于 `totalStaked`
- 已注入奖励总量必须由“池内剩余奖励 + 已支付给用户奖励”完整解释

## 为什么先从这个模块开始

`FluxSwapStakingRewards` 同时包含：

- 资金守恒
- 队列奖励释放
- 多用户份额变化
- withdraw / claim / exit 交错顺序

这类逻辑最适合用 invariant 来检查底层记账是否始终闭合。

### `FluxMultiPoolManagerInvariant.t.sol`

当前通过最小化 `MockTreasury + MockPool` 环境，对下列 manager 动作做随机序列调用：

- `distributeRewards`
- `claimPoolRewards`
- `setPool`
- `deactivatePool`
- `pause / unpause`

当前锁定的核心不变量：

- manager 持有的奖励余额必须始终覆盖 `totalPendingRewards + undistributedRewards`
- `totalAllocPoint` 必须始终等于全部 active pool 的 `allocPoint` 之和
- inactive pool 的 `rewardDebt` 必须归零
- 已注入奖励总量必须由“manager 剩余余额 + 池子已领走奖励”完整解释

### `FluxSwapTreasuryInvariant.t.sol`

当前通过带参考模型的 `handler`，对下列 treasury 动作做随机序列调用：

- `topUpSpendToken`
- `topUpBurnToken`
- `configureAllowedToken`
- `configureAllowedRecipient`
- `configureDailySpendCap`
- `approveSpender`
- `revokeSpender`
- `allocate`
- `pullApprovedToken`
- `burnApprovedToken`
- `consumeApprovedSpenderCap`
- `pause / unpause`
- `advanceTime`

当前锁定的核心不变量：

- `spendToken` 总账必须始终守恒，只能在 `treasury / recipient / spender` 三处流转
- `burnToken` 总账必须始终闭合，烧毁量只能来自授权 `burn` 路径
- `approvedSpendRemaining` 必须与参考模型完全一致
- `spentToday / lastSpendDay` 必须与参考模型完全一致

## 本轮新增补强点

这一轮把 `FluxSwapTreasury` 正式纳入 invariant 覆盖，并且不是只做余额校验，而是把：

- timelock 配置变更
- spender 授权与撤销
- daily cap 日切换
- pause / unpause
- allocate / pull / burn / consume 四条消费路径

一起放进了同一个随机动作序列里，持续验证 treasury 内部关键账本不会漂移。

## 后续建议补充的 invariant 方向

下一批优先建议继续补：

- `FluxSwapPair / Router`：检查储备、LP 份额、swap 后储备变化与资产守恒关系
- `FluxPoolFactory / managed pool`：检查工厂映射、manager allocPoint、pool 所有权迁移后的状态始终闭合
