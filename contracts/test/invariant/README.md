# Invariant 测试说明

本目录用于存放基于 Foundry 的不变量测试（Invariant Tests）。
这类测试不会只验证某一条固定调用路径，而是让 `handler` 在多轮随机动作序列中反复调用合约，再持续检查“无论怎么调用，都必须始终成立”的底层性质。

## 当前运行方式

推荐在 `WSL Ubuntu` 终端中，先进入项目的 `contracts` 目录，再执行：

```bash
forge test --match-path 'test/invariant/*.t.sol' -vv
```

如果只想跑某一份 invariant 文件，可以使用：

```bash
forge test --match-path test/invariant/FluxSwapStakingRewardsInvariant.t.sol -vv
```

## 当前已覆盖范围

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

## 后续建议补充的 invariant 方向

下一批优先建议继续补：

- `FluxSwapTreasury`：检查白名单、额度、暂停状态、资金流向限制是否始终不被突破
- `FluxSwapPair / Router`：检查储备、LP 份额、swap 后储备变化与资产守恒关系
