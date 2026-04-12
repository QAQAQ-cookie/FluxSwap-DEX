# Invariant 测试说明

本目录用于存放基于 Foundry 的不变量测试（Invariant Tests）。

这类测试不会只验证单条固定调用路径，而是通过 `handler` 在多轮随机动作序列中持续调用合约，再反复检查“无论怎么调用，都必须始终成立”的底层约束。

## 当前运行方式

先进入项目的 `contracts` 目录，再执行：

```bash
npm run test:invariant
```

如果当前终端已经可以直接使用 `forge`，也可以执行：

```bash
forge test --match-path 'test/invariant/*.t.sol' -vv
```

如果只想跑单个 invariant 文件，可以使用：

```bash
forge test --match-path test/invariant/FluxSwapStakingRewardsInvariant.t.sol -vv
forge test --match-path test/invariant/FluxMultiPoolManagerInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapTreasuryInvariant.t.sol -vv
forge test --match-path test/invariant/FluxRevenueManagedPoolsInvariant.t.sol -vv
forge test --match-path test/invariant/FluxRevenueTreasuryManagerInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapAmmInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapAmmEthInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapFeeOnTransferInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapFeeOnTransferMultiHopInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapMixedAmmInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapFeeOnTransferWethMixedInvariant.t.sol -vv
forge test --match-path test/invariant/FluxSwapHybridAmmFeeOnTransferInvariant.t.sol -vv
```

说明：

- `scripts/run-invariant-tests.mjs` 会自动枚举 `test/invariant` 目录下的 `*.t.sol` 文件并逐个执行。
- 当当前 shell 能直接找到 `forge` 时，脚本会直接调用本机 `forge`。
- 在 Windows 下如果当前 shell 找不到 `forge`，脚本会回退到默认的 `WSL Ubuntu` 环境执行。
- 运行时只需要先切到你自己的 `contracts` 目录，不依赖写死的本地绝对路径。

## 当前覆盖概览

截至当前版本，`npm run test:invariant` 已覆盖：

- `12` 个 Foundry invariant 套件
- `64` 个不变量断言
- 覆盖 `FluxSwapStakingRewards`、`FluxMultiPoolManager`、`FluxSwapTreasury`、`FluxRevenueDistributor + FluxPoolFactory + FluxMultiPoolManager + managed pools` 联动链路
- 额外覆盖 `FluxSwapTreasury + FluxRevenueDistributor + FluxMultiPoolManager + pool claim` 的真实 revenue pipeline 联动链路
- 额外覆盖 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair` 的 token-token AMM 核心链路
- 额外覆盖 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH` 的 token-ETH / WETH AMM 核心链路
- 额外覆盖 `fee-on-transfer supporting` 路径下的净输入计费、净到账和 Router 预存 WETH 隔离语义
- 额外覆盖 `双 fee token / 四跳 supporting` 路径下“逐跳按真实净输入计费”的长期随机序列约束
- 额外覆盖 `共享 tokenA 的 token-token + token-ETH` 双 Pair 混排路径下的 Router 资产隔离、协议费累计与总量守恒
- 额外覆盖 `feeToken-quote + feeToken-WETH` 双 Pair 混排、`quote -> fee` 净到账边界与多 actor 汇总对账
- 额外覆盖 `普通 AMM + fee-on-transfer supporting + quote 桥接多跳 + 多 LP / 双 Pair 流动性迁移` 混排下的跨 Pair 协议费累计、净到账边界、LP 份额快照与总量闭合

## 已覆盖套件

### `FluxSwapStakingRewardsInvariant.t.sol`

当前通过 `handler` 对以下动作做随机序列调用：

- `stake`
- `withdraw`
- `getReward`
- `exit`
- `notifyRewardAmount`

当前锁定的核心不变量：

- `rewardReserve` 必须始终等于合约内 `rewardToken` 余额
- `pendingUserRewards + queuedRewards` 不能突破真实奖励储备
- 合约内 `stakingToken` 余额必须始终等于 `totalStaked`
- 已注入奖励总量必须由“池内剩余奖励 + 已支付给用户奖励”完整解释

### `FluxMultiPoolManagerInvariant.t.sol`

当前通过最小化 `MockTreasury + MockPool` 环境，对以下 manager 动作做随机序列调用：

- `distributeRewards`
- `claimPoolRewards`
- `setPool`
- `deactivatePool`
- `pause`
- `unpause`

