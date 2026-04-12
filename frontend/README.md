# Frontend

## 常用命令

```bash
npm install
npm run dev
```

本地开发默认访问 `http://localhost:3000`。

## 合约 ABI / 类型自动生成

前端已经接入 `@wagmi/cli`，会直接读取上一级 `contracts` 工程的 Hardhat artifacts，自动生成前端可用的 ABI、类型化 action 和 React hooks。

```bash
npm run codegen
```

持续监听合约 artifacts 变化时可使用：

```bash
npm run codegen:watch
```

如果希望一次同时刷新“合约地址 + ABI / 类型”：

```bash
npm run contracts:refresh
```

## 生成结果

当前采用“一合约一文件”的生成方式。

生成目录：

- `src/lib/contracts/generated/`
- `src/lib/contracts/index.ts`

当前会生成这些正式合约文件：

- `FluxBuybackExecutor.ts`
- `FluxMultiPoolManager.ts`
- `FluxPoolFactory.ts`
- `FluxRevenueDistributor.ts`
- `FluxSwapERC20.ts`
- `FluxSwapFactory.ts`
- `FluxSwapLPStakingPool.ts`
- `FluxSwapPair.ts`
- `FluxSwapRouter.ts`
- `FluxSwapStakingRewards.ts`
- `FluxSwapTreasury.ts`
- `FluxToken.ts`

前端侧统一从这里导入：

```ts
import { fluxSwapRouterAbi, useReadFluxSwapFactory } from '@/lib/contracts'
```

当前 `/swap` 页面首版已接入真实链上读取与基础写入流程，默认围绕 `ETH / FLUX`：

- 读取实时余额
- 读取 Pair 是否存在、是否有流动性
- 读取 Router 链上报价
- 在卖出 `FLUX` 时先做 `approve`
- 满足条件后直接发起兑换交易

当前 `/pool` 页面首版也已接入真实链上读取与基础写入流程，默认围绕 `ETH / FLUX`：

- 读取 Pair 地址、储备、总 LP 供应
- 读取用户 LP 余额
- 读取 `FLUX` / `LP` 的授权额度
- 支持 `addLiquidityETH`
- 支持 `removeLiquidityETH`
- 在需要时先做 `FLUX` 或 `LP` 授权

当前 `/earn` 页面首版已接入真实链上读取与基础写入流程，默认围绕 `ETH / FLUX` LP 奖励池：

- 读取 LP 地址与关联 staking pool 地址
- 读取钱包 LP 余额、已质押 LP、总质押量
- 读取 `earned`、`pendingUserRewards`、`pendingPoolRewards`
- 读取奖励储备与奖励代币地址
- 支持 `stake`
- 支持 `withdraw`
- 支持 `getReward`
- 支持 `exit`
- 在需要时先做 LP 授权

## 合约地址配置

本地 Hardhat 地址会从上一级 `contracts/ignition/deployments` 自动同步：

```bash
npm run contracts:sync
```

同步生成文件：

- `src/config/contracts.generated.ts`

前端使用入口：

- `src/config/contracts.ts`

可以直接通过 helper 按链读取地址：

```ts
import { getContractAddress, getRequiredContractAddress } from '@/config/contracts'
```

## 当前生成规则

- 来源：上一级 `contracts` 工程的 Hardhat artifacts
- 范围：仅正式合约，不包含 `mocks`
- 已排除：`build-info`、`.dbg.json`
- 默认不在前端手工维护 ABI

## 环境变量

请参考 `.env.example`。

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_SEPOLIA_FLUX_BUYBACK_EXECUTOR`
- `NEXT_PUBLIC_SEPOLIA_FLUX_MULTI_POOL_MANAGER`
- `NEXT_PUBLIC_SEPOLIA_FLUX_POOL_FACTORY`
- `NEXT_PUBLIC_SEPOLIA_FLUX_REVENUE_DISTRIBUTOR`
- `NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_FACTORY`
- `NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_ROUTER`
- `NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_TREASURY`
- `NEXT_PUBLIC_SEPOLIA_FLUX_TOKEN`
- `NEXT_PUBLIC_SEPOLIA_WETH`

## 构建检查

```bash
npm run build
```

如果要连接本地合约，还需要先在合约工程启动本地链并完成部署初始化。
