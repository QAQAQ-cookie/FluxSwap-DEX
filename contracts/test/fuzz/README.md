# Fuzz 测试说明

本目录用于存放基于 Foundry 的模糊测试。

这类测试不会只验证一两个固定输入，而是会在较大的输入空间内随机采样，重点检查“核心性质在大量边界条件下是否仍然成立”，用来补足常规单元、集成、回归测试难以穷举的输入组合。

## 运行方式

先进入项目的 `contracts` 目录，再执行：

```bash
npm run test:fuzz
```

如果当前终端环境已经能直接调用 `forge`，也可以执行：

```bash
forge test --match-path 'test/fuzz/*.t.sol' -vv
```

如果只想跑单个 fuzz 文件，可以执行：

```bash
forge test --match-path test/fuzz/FluxSwapRouterFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapStakingRewardsFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxMultiPoolManagerFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapTreasuryFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxRevenueDistributorFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxTokenFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapPairFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxPoolFactoryFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxBuybackExecutorFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapFactoryFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapLPStakingPoolFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapRouterFeeOnTransferFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxRevenuePipelineStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxManagedPoolLifecycleStatefulFuzz.t.sol -vv
```

说明：

- `scripts/run-fuzz-tests.mjs` 会自动枚举 `test/fuzz` 下的 `*.t.sol` 文件逐个执行。
- 当 `forge` 已加入当前 shell 的 `PATH` 时，脚本会直接调用本机 `forge`。
- 在 Windows 下如果当前 shell 找不到 `forge`，脚本会尝试走默认 `WSL Ubuntu` 环境执行。
- 不需要写死任何本地绝对路径，只要先切到你自己的 `contracts` 目录即可。

## 当前覆盖范围

截至当前版本，`npm run test:fuzz` 已覆盖：

- `14` 个 Foundry fuzz / stateful fuzz 套件
- `50` 个测试用例
- 覆盖 Router、Pair、Token、Treasury、RevenueDistributor、BuybackExecutor、SwapFactory、PoolFactory、LP Staking Pool、MultiPoolManager 以及跨合约流水线 / managed pool 生命周期

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

- `exact-input / exact-output` 交换结果必须与 Router quote 一致
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
- 池子停用后的奖励停止累积语义
- 小额奖励多轮发放下的 `undistributedRewards` / carry-forward dust

当前重点验证的性质：

- `totalPendingRewards + undistributedRewards` 始终不能超过 manager 实际余额
- 停用池在后续发奖后不得继续新增 `pendingPoolRewards`
- 已注入奖励最终都必须能解释为“pool 已领取 + manager 剩余保留金”

### `FluxSwapTreasuryFuzz.t.sol`

覆盖金库里最关键的 approved spender 与日限额联动路径：

- `pullApprovedToken`
- `burnApprovedToken`
- `consumeApprovedSpenderCap`
- `pause` 后的统一拦截

当前重点验证的性质：

- allowance 消耗后 `approvedSpendRemaining` 必须精确递减
- 配置了 daily cap 时，`spentToday` 必须与当日真实消耗一致
- 跨天后 `spentToday` 必须重置为新一天的消费累计
- pause 后 approved spender 的三条消费路径都必须拒绝执行

### `FluxRevenueDistributorFuzz.t.sol`

覆盖分红分发器的金额拆分与暂停控制：

- `executeBuybackAndDistribute`
- `distributeTreasuryRewards`
- `pause` 后的双入口阻断

当前重点验证的性质：

- `buybackAmountIn = revenueAmount * buybackBps / 10000`
- `burnedAmount = amountOut * burnBps / 10000`
- `distributedAmount = amountOut - burnedAmount`
- treasury 奖励直发路径必须原样把金额转交给 manager

### `FluxTokenFuzz.t.sol`

覆盖代币供应上限与 ownership 迁移后的权限语义：