当前锁定的核心不变量：

- manager 持有的奖励余额必须始终覆盖 `totalPendingRewards + undistributedRewards`
- `totalAllocPoint` 必须始终等于全部 active pool 的 `allocPoint` 之和
- inactive pool 的 `rewardDebt` 必须归零
- 已注入奖励总量必须由“manager 剩余余额 + pools 已领取奖励”完整解释

### `FluxSwapTreasuryInvariant.t.sol`

当前通过带参考模型的 `handler`，对以下 treasury 动作做随机序列调用：

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
- `pause`
- `unpause`
- `advanceTime`

当前锁定的核心不变量：

- `spendToken` 总账必须始终守恒，只能在 `treasury / recipient / spender` 之间流转
- `burnToken` 总账必须始终闭合，销毁量只能来自授权 `burn` 路径
- `approvedSpendRemaining` 必须与参考模型一致
- `spentToday / lastSpendDay` 必须与参考模型一致

### `FluxRevenueManagedPoolsInvariant.t.sol`

当前通过真实的 `FluxRevenueDistributor + FluxMultiPoolManager + FluxPoolFactory + managed pools` 组合，对以下跨合约动作做随机序列调用：

- `executeBuybackAndDistribute`
- `distributeTreasuryRewards`
- `syncRewards`
- `recoverManagedPoolUnallocatedRewards`
- `toggleTreasuryPause`
- `toggleDistributorPause`
- `recreateLpPool`

当前锁定的核心不变量：

- 真实 managed pool 收益链路中的总 inflow 必须始终由 `burned + treasury + manager + managed pools + recipient` 完整解释
- manager 余额必须始终覆盖 `totalPendingRewards + undistributedRewards`
- LP managed pool 重建后，旧池必须退出 managed 注册，`pair -> current pool` 映射必须保持正确
- LP 重建后旧池的 `pending` 必须冻结，后续奖励不能重新流回旧池

### `FluxRevenueTreasuryManagerInvariant.t.sol`

当前通过真实的 `FluxSwapTreasury + FluxRevenueDistributor + FluxMultiPoolManager + pools` 组合，对以下 revenue pipeline 动作做随机序列调用：

- `executeBuybackAndDistribute`
- `distributeTreasuryRewards`
- `claimPoolRewards`
- `toggleTreasuryPause`
- `toggleManagerPause`
- `toggleDistributorPause`
- `updateRewardTokenDailyCap`
- `advanceTime`

当前锁定的核心不变量：

- 真实 revenue pipeline 的总 inflow 必须始终由 `burned + treasury + manager + pools` 完整解释
- pools 的累计 claim 必须始终等于 pools 实际到账余额
- manager 余额必须始终覆盖 `totalPendingRewards + undistributedRewards`
- treasury 对 `distributor / manager` 的 `approvedSpendRemaining` 必须与真实成功支出严格一致
- rewardToken 的 `spentToday / lastSpendDay` 必须与参考模型一致，跨天后也不能串账

### `FluxSwapAmmInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair` 组合，对以下 token-token AMM 动作做随机序列调用：

- `addLiquidity`
- `swapExactTokensForTokens` (`tokenA -> tokenB`)
- `swapExactTokensForTokens` (`tokenB -> tokenA`)
- `removeLiquidity`

当前锁定的核心不变量：

- Pair 记录的 `reserve0 / reserve1` 必须始终等于 Pair 当前真实 token 余额
- Router 不得残留底层 token 或 LP token
- Treasury 的协议费余额必须始终等于成功 swap 输入额按 `5 / 10000` 计提后的累计值
- 两种底层 token 的总量必须能被已跟踪账户 + Pair + Treasury + Router 完整解释
- LP 总供应量必须能被 `lpA + lpB + address(0)` 完整解释，不能凭空残留在别处

### `FluxSwapAmmEthInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH` 组合，对以下 token-ETH / WETH AMM 动作做随机序列调用：

- `addLiquidityETH`
- `swapExactETHForTokens`
- `swapExactTokensForETH`
- `removeLiquidityETH`

当前锁定的核心不变量：

- Pair 记录的 `reserve0 / reserve1` 必须始终等于 Pair 当前真实 `token / WETH` 余额
- Router 不得残留 `ETH / WETH / token / LP token`
- Treasury 的协议费余额必须始终等于成功 swap 输入额按 `5 / 10000` 计提后的累计值
- 底层 token 总量必须能被已跟踪账户 + Pair + Treasury + Router 完整解释
- `WETH.totalSupply()` 只能由 `Pair + Treasury + Router` 中的 WETH 余额解释
- LP 总供应量必须能被 `lpA + lpB + address(0)` 完整解释

### `FluxSwapFeeOnTransferInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH + MockFeeOnTransferERC20` 组合，对以下 fee-on-transfer supporting 路径做随机序列调用：

- `swapExactTokensForTokensSupportingFeeOnTransferTokens` (`fee -> quote`)
- `swapExactTokensForTokensSupportingFeeOnTransferTokens` 的 `amountOutMin` 边界成功 / 失败语义
- `swapExactETHForTokensSupportingFeeOnTransferTokens` (`ETH -> fee`)
- `swapExactTokensForETHSupportingFeeOnTransferTokens` (`fee -> ETH`)

当前锁定的核心不变量：

- 两条 supporting Pair 的 `reserve` 必须始终等于当前真实余额
- treasury 的 `feeToken / WETH` 协议费余额必须与“按真实净输入计费”后的累计值一致
- `quote / fee / ETH` 三类 recipient 最终到账结果必须与 supporting 路径的净输入 / 净到账语义一致
- Router 不得残留 `feeToken / quoteToken / LP token`，且预存 `WETH` 不能被 `token -> ETH` supporting 路径误用
- `feeToken / quoteToken` 总量必须能被已跟踪账户 + Pair + Treasury + Router 完整解释
- `WETH.totalSupply()` 只能由 `feeWethPair + Treasury + Router` 中的 WETH 余额解释

### `FluxSwapFeeOnTransferMultiHopInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + 双 fee-on-transfer token` 组合，对以下四跳 supporting 路径做随机序列调用：

- `swapExactTokensForTokensSupportingFeeOnTransferTokens` (`feeTokenOne -> midTokenOne -> feeTokenTwo -> midTokenTwo -> outToken`)
- 同一路径下 `amountOutMin` 的精确边界成功 / 失败语义

当前锁定的核心不变量：

- 四条 supporting Pair 的 `reserve` 必须始终等于当前真实余额
- treasury 的 `feeTokenOne / midTokenOne / feeTokenTwo / midTokenTwo` 协议费余额必须与“每一跳都按真实净输入计费”后的累计值一致
- 最终 recipient 的 `outToken` 到账必须与四跳 supporting 路径模型一致
- Router 不得残留 `feeTokenOne / midTokenOne / feeTokenTwo / midTokenTwo / outToken / LP token / ETH`
- 五种底层 token 的总量必须都能被已跟踪账户 + Pair + Treasury + Router 完整解释

### `FluxSwapMixedAmmInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH` 组合，把共享同一个 `tokenA` 的两条主路径放进同一套随机序列：

- `tokenA <-> tokenB` 的 token-token Pair
- `tokenA <-> WETH` 的 token-ETH / WETH Pair
- 同一 Router 下的 `addLiquidity / addLiquidityETH / 双向 swap / removeLiquidity / removeLiquidityETH` 混排调用

当前锁定的核心不变量：

- 共享 `tokenA` 的两个 Pair 记录的 `reserve` 都必须始终等于当前真实余额
- Router 在 token-token 与 token-ETH 两条主路径混排时，不得残留 `ETH / WETH / tokenA / tokenB / LP token`
- treasury 的 `tokenA / tokenB / WETH` 协议费余额必须与两条路径成功 swap 输入额的累计值一致
- `tokenA / tokenB` 的总量必须都能被已跟踪账户 + 两个 Pair + Treasury + Router 完整解释
- `WETH.totalSupply()` 只能由 `tokenA-WETH Pair + Treasury + Router` 中的余额解释
- 两个 Pair 的 LP 总供应量都必须能被 LP 持仓 + `address(0)` 完整解释

### `FluxSwapFeeOnTransferWethMixedInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + WETH + MockFeeOnTransferERC20` 组合，把共享同一个 `feeToken` 的两条 supporting 主路径放进同一套随机序列：

- `feeToken <-> quoteToken` 的 supporting Pair
- `feeToken <-> WETH` 的 supporting Pair
- 多个 trader / recipient 下的 `fee -> quote / quote -> fee / ETH -> fee / fee -> ETH` 混排调用
- `quote -> fee` 路径下 `amountOutMin` 按最终净到账量结算的边界成功 / 失败语义

