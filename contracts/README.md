# FluxSwap Contracts

本目录承载 FluxSwap 协议的合约、测试、部署模块、初始化脚本与静态分析配置。当前实现已经不是模板项目，而是一套围绕 `AMM + Treasury 治理 + 多池奖励 + 协议收入回购/销毁/分发` 组织起来的完整合约系统。

## 1. 项目定位

当前协议主要覆盖 9 个业务模块：

| 模块 | 说明 | 主要合约 |
| --- | --- | --- |
| 协议主代币 | 主币发行、总量上限、销毁、铸币权限控制 | `FluxToken.sol` |
| AMM 交易系统 | 建池、交易对、加减流动性、代币兑换、ETH/WETH 路径 | `FluxSwapFactory.sol`、`FluxSwapPair.sol`、`FluxSwapRouter.sol` |
| 签名订单结算 | 链下签名限价单、链上最小状态验证、到价后通过 AMM 结算，原生币输入在链上按 WETH 参与 | `FluxSignedOrderSettlement.sol` |
| LP 份额系统 | LP Token 铸造、销毁、授权、Permit | `FluxSwapERC20.sol` |
| 金库治理系统 | 多签治理、时间锁、白名单拨款、日限额、受控支出、紧急提款 | `FluxSwapTreasury.sol` |
| 单池质押奖励 | 单币或任意资产质押、奖励注入、领取、退出 | `FluxSwapStakingRewards.sol` |
| LP 质押池 | 面向 LP Token 的专用质押池 | `FluxSwapLPStakingPool.sol` |
| 多池奖励管理 | 多池权重配置、统一分发奖励、池工厂接入 | `FluxMultiPoolManager.sol`、`FluxPoolFactory.sol` |
| 协议收入处理 | 协议收入回购、销毁、奖励分发 | `FluxRevenueDistributor.sol`、`FluxBuybackExecutor.sol` |

## 2. 目录结构

| 路径 | 说明 |
| --- | --- |
| `contracts/` | 正式业务合约 |
| `interfaces/` | 对外接口定义 |
| `libraries/` | 公共库 |
| `scripts/` | 测试运行脚本与流程图脚本 |
| `test/` | 常规测试、权限治理、经济安全、Fuzz、Invariant、静态分析 |
| `ignition/` | Hardhat Ignition 部署模块、部署后初始化脚本与参数样例 |

## 3. 核心调用路径

### 3.1 建池与加流动性

`用户 -> Router -> Factory -> Pair`

- 用户通过 `FluxSwapRouter` 发起加流动性。
- 若交易对尚不存在，`FluxSwapFactory` 创建 `FluxSwapPair`。
- `Router` 把资产转入 `Pair`。
- `Pair` 更新储备并铸造 LP。

### 3.2 Swap 兑换

`用户 -> Router -> Pair(单跳或多跳) -> 接收方`

- `Router` 负责路径校验、报价和最小输出保护。
- `Pair` 负责恒定乘积计算、储备更新和协议费处理。
- 多跳兑换由 `Router` 串联多个 `Pair` 完成。

### 3.3 链下签名订单链上结算

`Maker -> SignedOrderSettlement -> Router -> Pair -> Recipient`

- Maker 在链下签名订单，不把完整订单簿状态写入链上。
- watcher / executor 在链下判断是否到价，再调用 `FluxSignedOrderSettlement.executeOrder`。
- 结算合约在链上校验签名、nonce、过期时间、最小成交量与触发价格。
- 若订单输入写的是原生币语义，链上会统一按 `WETH` 作为输入资产处理；若输出写的是原生币语义，则最终由 Router 解包后发送 `ETH`。
- 订单满足条件后，通过 `FluxSwapRouter` 走真实 AMM 路径完成 `ERC20/WETH -> ERC20` 或 `ERC20/WETH -> ETH` 结算。

### 3.4 单池 / LP 质押领奖

`用户 -> StakingPool -> Manager(可选) -> StakingPool -> 用户`

- 用户直接与 `FluxSwapStakingRewards` 或 `FluxSwapLPStakingPool` 交互。
- 池合约负责用户级奖励快照、记账和发放。
- 若池接入 `FluxMultiPoolManager`，池会按需向 `Manager` 领取本池奖励，再发给最终用户。

### 3.5 多池奖励分发

`运营方 / 分发模块 -> MultiPoolManager -> 各奖励池 -> 用户`

- `MultiPoolManager` 维护全局权重和池级待领奖励。
- 各奖励池不是直接拿到整批奖励，而是按需向 `Manager` claim。
- 最终发奖发生在池内部，而不是 `Manager` 直接发给终端用户。

### 3.6 协议收入回购与分发

`RevenueDistributor -> BuybackExecutor -> Treasury -> Router -> Treasury -> burn / distribute`

