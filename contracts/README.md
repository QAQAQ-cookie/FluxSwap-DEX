# FluxSwap Contracts

本目录承载 FluxSwap 协议的合约、测试、脚本与静态分析配置。
当前实现已经不再是模板项目，而是一套围绕 `AMM + 金库治理 + 多池奖励 + 收入回购分发` 组织起来的完整合约系统。

## 1. 项目定位

当前协议主要覆盖 8 个业务模块：

| 模块 | 说明 | 主要合约 |
| --- | --- | --- |
| 协议主代币 | 主币发行、上限控制、销毁、铸币权限管理 | `FluxToken.sol` |
| AMM 交易系统 | 建池、交易对、加减流动性、代币兑换、ETH/WETH 路径 | `FluxSwapFactory.sol`、`FluxSwapPair.sol`、`FluxSwapRouter.sol` |
| LP 份额系统 | LP Token 铸造、销毁、授权、Permit | `FluxSwapERC20.sol` |
| 金库治理系统 | 多签治理、时间锁、白名单拨款、日限额、受控支出、紧急提取 | `FluxSwapTreasury.sol` |
| 单池质押奖励 | 单币或任意资产质押、奖励注入、领取、退出 | `FluxSwapStakingRewards.sol` |
| LP 质押池 | 专门面向 LP Token 的质押池 | `FluxSwapLPStakingPool.sol` |
| 多池奖励管理 | 多池权重配置、统一分发奖励、池工厂接入 | `FluxMultiPoolManager.sol`、`FluxPoolFactory.sol` |
| 协议收入处理 | 协议收入回购、销毁、奖励分发 | `FluxRevenueDistributor.sol`、`FluxBuybackExecutor.sol` |

## 2. 目录结构

| 路径 | 说明 |
| --- | --- |
| `contracts/` | 正式业务合约 |
| `interfaces/` | 对外接口定义 |
| `libraries/` | 公共库 |
| `scripts/` | 测试运行脚本与辅助脚本 |
| `test/` | 常规测试、权限治理、经济安全、Fuzz、Invariant、静态分析文档 |
| `ignition/` | Hardhat Ignition 部署模块 |

## 3. 核心调用路径

### 3.1 建池与加流动性

`用户 -> Router -> Factory -> Pair`

- 用户通过 `FluxSwapRouter` 发起加流动性。
- 若交易对尚不存在，`FluxSwapFactory` 创建 `FluxSwapPair`。
- `Router` 把资产转入 `Pair`。
- `Pair` 负责更新储备并铸造 LP。

### 3.2 Swap 兑换

`用户 -> Router -> Pair(单跳或多跳) -> 接收方`

- `Router` 负责路径校验、报价、最小输出保护。
- `Pair` 负责恒定乘积计算、储备更新和协议费处理。
- 多跳兑换由 `Router` 串联多个 `Pair` 完成。

### 3.3 单池 / LP 质押领奖

`用户 -> StakingPool -> Manager(可选) -> StakingPool -> 用户`

- 用户与 `FluxSwapStakingRewards` 或 `FluxSwapLPStakingPool` 直接交互。
- 池负责用户级奖励快照、记账和发放。
- 若池接入 `FluxMultiPoolManager`，则池会在需要时向 `Manager` 领取本池奖励，再发给用户。

### 3.4 多池奖励分发

`运营方 / 分发模块 -> MultiPoolManager -> 各奖励池 -> 用户`

- `MultiPoolManager` 维护全局权重和池级待领奖励。
- 各奖励池不是直接拿到整批奖励，而是按需向 `Manager` claim。
- 最终发奖动作发生在池内，而不是 `Manager` 直接发给最终用户。

### 3.5 协议收入回购与分发

`RevenueDistributor -> BuybackExecutor -> Treasury -> Router -> Treasury -> burn / distribute`

- `FluxRevenueDistributor` 负责收入拆分策略。
- `FluxBuybackExecutor` 从 `Treasury` 拉取已批准额度的支出资产并完成回购。
- 回购得到的目标代币回流 `Treasury`。
- 一部分被销毁，一部分通过 `MultiPoolManager` 分发给奖励池。

### 3.6 金库治理

`multisig / guardian / operator -> Treasury -> 各业务模块`

- `multisig` 负责时间锁治理与高权限配置。
- `guardian` 负责紧急暂停。
- `operator` 负责白名单日常拨款。
- 多个业务模块并不长期持有大额协议资金，而是通过 `Treasury` 的受控额度机制按需取用。

## 4. 哪些合约需要手工部署

### 4.1 需要项目方主动部署的核心合约

以下合约通常由项目方或部署脚本主动部署：

1. `FluxToken.sol`
2. `FluxSwapFactory.sol`
3. `FluxSwapRouter.sol`
4. `FluxSwapTreasury.sol`
5. `FluxMultiPoolManager.sol`
6. `FluxPoolFactory.sol`
7. `FluxBuybackExecutor.sol`
8. `FluxRevenueDistributor.sol`

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

正常业务流程下，普通用户不需要自行部署正式合约。
用户主要是：

- 调用 `Router` 进行交易、加减流动性
- 调用各类质押池进行 stake / withdraw / getReward / exit
- 与已经存在的协议基础设施交互，而不是自己部署协议核心组件

## 5. 当前测试体系

测试已按类别拆分为多个目录，便于区分“功能正确性”和“安全性/长期约束”。

| 大类 | 目录 | 说明 |
| --- | --- | --- |
| 常规测试 | `test/regular/unit` | 单合约职责、参数校验、边界行为 |
| 常规测试 | `test/regular/integration` | 跨合约真实业务流程 |
| 常规测试 | `test/regular/regression` | 历史高风险点回归 |
| 权限与治理 | `test/permissions-governance` | owner / operator / guardian / multisig / timelock 边界 |
| 经济安全 | `test/economic-security` | 回购、销毁、分发、对账、对抗路径 |
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

## 7. 工具链说明

当前目录采用 Hardhat + Foundry 双工具链：

- Hardhat 负责常规编译、TypeScript 测试、Ignition 部署模块。
- Foundry 负责 Fuzz 与 Invariant 测试。

关键配置文件：

- `hardhat.config.ts`
- `foundry.toml`
- `.solhint.json`

当前 Foundry 配置要点：

- Solidity 版本：`0.8.28`
- EVM 版本：`cancun`
- 优化器：开启，`runs = 200`

## 8. 当前收口状态

以目前这轮代码基线来看，合约系统已经形成完整主链路：

- AMM 交易主链路
- 金库治理主链路
- 多池奖励主链路
- 收入回购销毁分发主链路

对应测试也已经按类别整理并补齐到较完整状态，因此本 README 也同步改为项目文档，用来说明当前系统结构、业务链路、部署职责和测试入口。
