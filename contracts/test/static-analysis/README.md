# Static Analysis 测试说明

本目录用于存放静态分析相关说明、执行方式与结果记录。

静态分析不依赖业务路径是否跑通，而是直接扫描合约源码结构、权限边界、外部调用模式和常见风险特征。

## 当前已接入

### `solhint`

- 作用：执行 Solidity 规则检查与基础静态分析
- 运行命令：`npm run static:solhint`
- 聚合命令：`npm run test:static-analysis`
- 当前扫描范围：主实现合约与库文件
- 当前排除范围：`contracts/mocks/**/*.sol`、`contracts/interfaces/**/*.sol`、`node_modules/**/*.sol`

### `slither`

- 作用：执行审计导向的安全静态分析
- 当前编译入口：`Foundry`
- 当前运行环境：`WSL Ubuntu`
- 当前建议命令：在 `contracts` 目录下直接执行 `slither . --print human-summary`

### `foundry`

- 当前运行环境：`WSL Ubuntu`
- 当前建议命令：在 `contracts` 目录下直接执行 `forge build`、`forge test`
- 当前不建议在 Windows PowerShell 中通过 `npm script` 调用 `forge`
- 原因：`forge` 当前安装在 WSL 环境内，Windows 侧 `npm run forge:*` 无法直接解析该命令

## 当前规则侧重点

- 编译器版本约束为 `0.8.28`
- 检查权限边界、外部调用、返回值处理、重入模式、状态更新顺序
- 检查实现合约中不应保留的调试导入与结构性问题
- 保留对审计阶段有帮助的结构性和安全性规则

## 当前重点扫描合约

- `contracts/FluxSwapTreasury.sol`
- `contracts/FluxRevenueDistributor.sol`
- `contracts/FluxMultiPoolManager.sol`
- `contracts/FluxBuybackExecutor.sol`
- `contracts/FluxSwapStakingRewards.sol`
- `contracts/FluxSwapFactory.sol`
- `contracts/FluxSwapRouter.sol`
- `contracts/FluxSwapPair.sol`

## 当前状态

- `solhint` 已接入并稳定运行
- 主实现合约当前基线为 `0 error, 4 warnings`
- `mocks` 目录的本地 lint 问题已额外清理完成
- `slither` 已通过 Foundry 兼容配置打通，可在 WSL 中直接执行
- `foundry` 配置文件可正常被识别，`forge clean && forge build` 已在 WSL 中验证通过

## 结果记录

- `solhint` 基线：保留 4 条已评估为“可接受 / 可豁免”的 warning
- `slither` 判定报告：见 `SlitherReport.md`