- `FluxRevenueDistributor` 负责收入拆分策略。
- `FluxBuybackExecutor` 从 `Treasury` 拉取已批准额度的支出资产并执行回购。
- 回购得到的目标代币回流 `Treasury`。
- 一部分销毁，一部分通过 `MultiPoolManager` 分发给奖励池。

### 3.7 金库治理

`multisig / guardian / operator -> Treasury -> 各业务模块`

- `multisig` 负责时间锁治理和高权限配置。
- `guardian` 负责紧急暂停。
- `operator` 负责白名单日常拨款。
- 业务模块通常不长期持有大额协议资产，而是通过 `Treasury` 的受控额度按需取用。

## 4. 哪些合约需要主动部署

### 4.1 需要项目方主动部署的核心合约

以下合约通常由项目方或部署脚本主动部署：

1. `FluxToken.sol`
2. `FluxSwapTreasury.sol`
3. `FluxSwapFactory.sol`
4. `FluxSwapRouter.sol`
5. `FluxSignedOrderSettlement.sol`
6. `FluxMultiPoolManager.sol`
7. `FluxPoolFactory.sol`
8. `FluxBuybackExecutor.sol`
9. `FluxRevenueDistributor.sol`

### 4.2 由系统自动创建的合约

以下合约不是普通用户手工部署，而是由工厂或业务流程自动创建：

| 合约 | 创建者 | 触发时机 |
| --- | --- | --- |
| `FluxSwapPair.sol` | `FluxSwapFactory` | 创建新交易对时 |
| `FluxSwapStakingRewards.sol` | `FluxPoolFactory` | 创建单币质押池时 |
| `FluxSwapLPStakingPool.sol` | `FluxPoolFactory` | 创建 LP 质押池时 |

### 4.3 不需要单独部署的基类

- `FluxSwapERC20.sol`

该合约是 LP Token 基类，由 `FluxSwapPair` 继承使用，不作为独立业务入口部署。

### 4.4 用户是否需要部署正式合约

正常业务流程下，普通用户不需要自行部署正式合约。用户主要是：

- 调用 `Router` 进行交易、加减流动性
- 调用质押池进行 `stake / withdraw / getReward / exit`
- 与已经存在的协议基础设施交互，而不是自己部署核心组件

## 5. 当前测试体系

测试已按类别拆分为多个目录，便于区分“功能正确性”和“安全性 / 长期约束”：

| 大类 | 目录 | 说明 |
| --- | --- | --- |
| 常规测试 | `test/regular/unit` | 单合约职责、参数校验、边界行为 |
| 常规测试 | `test/regular/integration` | 跨合约真实业务流程 |
| 常规测试 | `test/regular/regression` | 历史高风险点回归 |
| 权限与治理 | `test/permissions-governance` | owner / operator / guardian / multisig / timelock 边界 |
| 经济安全 | `test/economic-security` | 回购、销毁、分发、对账、对抗场景 |
| Fuzz | `test/fuzz` | 随机输入与长序列状态扰动 |
| Invariant | `test/invariant` | 长序列下资金守恒与关键约束 |
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
- `test/static-analysis/README.md`

## 6. 本地开发与测试

### 6.1 安装依赖

```bash
npm install
```

### 6.2 Hardhat 编译

```bash
npx hardhat compile
```

### 6.3 常用测试命令

```bash
npm run test:unit
npm run test:integration
npm run test:regression
npm run test:permissions-governance
npm run test:economic-security
npm run test:fuzz
npm run test:invariant
npm run test:static-analysis
```

补充说明：

- `test:unit`、`test:integration`、`test:regression`、`test:permissions-governance`、`test:economic-security` 主要走 Hardhat。
- `test:fuzz`、`test:invariant` 主要走 Foundry。
- `test:static-analysis` 当前默认封装的是 `solhint`。

## 7. 部署

当前已提供基于 Hardhat Ignition 的核心合约部署模块：

- `ignition/modules/FluxCore.ts`

该模块会按以下顺序部署并完成基础联动：

1. `FluxToken`
2. `FluxSwapTreasury`
3. `FluxSwapFactory`
4. `FluxSwapRouter`
5. `FluxSignedOrderSettlement`
6. `FluxMultiPoolManager`
7. `FluxPoolFactory`
8. `FluxBuybackExecutor`
9. `FluxRevenueDistributor`
10. `FluxSwapFactory.setTreasury(treasury)`
11. `FluxMultiPoolManager.setPoolFactory(poolFactory)`

### 7.1 临时本地部署

这里的 `local` 指的是 Hardhat 进程内的一次性模拟链，对应 `hardhat.config.ts` 里的 `hardhatMainnet` 网络。
它适合快速验证部署逻辑，但命令结束后链状态会丢失，所以不适合接着跑“第二步初始化脚本”。

```bash
npm run deploy:core
npm run deploy:core:local
```

本地部署样例参数文件：

