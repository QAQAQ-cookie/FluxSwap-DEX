# Unit 测试说明

本目录用于存放单合约职责、参数校验、权限边界与局部状态迁移测试。

## 当前覆盖

- `FluxToken.test.ts`
  - 代币基础属性、mint / burn、ownership 与 minter 权限迁移。
- `FluxSwapFactory.test.ts`
  - 交易对创建、顺序归一化、setter 迁移。
- `FluxSwapPair.test.ts`
  - mint / burn / swap / flash swap / permit / skim / sync。
- `FluxSwapRouter.test.ts`
  - exact-input / exact-output、流动性增删、permit 路径、最小值保护。
- `FluxSwapStakingRewards.test.ts`
- `FluxSwapLPStakingPool.test.ts`
- `FluxSwapTreasury.unit.test.ts`
- `FluxMultiPoolManager.unit.test.ts`
- `FluxPoolFactory.unit.test.ts`
- `FluxBuybackExecutor.unit.test.ts`
- `FluxRevenueDistributor.unit.test.ts`
- `FluxSignedOrderSettlement.unit.test.ts`

## 兼容性说明

- Router 当前仅面向标准 ERC20 / WETH 路径。
- 当前协议不支持 `fee-on-transfer` / `taxed token`。

## 执行方式

- 运行全部单元测试：`npm run test:unit`
- 运行单个文件：`npx hardhat test test/regular/unit/FluxSwapTreasury.unit.test.ts`