当前锁定的核心不变量：

- 两条 supporting Pair 的 `reserve` 都必须始终等于当前真实余额
- treasury 的 `feeToken / quoteToken / WETH` 协议费余额必须与混合路径成功输入额的累计值一致
- 三类 recipient 的最终到账总和必须与净输入 / 净到账模型一致
- Router 不得残留 `feeToken / quoteToken / LP token / ETH`，且预存 `WETH` 不能被 `fee -> ETH` 路径误用
- `feeToken / quoteToken` 的总量必须都能被已跟踪账户 + Pair + Treasury + Router 完整解释
- `WETH.totalSupply()` 只能由 `feeToken-WETH Pair + Treasury + Router` 中的余额解释

### `FluxSwapHybridAmmFeeOnTransferInvariant.t.sol`

当前通过真实的 `FluxSwapFactory + FluxSwapRouter + FluxSwapPair + MockFeeOnTransferERC20` 组合，把普通 AMM、supporting AMM、共享 `quoteToken` 的多跳桥接，以及多个 LP actor 在两条 Pair 上的流动性增减一起放进同一套随机序列：

- `feeToken <-> quoteToken` 的 supporting Pair
- `baseToken <-> quoteToken` 的普通 token-token Pair
- `lpA / lpB / lpC` 在 `feeToken <-> quoteToken` 上的 `addLiquidity / removeLiquidity`
- `lpA / lpB / lpC` 在 `baseToken <-> quoteToken` 上的 `addLiquidity / removeLiquidity`
- `fee -> quote`
- `quote -> fee`
- `base -> quote`
- `quote -> base`
- `fee -> quote -> base`
- `base -> quote -> fee` 路径下 `amountOutMin` 按最终净到账量结算的边界成功 / 失败语义

当前锁定的核心不变量：

- supporting Pair 与普通 Pair 的 `reserve` 都必须始终等于当前真实余额
- treasury 的 `feeToken / quoteToken / baseToken` 协议费余额必须与混合路径成功输入额的累计值一致
- `quote / base / fee` 三类 recipient 的最终到账总和必须与单跳 / 多跳模型一致
- Router 不得残留 `feeToken / quoteToken / baseToken / LP token`
- 三种底层 token 的总量必须都能被已跟踪账户 + 两个 Pair + Treasury + Router 完整解释
- 两个 Pair 的 LP 总供应量都必须能被 `lpA / lpB / lpC` 持仓 + `address(0)` 完整解释
- `lpA / lpB / lpC` 在两个 Pair 上的 LP 持仓，只能由 add/remove liquidity 的真实铸造 / 销毁数量驱动变化，不能在 swap 或其他路径里漂移
- `lpA / lpB / lpC` 的 `feeToken / quoteToken / baseToken` 余额，必须能被 addLiquidity 的实际入池金额与 removeLiquidity 的真实净回款精确解释，不能在 swap 路径里被动漂移
- `feeQuotePair` 与 `baseQuotePair` 对 LP actor 底层余额的影响必须保持隔离：`feeToken` 只能由 feeQuote 流量解释，`baseToken` 只能由 baseQuote 流量解释，`quoteToken` 必须能被两个 Pair 的净流量精确拼回

## 当前测试价值

这一层 invariant 已经不只是“看余额对不对”，而是在持续随机动作下验证：

- 资金守恒是否成立
- 奖励账本是否持续闭合
- 工厂映射与 managed pool 注册关系是否会漂移
- pause / recover / recreate 等管理动作插入随机序列后，系统是否仍保持正确约束

## 后续高优先方向

当前 `managed pools`、`Treasury -> Distributor -> Manager`、AMM 主路径、共享 token 的双 Pair 混排、fee-on-transfer supporting 主路径、双 fee token 四跳路径，以及“普通 AMM + supporting + 多跳桥接 + 多 LP 流动性迁移”混合路径都已经纳入 invariant 覆盖，连同 LP 现金流精确记账与跨 Pair 隔离约束也已经补齐。接下来更值得继续补的是：

- 把现有部分更长的 stateful fuzz 再上提成更标准的 `Handler + targetContract()` 风格，减少“固定序列”测试和“不变量”测试之间的断层
- 如果还要继续加深，可补更细的经济约束，例如 LP 在极端多轮 add/remove 后的净值归因、以及更多跨合约随机治理动作插入下的长期资金隔离