- `ignition/parameters/FluxCore.local.sample.json5`

该样例会额外部署一个 `MockWETH` 供本地联调用。

### 7.2 可持续本地部署与初始化

如果你要在本地做“部署完成后再继续初始化、前端联调、手工点流程”，应使用 `localhost` 常驻节点链路：

```bash
npm run node:local
```

另开一个终端后执行部署：

```bash
npm run deploy:core:localhost
```

再执行初始化：

```bash
npm run init:post-deploy:plan:local
npm run init:post-deploy:all:local
```

补充说明：

- `deploy:core:localhost` 会把部署结果写入 `ignition/deployments/chain-31337/`，后续初始化脚本会从这里自动读取核心合约地址。
- `init:post-deploy:plan:local` 只做校对，不发交易。
- `init:post-deploy:all:local` 会自动完成 Treasury timelock 的 `schedule -> 本地快进 -> execute`，然后继续执行资金注入等即时初始化动作。
- 本地初始化样例配置在 `ignition/parameters/post-deploy-init.local.sample.json5`。
- 当前本地样例会把大部分 `FLUX` 注入 `Treasury`，同时给默认测试钱包预留 `200000 FLUX`，便于前端直接联调 `swap / pool` 且更方便人工核对余额变化。

### 7.3 Sepolia 部署

先准备：

- `SEPOLIA_RPC_URL`
- `SEPOLIA_PRIVATE_KEY`
- `ignition/parameters/FluxCore.sepolia.sample.json5`

然后执行：

```bash
npm run deploy:core:sepolia
```

Sepolia 上建议把初始化拆成两步：

```bash
npm run init:post-deploy:plan:sepolia
npm run init:post-deploy:schedule:sepolia
npm run init:post-deploy:execute:sepolia
```

补充说明：

- `ignition/parameters/post-deploy-init.sepolia.sample.json5` 里可以直接覆盖外部 `WETH` 地址。
- 如果 `Treasury.multisig` 已经是 Safe 多签，而当前私钥不是该多签可直接执行的签名账户，那么脚本更适合作为 `plan` 校对工具；真正的 `schedule` / `execute` 需要通过多签发起。

### 7.4 部署后初始化脚本

当前 `ignition/post-deploy-init.ts` 支持以下几类部署后初始化动作：

- Treasury timelock 白名单：`allowedTokens`、`allowedRecipients`
- Treasury 风控参数：`dailySpendCaps`
- Treasury 业务额度：`spenderApprovals`、`spenderRevocations`
- 可选资金注入：原生币转账、代币 mint、代币转账
- 可选权限收口：`ownershipTransfers`

脚本支持四种模式：

- `plan`：只打印将要执行的初始化计划、操作哈希和当前状态
- `schedule`：只排期 Treasury 的 timelock 操作
- `execute`：只执行已到期的 timelock 操作，并继续执行 funding / ownership 动作
- `all`：本地链一键跑完整初始化；测试网和主网不建议直接使用

### 7.5 部署参数说明

核心参数包括：

- `bootstrapAdmin`
- `treasurySetter`
- `treasuryMultisig`
- `treasuryGuardian`
- `treasuryOperator`
- `rewardsOperator`
- `buybackOperator`
- `revenueOperator`
- `weth` 或 `deployMockWeth`
- `tokenName`
- `tokenSymbol`
- `initialRecipient`
- `initialSupply`
- `tokenCap`
- `treasuryMinDelay`
- `buybackBps`
- `burnBps`

补充说明：

- 如果你要在部署阶段自动完成 `Factory.setTreasury` 和 `Manager.setPoolFactory`，那么 `treasurySetter` 与 `bootstrapAdmin` 需要与当前部署签名账户权限一致。
- 如果最终治理地址是外部多签，通常更稳妥的做法是先用可签名的 bootstrap 账户完成部署和基础联动，再做后续权限移交。

## 8. 工具链说明

当前目录采用 Hardhat + Foundry 双工具链：

- Hardhat 负责常规编译、TypeScript 测试、Ignition 部署模块、部署后初始化脚本运行。
- Foundry 负责 Fuzz 与 Invariant 测试。

关键配置文件：

- `hardhat.config.ts`
- `foundry.toml`
- `.solhint.json`

当前 Foundry 配置要点：

- Solidity 版本：`0.8.28`
- EVM 版本：`cancun`
- 优化器：开启，`runs = 200`

## 9. 当前收口状态

以目前这轮代码基线来看，合约系统已经形成完整主链路：

- AMM 交易主链路
- 链下签名订单链上结算主链路
- 金库治理主链路
- 多池奖励主链路
- 协议收入回购 / 销毁 / 分发主链路

对应测试也已按类别整理并补齐到较完整状态，因此当前更适合做持续维护、回归校验、部署前复核和权限收口，而不是停留在模板工程阶段。
