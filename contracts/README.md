# FluxSwap Contracts

这里是 FluxSwap 协议的合约、测试、部署模块与辅助脚本目录。当前仓库已经不是模板工程，而是一套围绕 `AMM + 金库治理 + 多池奖励 + 收入回购/分发 + 链下签名限价单结算` 搭建的完整合约系统。

## 1. 协议范围

当前合约侧主要覆盖以下业务模块：

| 模块 | 说明 | 主要合约 |
| --- | --- | --- |
| 协议主代币 | FLUX 发行、铸造权限、总量上限、销毁 | `FluxToken.sol` |
| AMM 交易系统 | 建池、加减流动性、代币兑换、ETH/WETH 路径 | `FluxSwapFactory.sol`、`FluxSwapPair.sol`、`FluxSwapRouter.sol` |
| 链下签名限价单 | Maker 链下签名，执行器链上触发，最终走 Router 结算 | `FluxSignedOrderSettlement.sol` |
| LP 份额系统 | LP Token 铸造、销毁、授权、Permit | `FluxSwapERC20.sol` |
| 金库治理 | 多签、守护者、白名单拨款、日限额、紧急控制 | `FluxSwapTreasury.sol` |
| 单池质押 | 单币或任意 ERC20 资产质押、注奖、领取、退出 | `FluxSwapStakingRewards.sol` |
| LP 质押池 | 面向 LP Token 的专用质押池 | `FluxSwapLPStakingPool.sol` |
| 多池奖励管理 | 多池权重配置、统一分发、池工厂接入 | `FluxMultiPoolManager.sol`、`FluxPoolFactory.sol` |
| 协议收入处理 | 收入拆分、回购、销毁、分发 | `FluxRevenueDistributor.sol`、`FluxBuybackExecutor.sol` |

## 2. 资产兼容性说明

当前协议只支持标准 ERC20 语义资产与 WETH 路径。

- 不支持 `fee-on-transfer`
- 不支持 `taxed token`
- 不支持转账时自动扣税、自动销毁、自动反射分红、自动重定向收款等会改变“实际到账数量”的代币模型

这项限制适用于：

- Router 直接交易路径
- 流动性添加与移除
- 限价单结算路径
- 测试、上线清单与运维接入要求

如果某个资产的 `transfer` / `transferFrom` 行为不满足标准 ERC20 语义，不应接入本协议。

## 3. 目录结构

| 路径 | 说明 |
| --- | --- |
| `contracts/` | 正式业务合约 |
| `interfaces/` | 对外接口定义 |
| `libraries/` | 公共库 |
| `scripts/` | 测试运行脚本、流程图脚本等辅助工具 |
| `test/` | 常规测试、权限治理、经济安全、Fuzz、Invariant、静态分析 |
| `ignition/` | Hardhat Ignition 部署模块与初始化脚本 |

## 4. 核心调用路径

### 4.1 建池与加流动性

`用户 -> Router -> Factory -> Pair`

- 用户通过 `FluxSwapRouter` 发起加流动性
- 若交易对不存在，`FluxSwapFactory` 创建 `FluxSwapPair`
- `Router` 将资产转入 `Pair`
- `Pair` 更新储备并铸造 LP

### 4.2 Swap 兑换

`用户 -> Router -> Pair(单跳或多跳) -> 接收方`

- `Router` 负责路径校验、报价与最小输出保护
- `Pair` 负责恒定乘积计算、储备更新与协议费处理
- 多跳兑换由 `Router` 串联多个 `Pair` 完成

### 4.3 链下签名限价单结算

`Maker -> SignedOrderSettlement -> Router -> Pair -> Recipient`

- Maker 在链下签名订单，不把完整订单状态预存到链上
- watcher / executor 在链下判断是否满足执行条件，再调用 `FluxSignedOrderSettlement.executeOrder`
- 结算合约在链上校验签名、nonce、过期时间、触发价与最小成交约束
- 限价单输入资产必须是 ERC20；若用户要卖出原生币，需要先包装成 `WETH`
- 如果输出语义是原生币，则由 Router 在最终结算阶段解包并发送 `ETH`

### 4.4 质押与奖励

`用户 -> StakingPool -> Manager(可选) -> StakingPool -> 用户`

- 用户直接与 `FluxSwapStakingRewards` 或 `FluxSwapLPStakingPool` 交互
- 池合约负责用户级奖励记账与发放
- 接入 `FluxMultiPoolManager` 的池，按需从 Manager 拉取待发奖励

### 4.5 协议收入回购与分发

`RevenueDistributor -> BuybackExecutor -> Treasury -> Router -> Treasury -> burn / distribute`

- `FluxRevenueDistributor` 负责收入拆分策略
- `FluxBuybackExecutor` 从 `Treasury` 拉取已批准额度并执行回购
- 回购得到的目标代币回流 `Treasury`
- 之后按策略销毁或分发至奖励体系

### 4.6 金库治理

`multisig / guardian / operator -> Treasury -> 各业务模块`

- `multisig` 负责时间锁治理与高权限配置
- `guardian` 负责紧急暂停
- `operator` 负责日常白名单拨款
- 业务模块通过 `Treasury` 的受控额度按需取用资产

## 5. 部署边界

### 5.1 需要项目方主动部署的核心合约

1. `FluxToken.sol`
2. `FluxSwapTreasury.sol`
3. `FluxSwapFactory.sol`
4. `FluxSwapRouter.sol`
5. `FluxSignedOrderSettlement.sol`
6. `FluxMultiPoolManager.sol`
7. `FluxPoolFactory.sol`
8. `FluxBuybackExecutor.sol`
9. `FluxRevenueDistributor.sol`

### 5.2 由系统自动创建的合约

| 合约 | 创建者 | 触发时机 |
| --- | --- | --- |
| `FluxSwapPair.sol` | `FluxSwapFactory` | 创建新交易对时 |
| `FluxSwapStakingRewards.sol` | `FluxPoolFactory` | 创建单币质押池时 |
| `FluxSwapLPStakingPool.sol` | `FluxPoolFactory` | 创建 LP 质押池时 |

### 5.3 不需要单独部署的基础类

- `FluxSwapERC20.sol`

该合约是 LP Token 基类，由 `FluxSwapPair` 继承使用，不作为独立入口部署。

## 6. 当前测试体系

测试已按类别拆分，方便区分功能正确性、安全约束与长期维护项：

| 大类 | 目录 | 说明 |
| --- | --- | --- |
| 常规测试 | `test/regular/unit` | 单合约职责、参数校验、边界行为 |
| 常规测试 | `test/regular/integration` | 跨合约真实业务流程 |
| 常规测试 | `test/regular/regression` | 历史高风险点回归 |
| 权限与治理 | `test/permissions-governance` | owner / operator / guardian / multisig / timelock 边界 |
| 经济安全 | `test/economic-security` | 回购、销毁、分发、对账、对抗场景 |
| Fuzz | `test/fuzz` | 随机输入与长序列扰动 |
| Invariant | `test/invariant` | 长序列下资产守恒与关键约束 |
| 静态分析 | `test/static-analysis` | 工具扫描与人工复核说明 |

更细的覆盖说明可继续查看：

- `test/README.md`
- `test/regular/unit/README.md`
- `test/regular/integration/README.md`
- `test/regular/regression/README.md`
- `test/permissions-governance/README.md`
- `test/economic-security/README.md`
- `test/fuzz/README.md`
- `test/invariant/README.md`
