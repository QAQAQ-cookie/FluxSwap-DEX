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
forge test --match-path test/fuzz/FluxSwapTreasuryGovernanceFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxAmmLifecycleStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxAmmEthLifecycleStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxManagedPoolRecreationStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxRevenueManagedPoolsStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxRevenueTreasuryManagerLongSequenceFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxHybridAmmFeeOnTransferStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxMultiHopAmmStatefulFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSwapRouterExceptionFuzz.t.sol -vv
forge test --match-path test/fuzz/FluxSignedOrderSettlementFuzz.t.sol -vv
```

说明：

- `scripts/run-fuzz-tests.mjs` 会自动枚举 `test/fuzz` 下的 `*.t.sol` 文件逐个执行。
- 当 `forge` 已加入当前 shell 的 `PATH` 时，脚本会直接调用本机 `forge`。
- 在 Windows 下如果当前 shell 找不到 `forge`，脚本会尝试走默认 `WSL Ubuntu` 环境执行。
- 不需要写死任何本地绝对路径，只要先切到你自己的 `contracts` 目录即可。

## 当前覆盖范围

截至当前版本，`npm run test:fuzz` 已覆盖：

- `26` 个 Foundry fuzz / stateful fuzz 套件
- `85` 个测试用例
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

### `FluxSwapRouterExceptionFuzz.t.sol`

覆盖 Router 的集中式异常路径 fuzz：

- `swapExactTokensForTokens` 的 `deadline` 过期回退
- `swapExactTokensForTokens` 的 `amountOutMin` 过高回退
- `swapTokensForExactTokens` 的 `amountInMax` 过低回退
- `swapExactETHForTokens` 的错误 `WETH` 起点路径回退
- `swapExactTokensForTokensSupportingFeeOnTransferTokens` 的非法短路径回退
- `swapExactTokensForTokens` 在 pair 不存在时回退
- `addLiquidity` 的最小接收量约束回退
- `removeLiquidity` 的最小返还量约束回退
- `swapETHForExactTokens` 在 `msg.value` 低于 quote 输入时回退

当前重点验证的性质：

- 每类非法输入都必须命中预期 `revert`，而不是错误成功
- 回退后 trader / recipient / treasury / router 的关键余额不能被污染
- ETH 路径失败后 Router 不得残留 `WETH`
- LP 最小值约束失败后，用户 LP 与底层资产都必须保持原状

### `FluxSignedOrderSettlementFuzz.t.sol`

覆盖签名订单结算模块在随机金额、随机 nonce 边界下的最小状态正确性：

- `executeOrder` 成功后必须同时写入 `orderExecuted` 与 `invalidatedNonce`
- `cancelUpTo` 必须使低于阈值的旧 nonce 永久失效
- `cancelOrder` 后同一订单后续执行必须被拒绝

当前重点验证的性质：

- 成交成功后 settlement 合约不能留下 maker 的输入资产残留
- 单个订单一旦成交或取消，后续不得再被重复执行
- 批量 nonce 失效只会向前收紧，不会放松已有约束

### `FluxAmmLifecycleStatefulFuzz.t.sol`

覆盖 token-token AMM 在多步连续状态下的跨合约生命周期：

- 首个 LP 建池
- 第二个 LP 按已有价格继续加池
- `tokenA -> tokenB` exact-input swap
- `tokenB -> tokenA` exact-input swap
- 第二个 LP 部分撤池

当前重点验证的性质：

- 二次加池时 router 只能消耗价格对齐后的最优数量，不得超出用户给定的 `desired`
- 两个方向的 swap 都必须按输入资产精确给 treasury 沉淀协议费
- 多步操作结束后，pair 储备必须继续与真实余额同步
- 整条 token-token 生命周期里，`tokenA / tokenB` 总量都必须能被完整解释为“用户余额 + pair 余额 + treasury 余额”
- router 在整条链路结束后不得残留 `tokenA / tokenB`

### `FluxAmmEthLifecycleStatefulFuzz.t.sol`

覆盖 token-ETH AMM 在多步连续状态下的跨合约生命周期：

- 首个 LP 建池
- 第二个 LP 再次 `addLiquidityETH`，并故意多付 ETH 触发 refund
- `ETH -> token` exact-input swap
- `token -> ETH` exact-input swap
- 第二个 LP 部分 `removeLiquidityETH`

当前重点验证的性质：

- 第二个 LP 的 `addLiquidityETH` 只能消耗价格对齐后的最优 ETH 数量，超付部分必须原路退回
- `ETH -> token` 路径必须给 treasury 沉淀精确的 `WETH` 协议费，`token -> ETH` 路径必须给 treasury 沉淀精确的 token 协议费
- 多步操作结束后，pair 储备必须继续与真实 `token / WETH` 余额同步
- router 在整条链路结束后不得残留 `ETH / WETH / token`
- WETH 的 `totalSupply` 最终只能由“pair 内剩余 WETH + treasury 持有 WETH”解释

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

### `FluxSwapTreasuryGovernanceFuzz.t.sol`

覆盖 treasury 里 timelock 治理执行与运营支出联动的另一组高风险路径：

- `executeSetAllowedToken`
- `executeSetAllowedRecipient`
- `executeSetDailySpendCap`
- `executeSetMinDelay`
- `executeSetOperator`
- `allocate`
- `allocateETH`
- `executeEmergencyWithdraw`
- `executeEmergencyWithdrawETH`

当前重点验证的性质：

- 只有 timelock 生效后的 allowlist 与 cap 配置才能真正放行 token / ETH 支出
- token cap 与 native cap 必须各自独立累计，`spentToday[token]` 与 `spentToday[address(0)]` 不得串账
- `minDelay` 更新后，后续新操作必须立即遵守新的最小调度延迟
- operator 轮换后，旧 operator 必须立即失权，新 operator 必须可以继续执行 allocate
- treasury 暂停后普通 `allocate / allocateETH` 必须继续被拦截，但到期的 `emergency withdraw` 仍应可执行

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
- `token(fee) -> token -> token(fee) -> token -> token` 四跳双 fee token supporting 路径
- `amountOutMin` 按最终 recipient 实际净到账量结算的边界成功 / 失败路径
- 普通 `swapTokensForExactTokens` 在“输入代币带税”与“中间桥接代币带税”两类 exact-output 误用场景下的失败边界

当前重点验证的性质：

- fee-on-transfer 输入资产的协议费必须按真实净输入计费，而不是按名义输入计费
- 多跳路径里每一跳都必须只按该跳真实到达 Pair 的输入计费
- 当中间资产本身是 fee-on-transfer token 时，后一跳必须按跨 hop 后的净输入继续结算
- 当路径里出现两个 fee-on-transfer token 且总 hop 数增加到四跳时，每一跳 treasury 仍必须只拿到该 hop 真实输入资产对应的协议费
- fee-on-transfer 输出资产的实际到账量必须等于 pair 输出再扣一次转账税后的结果
- supporting 路径里的 `amountOutMin` 必须对齐 recipient 的最终净到账量，等于边界值时应成功，超过 `1 wei` 时必须回退
- ETH supporting 路径里的协议费必须记在真实输入资产 `WETH` 上
- `token -> ETH` supporting 路径不得误用 Router 里预存的 `WETH`
- 普通 `exact-output` 路径并不支持 fee-on-transfer 语义；当某一跳的真实税后输入已经明显低于 `getAmountsIn` 推导出来的名义输入上界时，交易必须整体回退，且不能留下部分到账或 treasury 脏状态

### `FluxHybridAmmFeeOnTransferStatefulFuzz.t.sol`

覆盖“普通 AMM + fee-on-transfer supporting + 多 LP + 双 Pair + 多跳桥接”在有限长序列下的混合状态机：

- `feeToken <-> quoteToken` supporting Pair 上的多轮 `addLiquidity / removeLiquidity`
- `baseToken <-> quoteToken` 普通 Pair 上的多轮 `addLiquidity / removeLiquidity`
- `fee -> quote`
- `quote -> fee`
- `fee -> quote -> base`
- `base -> quote -> fee` 且 `amountOutMin` 按最终净到账边界结算
- 上述路径在同一序列里交错执行

当前重点验证的性质：

- 每一步之后两个 Pair 的 `reserve` 都必须继续和真实余额同步
- treasury 的 `feeToken / quoteToken / baseToken` 协议费累计必须继续与真实输入路径一致
- `quote / base / fee` 三类 recipient 的累计到账必须继续对齐模型
- Router 不得残留 `feeToken / quoteToken / baseToken / LP token`
- 多轮 `add/remove liquidity` 之后，`lpA / lpB / lpC` 的 LP 份额与底层余额必须仍能被模型精确解释
- `feeQuotePair` 与 `baseQuotePair` 对 LP actor 底层余额的影响必须保持隔离，不能在连续换路和流动性迁移后串账
- 在经历多轮 liquidity churn 后，`base -> quote -> fee` 的 `amountOutMin` 仍然只能按最终净到账放行
- 对极小 LP 份额的 churn，fuzz 入口会主动跳过“理论上 burn 结果某一侧为 0”的无效撤池步，避免把 Pair 设计上的最小 burn 限制误判成业务失败

### `FluxMultiHopAmmStatefulFuzz.t.sol`

覆盖“纯 AMM 双 Pair 多跳桥接”在有限长序列下的状态机：
- `baseToken <-> quoteToken` Pair 上的多轮 `addLiquidity / removeLiquidity`
- `quoteToken <-> outToken` Pair 上的多轮 `addLiquidity / removeLiquidity`
- `base -> quote`
- `out -> quote`
- `quote -> base`
- `quote -> out`
- `base -> quote -> out`
- `out -> quote -> base`，并把 `amountOutMin` 边界放进 churn 后的真实状态里验证
- `base -> quote -> out` 的 `swapTokensForExactTokens`
- `out -> quote -> base` 的 `swapTokensForExactTokens`，并验证 `amountInMax` 少 `1 wei` 时必须回退

当前重点验证的性质：
- 双 Pair 的 `reserve` 必须在每一步之后继续和真实余额同步
- 单跳与双跳路径上的协议费都必须精确沉淀到 treasury，其中桥接资产 `quoteToken` 也要按第二跳真实输入计费
- `base / quote / out` 三类 recipient 的累计到账必须持续和 Router quote 对齐
- 多跳 `exact-output` 路径必须严格遵守 `getAmountsIn` 推导出的输入上界，失败回退后成功执行仍要保持会计连续
- `lpA / lpB / lpC` 在 `baseQuotePair` 与 `quoteOutPair` 上的 LP 份额必须分别独立记账，连续 churn 后不能串账
- Router 不得残留 `baseToken / quoteToken / outToken`
- 三资产总量都必须始终能够被完整解释为“LP / trader / recipient / pair / treasury / router”六类地址余额之和
- 对极小 LP 份额导致某一侧 burn 结果为 0 的撤池步，fuzz 会在入口处过滤掉该无效序列，避免把 Pair 的最小 burn 约束当成多跳会计错误

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

### `FluxRevenueTreasuryManagerStatefulFuzz.t.sol`

覆盖真实 `Treasury -> RevenueDistributor -> MultiPoolManager -> Pool claim` 的长序列状态机：

- timelock 批准 `manager / distributor` 作为 treasury approved spender
- 首轮 `buybackAndDistribute`
- `treasury pause / unpause`
- 同一天 direct treasury reward 因 daily cap 超限失败
- 跨天后 cap 重置，再次 direct treasury reward 成功
- `manager pause / unpause`
- 第二轮 `buybackAndDistribute`

当前重点验证的性质：

- distributor 的 burn 与 manager 的 pull 都必须精确消耗 treasury 的 approved allowance，不得串账
- treasury 的 `dailySpendCap` 必须跨 spender 累计生效，并在跨天后正确重置
- `treasury paused` 和 `manager paused` 插入到长链路中时，失败操作不能污染后续总账
- 恢复执行后，全链路仍需满足 `inflow = burned + treasury/manager/pool 持仓`

### `FluxRevenueTreasuryManagerLongSequenceFuzz.t.sol`

覆盖真实 `Treasury -> RevenueDistributor -> MultiPoolManager -> Pool claim` 的 8 步混合随机序列：

- `buybackAndDistribute`
- `direct treasury reward`
- `treasury pause / unpause`
- `manager pause / unpause`
- `distributor pause / unpause`
- `pool0 / pool1 claim`
- `warp` 推进时间

当前重点验证的性质：

- `buyback / direct reward / claim / pause` 在随机顺序下交错执行时，全链路总账仍必须持续守恒
- 失败的分发操作只能整笔回退，或者把资金留在 treasury，不能污染 `approvedSpendRemaining`
- `approvedSpendRemaining[distributor]` 与 `approvedSpendRemaining[manager]` 必须分别按实际 burn / distribute 精确递减
- 任意中间态下 `manager` 实际余额都必须覆盖 `totalPendingRewards + undistributedRewards`
- 序列结束并 `syncAllPools` 后，manager 剩余余额必须重新收敛到 `pending + undistributed + 最多 1 wei dust`

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

### `FluxManagedPoolRecreationStatefulFuzz.t.sol`

覆盖 managed pool 在 ownership 移交后的“同资产重建新池”状态机：

- 旧 `single pool` 移交后，对同一 `stakingToken` 重建新的 managed single pool
- 旧 `LP pool` 移交后，对同一 `lpToken / pair` 重建新的 managed LP pool
- 重建后的新池继续参与后续奖励分发与未分配奖励回收

当前重点验证的性质：

- 旧池移交后，`singleTokenPools / lpTokenPools / managedPools / managedPoolStakingAsset / managedPoolIsLP` 必须先被彻底清空
- 同一 `stakingToken` 或 `lpToken` 上重建新池后，工厂映射必须立即切到新池
- manager 的 `totalAllocPoint` 必须先扣掉旧池，再加上新池，不能出现旧新池重复计权
- 后续新一轮奖励只能继续流向新池，旧池的 `pendingPoolRewards` 不得再增长
- 新池 `syncRewards + recoverManagedPoolUnallocatedRewards` 后，实际回收金额必须与真实 claim 值对齐，允许最多 `1 wei` 视图误差

### `FluxRevenueManagedPoolsStatefulFuzz.t.sol`

覆盖 `RevenueDistributor -> Treasury -> MultiPoolManager -> 真实 managed pools` 的跨合约状态机：

- `buybackAndDistribute` 进入真实 `single pool / LP pool`
- `distributeTreasuryRewards` 进入真实 `single pool / LP pool`
- 无 staker 状态下通过 `pool.syncRewards + recoverManagedPoolUnallocatedRewards` 结清奖励
- distributor 路径下旧 LP pool 移交后，同一 pair 上重建新的 managed LP pool
- `buyback / direct reward / sync / recover / treasury pause / LP 重建` 的 8 步混排长序列

当前重点验证的性质：

- buyback round 与 direct treasury round 的总 inflow，最终必须由 `burned + treasury/manager 残余 + recipient 回收` 完整解释
- 真实 `single pool / LP pool` 在无 staker 场景下，`sync + recover` 后必须能把奖励完整回收，不留下脏的 `rewardReserve`
- distributor 路径下旧 LP pool 移交后，后续奖励只能继续流向新建 LP pool，旧池的 `pendingPoolRewards` 不得再增长
- 长序列混排下，失败的分发操作只能把资金留在 treasury 或整笔回退，不能破坏全链路守恒
- manager 侧最终仍只能保留最多 `1 wei` 级别的未解释 dust

### `FluxFactoryPoolManagerStatefulFuzz.t.sol`

覆盖 `FluxSwapFactory -> FluxPoolFactory -> FluxMultiPoolManager` 的创建、移交、重建与激活切换状态机：

- 创建 active / inactive 混合的 single / LP pools
- 旧 `single pool / LP pool` ownership 移交并退出 managed 注册
- 对同一 `stakingToken / LP token` 重建新的 managed pool
- owner 侧对 dormant pool 执行 `setPool(..., true)` 激活
- owner 侧对 survivor LP pool 执行 `setPool(..., false)` 停用
- 第二轮奖励只发给仍 active 且 managed 的新状态集合

当前重点验证的性质：

- 旧池移交后，`singleTokenPools / lpTokenPools / managedPools / managedPoolStakingAsset / managedPoolIsLP` 必须被清空
- 同资产重建新池后，工厂映射必须立即切到新池，`poolLength()` 也必须继续单调增长
- 被移交池与被停用池在第二轮奖励后 `pendingPoolRewards` 不得继续增长
- manager 的 `totalAllocPoint` 必须和“当前仍 active 的 managed pools”严格一致
- 第二轮奖励回收后，总 inflow 必须仍然能由 `manager 持仓 + recipient 回收` 完整解释，允许最多 `3 wei` 级别残余 dust

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
- `FluxSwapRouter` 的集中式异常路径与失败边界
- `普通 AMM + fee-on-transfer + 多 LP / 双 Pair / 多跳桥接` 的混合状态机
- `纯 AMM + 双 Pair + 多 LP + 双向多跳桥接` 的状态机
- `RevenueDistributor -> Treasury -> MultiPoolManager` 的跨合约状态流水线
- `managed pool` 的创建、配置、移交、回收与暂停恢复生命周期
- treasury 的 timelock 配置变更、operator 轮换、token / ETH allocate 与紧急提现闭环
- token-token AMM 的建池、续池、双向 swap、部分撤池与协议费沉淀生命周期
- token-ETH AMM 的建池、续池、ETH refund、双向 swap、部分撤池与 WETH/token 协议费沉淀生命周期
- managed pool 在 ownership 移交后按同一 staking asset / LP token 重建新池的映射与奖励隔离生命周期
- 分红分发器通过真实 managed pools 落地后的 buyback/direct-reward/conservation/recreation 跨合约生命周期
- 真实 managed pools 在 `buyback / direct reward / sync / recover / treasury pause / LP 重建` 混排长序列下的状态机会计验证
- 真实 treasury 参与下的 approved spender、daily cap、跨天重置、pause/unpause 与 revenue pipeline 交错执行长序列
- 真实 treasury / distributor / manager / claim 在 8 步随机 selector 序列下的长状态机会计验证
- factory / poolFactory / manager 串联的“创建 -> 移交 -> 同资产重建 -> 激活/停用 -> 再分发”多合约状态机

这样当前 fuzz 已经不只覆盖 AMM 路由和奖励会计，也把金库、分红、代币权限、managed pool 工厂、buyback 执行链路都纳入了随机边界输入验证。

## 当前状态

截至当前代码基线，`test/fuzz` 目录下的 `25` 个 fuzz / stateful fuzz 套件已经重新完成一轮全量执行，`npm run test:fuzz` 可稳定跑通。

本轮额外收口的边界包括：

- 多轮 liquidity churn 下，极小 LP 份额触发 `INSUFFICIENT_LIQUIDITY_BURNED` 的无效撤池序列过滤
- fee-on-transfer 资产被误用于普通 `exact-output` 路径时，对“确实发生税后输入不足”的反例判定口径收紧
- 链下签名订单在随机数量与批量 nonce 收口场景下的最小链上状态验证

## 后续仍可继续补强的方向

如果后面还要继续加深 fuzz，优先级比较高的方向还有：

- 从当前“固定 8 步 selector 序列”继续升级到 Foundry `Handler + targetContract()` 风格的 invariant/fuzz 混合 harness
