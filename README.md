<p align="center">
  <strong>FluxSwap</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/language-Solidity-blue" alt="Language">
  <img src="https://img.shields.io/badge/build-Hardhat-yellow" alt="Build">
  <img src="https://img.shields.io/badge/status-Development-orange" alt="Status">
</p>

**FluxSwap** 是一个去中心化交易所（DEX），基于 Uniswap V3 核心合约构建，支持流动性提供（LP Token）和代币兑换。  
该项目展示 DEX 的核心功能和流动性管理概念。

## 核心功能

- **流动性提供（Add/Remove Liquidity）**：用户可向池子提供代币流动性，获得 LP Token；取回流动性时销毁 LP Token。  
- **代币兑换（Swap）**：基于 AMM 模型进行 ERC20 代币交换。  
- **链上价格计算**：根据池子储备实时计算交易价格。  

## 技术栈

- **Solidity** — 智能合约开发  
- **Uniswap V3 Core & Periphery** — 核心 AMM 功能  
- **Hardhat / Ethers.js** — 部署和前端交互  
- **HTML / JavaScript 或 React** — 前端交互界面  
- **MetaMask** — 链上钱包连接

## 项目状态

- 当前为开发初期，核心合约和前端界面正在构建中。  
- 未来可能扩展功能：
  - 集中流动性管理  
  - LP 奖励机制  
  - 多链部署支持  
  - 前端 React 完整组件化与 UI 美化