- cap 以内 mint
- burn 后重新释放 mint headroom
- cap 之外 mint 必须回退
- ownership 迁移后的 admin / minter 权限切换

当前重点验证的性质：

- `totalSupply` 任意时刻都不能超过 `cap`
- burn 释放的 headroom 可以重新 mint，但累计上限仍受 `cap` 约束
- 旧 owner 在 ownership 迁移后必须失去 admin / minter 控制权
- 新 owner 可以重新授权 minter 并恢复正常 mint 流程

### `FluxSwapPairFuzz.t.sol`

覆盖 Pair 自身的资产守恒与协议费结算：

- `mint`
- `burn`
- 无 treasury 的 `swap`
- 有 treasury 的 `swap`

当前重点验证的性质：

- mint / burn 之后储备必须与 Pair 实际余额保持同步
- 无 treasury 时，swap 后乘积不变量不能倒退
- 有 treasury 时，协议费必须按 `amountIn * 5 / 10000` 精确转出
- 付完协议费后 Pair 内剩余储备仍需自洽

### `FluxPoolFactoryFuzz.t.sol`

覆盖 managed pool 创建与移交时的工厂侧联动：

- `createSingleTokenPool`
- `createLPPool`
- `transferManagedPoolOwnership`

当前重点验证的性质：

- 新池创建后，staking asset 到 pool 的映射必须立即生效
- managed pool 的 `rewardSource / rewardNotifier` 配置必须与 manager / pool 自身对齐
- LP pool 创建后，pair 元数据必须正确写入 pool
- ownership 移交后，工厂侧的 managed 注册必须被彻底清掉

### `FluxBuybackExecutorFuzz.t.sol`

覆盖 buyback 执行器最关键的 recipient 与清算语义：

- 零地址 recipient 走默认 treasury
- 非 treasury recipient 必须拒绝
- 成功 buyback 后 allowance / 残留资产清理
- treasury paused / executor paused 双阻断

当前重点验证的性质：

- 最终 recipient 只能落到 treasury
- 单次 buyback 成功后 executor 不应残留 `spendToken`
- 单次 buyback 成功后 executor 对 router 的 allowance 必须归零
- treasury 或 executor 任一处于暂停状态时都必须拒绝执行

### `FluxSwapFactoryFuzz.t.sol`

覆盖 Factory 的 pair 注册与 treasury setter 权限迁移：

- `createPair`
- 多个 pair 顺序创建后的 `allPairs`
- `setTreasurySetter`

当前重点验证的性质：

- `getPair[tokenA][tokenB]` 与 `getPair[tokenB][tokenA]` 必须同时指向同一个 pair
- pair 内部的 `token0 / token1` 必须始终是规范化排序后的地址
- 多个不同 pair 创建后，`allPairs` 长度和索引顺序必须稳定增长
- setter 迁移后，旧 setter 必须立即失权，新 setter 必须能继续设置 treasury

### `FluxSwapLPStakingPoolFuzz.t.sol`

覆盖 LP 质押池对底层 pair 元数据的绑定，以及继承自奖励池的单用户奖励流：

- 构造时读取 pair 元数据
- LP 质押后的单用户发奖与领取
- 错误 factory / 假 pair 的构造拒绝

当前重点验证的性质：

- `factory / lpToken / token0 / token1 / stakingToken` 必须与底层 pair 保持一致
- 真实 LP 质押后，单用户单批奖励的 `earned / claim` 必须与输入奖励一致
- 传入错误 factory 时必须回退 `INVALID_FACTORY`
- 传入未被 factory 注册的假 pair 时必须回退 `INVALID_PAIR`

### `FluxSwapRouterFeeOnTransferFuzz.t.sol`

覆盖 Router 的 fee-on-transfer supporting 路径：

- `swapExactTokensForTokensSupportingFeeOnTransferTokens`
- `swapExactETHForTokensSupportingFeeOnTransferTokens`
- `swapExactTokensForETHSupportingFeeOnTransferTokens`
- `token -> token -> token` 多跳 supporting 路径

