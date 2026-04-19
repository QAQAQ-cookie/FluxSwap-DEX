# Integration 测试说明

本目录用于存放跨合约、跨模块的真实业务链路测试，重点验证从入口到最终结果的完整闭环。

## 当前覆盖

### AMM / Swap 主链路

- `FluxAmmCoreFlow.test.ts`
  - 验证建池、加流动性、交易、协议费沉淀与 LP 退出闭环。
- `FluxEthWethFlow.test.ts`
  - 验证 ETH / WETH 路径的加池、换币与协议费沉淀。
- `FluxMultiHopRoutingFlow.test.ts`
  - 验证多跳路径下的 swap 与跨 hop 协议费记账。
- `FluxExactOutputRoutingFlow.test.ts`
  - 验证 exact-output 多跳路径。
- `FluxExactOutputEthFlow.test.ts`
  - 验证 token / ETH 的 exact-output 路径。
- `FluxFlashSwapFlow.test.ts`
  - 验证 flash swap 成功 / 失败分支。
- `FluxPermitLiquidityFlow.test.ts`
  - 验证 permit 移除流动性路径。
- `FluxSignedOrderSettlementFlow.test.ts`
  - 验证签名订单结算合约与 `Factory / Router / Pair` 的真实联动。

### Treasury / 奖励 / 回购链路

- `FluxProtocolFlow.test.ts`
- `FluxRevenueDistributor.test.ts`
- `FluxTreasuryOperationsFlow.test.ts`

### 池子 / 工厂 / 多池管理链路

- `FluxSinglePoolFactoryFlow.test.ts`
- `FluxLpMiningFlow.test.ts`
- `FluxMultiPoolAllocationFlow.test.ts`
- `FluxManagedPoolLifecycleFlow.test.ts`
- `FluxManagedPoolRewardConfigurationFlow.test.ts`
- `FluxPausePropagationFlow.test.ts`

## 兼容性说明

- 当前协议仅覆盖标准 ERC20 / WETH 集成路径。
- `fee-on-transfer` / `taxed token` 已被明确排除在支持范围之外。

## 执行方式

- 运行全部集成测试：`npm run test:integration`
- 运行单个文件：`npx hardhat test test/regular/integration/FluxRevenueDistributor.test.ts`
