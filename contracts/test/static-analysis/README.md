# Static Analysis 测试说明

本目录用于存放“静态分析”相关说明与后续结果记录。

这类检查不依赖业务路径执行结果，而是直接扫描合约源码结构、编码规范与常见风险模式。

## 当前已接入

### `solhint`

- 作用：执行 Solidity 规则检查与基础静态分析。
- 运行命令：`npm run static:solhint`
- 聚合命令：`npm run test:static-analysis`
- 当前扫描范围：主合约与库文件
- 当前排除范围：`contracts/mocks/**/*.sol`、`contracts/interfaces/**/*.sol`、`node_modules/**/*.sol`

## 当前规则侧重点

- 编译器版本必须匹配 `^0.8.28`
- 检查函数可见性、状态变量可见性、声明顺序
- 检查 `console` 调用等不应进入正式合约的内容
- 保留会影响正式代码质量的结构性规则，暂时关闭 Natspec 与大部分 gas 优化类提示
- 对 timelock / deadline 相关逻辑，暂不启用 `not-rely-on-time`

## 当前未接入

### `slither`

- 环境已可单独安装，但当前主工程使用 `Hardhat 3`
- `slither / crytic-compile` 直连当前 Hardhat 3 配置时，会在构建产物解析阶段失败
- 当前卡点不在合约编译本身，而在工具链对 Hardhat 3 输出结构的兼容性
- 后续如需接入，建议采用“单独兼容入口”方案，而不是直接改动主测试配置

## 重点扫描合约

- `contracts/FluxSwapTreasury.sol`
- `contracts/FluxRevenueDistributor.sol`
- `contracts/FluxMultiPoolManager.sol`
- `contracts/FluxBuybackExecutor.sol`
- `contracts/FluxSwapStakingRewards.sol`
- `contracts/FluxSwapFactory.sol`
- `contracts/FluxSwapRouter.sol`
- `contracts/FluxSwapPair.sol`

## 当前状态

- `solhint` 已完成项目内接入，可直接执行
- 当前基线以“主合约真实风险信号”为主，已排除 mock / interface 噪音
- `slither` 环境准备已开始，但尚未完成与当前 Hardhat 3 主工程的稳定联通