当前重点验证的性质：

- fee-on-transfer 输入资产的协议费必须按真实净输入计费，而不是按名义输入计费
- 多跳路径里每一跳都必须只按该跳真实到达 Pair 的输入计费
- 当中间资产本身是 fee-on-transfer token 时，后一跳必须按跨 hop 后的净输入继续结算
- fee-on-transfer 输出资产的实际到账量必须等于 pair 输出再扣一次转账税后的结果
- ETH supporting 路径里的协议费必须记在真实输入资产 `WETH` 上
- `token -> ETH` supporting 路径不得误用 Router 里预存的 `WETH`

### `FluxRevenuePipelineStatefulFuzz.t.sol`

覆盖分红流水线的跨合约长序列：

- `RevenueDistributor -> Treasury -> MultiPoolManager -> Pool claim`
- 多轮 `executeBuybackAndDistribute` 中间穿插 claim
- `pause / unpause` 后恢复继续分发

当前重点验证的性质：

- 多轮 buyback / distribute / claim 后，全链路总账必须守恒
- pool 领取总额必须等于 pool 实际到账余额
- manager 剩余余额必须被 `pending + undistributed` 覆盖，允许最多 `1 wei` 级别残余 dust
- treasury 侧在整条流水线结束后只允许保留最多 `1 wei` 级别残余 dust

### `FluxManagedPoolLifecycleStatefulFuzz.t.sol`

覆盖 managed pool 生命周期里最容易漏掉的跨合约状态切换：

- `createSingleTokenPool / createLPPool`
- 首轮分发、`syncRewards` 与未分配奖励回收
- `setManagedPoolRewardConfiguration`
- `transferManagedPoolOwnership`
- 转移后的再次分发与回收边界
- `treasury pause / unpause` 下的恢复分发

当前重点验证的性质：

- managed pool 创建后，`singleTokenPools / lpTokenPools / managedPools / managedPoolStakingAsset / managedPoolIsLP` 必须彼此对齐
- 转移 LP managed pool 所有权后，工厂侧映射必须彻底清空，manager 的 `totalAllocPoint` 也必须同步扣减
- 已转移的 pool 不得再接受工厂侧 reward 配置或未分配奖励回收
- 第二轮仅剩单池活跃时，奖励只能继续流向仍受管理的 pool
- `pendingPoolRewards()` 视图值与真实 claim 值允许存在最多 `1 wei` 的 clamp 差异，但总账仍必须守恒
- treasury 暂停时 `distributeRewards` 必须整体拒绝，恢复后 single / LP pool 的记账仍需重新对齐

## 本轮新增补强点

这一轮除了原先的 Router、StakingRewards、MultiPoolManager 外，继续把 fuzz 补到了以下核心合约：

- `FluxSwapTreasury`
- `FluxRevenueDistributor`
- `FluxToken`
- `FluxSwapPair`
- `FluxPoolFactory`
- `FluxBuybackExecutor`
- `FluxSwapFactory`
- `FluxSwapLPStakingPool`
- `FluxSwapRouter` 的 fee-on-transfer supporting 分支
- `RevenueDistributor -> Treasury -> MultiPoolManager` 的跨合约状态流水线
- `managed pool` 的创建、配置、移交、回收与暂停恢复生命周期

这样当前 fuzz 已经不只覆盖 AMM 路由和奖励会计，也把金库、分红、代币权限、managed pool 工厂、buyback 执行链路都纳入了随机边界输入验证。

## 后续仍可继续补强的方向

如果后面还要继续加深 fuzz，优先级比较高的方向还有：

- Router fee-on-transfer 更复杂的多跳路径与 quote 偏差边界
- 更长操作序列的 stateful fuzz，例如 manager / treasury / distributor 串联多轮交替执行
- 更复杂的多合约状态机 fuzz，例如 factory / poolFactory / manager 串联创建与移交流程
