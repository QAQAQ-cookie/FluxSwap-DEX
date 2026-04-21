# Frontend

FluxSwap 前端用于连接钱包、读取链上状态，并发起交换、流动性、收益和限价单相关操作。

## 常用命令

```bash
npm install
npm run dev
```

本地开发默认访问 `http://localhost:3000`。

## 合约 ABI / 类型自动生成

前端已接入 `@wagmi/cli`，会读取上一层 `contracts` 工程的 Hardhat artifacts，自动生成可用的 ABI、类型化 action 和 React hooks。

```bash
npm run codegen
```

持续监听合约 artifacts 变化时可使用：

```bash
npm run codegen:watch
```

如果希望一次性刷新“合约地址 + ABI / 类型”：

```bash
npm run contracts:refresh
```

## 生成结果

当前采用“一合约一文件”的生成方式。

生成目录：

- `src/lib/contracts/generated/`
- `src/lib/contracts/index.ts`

前端侧统一从这里导入：

```ts
import { fluxSwapRouterAbi, useReadFluxSwapFactory } from '@/lib/contracts'
```

## 当前页面能力

`/swap` 页面已经接入真实链上读取与基础写入流程：

- 读取实时余额。
- 读取 Pair 是否存在、是否有流动性。
- 读取 Router 链上报价。
- 在卖出 ERC20 时先做 `approve`。
- 满足条件后直接发起交换交易。
- 支持限价单签名，并通过 `/api/orders` 写入后端订单库。

`/pool` 页面已经接入真实链上读取与基础写入流程：

- 读取 Pair 地址、储备、总 LP 供应。
- 读取用户 LP 余额。
- 读取代币和 LP 授权额度。
- 支持 `addLiquidityETH`。
- 支持 `removeLiquidityETH`。

`/earn` 页面已经接入真实链上读取与基础写入流程：

- 读取 LP 地址与关联 staking pool 地址。
- 读取钱包 LP 余额、已质押 LP、总质押量。
- 读取 `earned`、`pendingUserRewards`、`pendingPoolRewards`。
- 支持 `stake`、`withdraw`、`getReward`、`exit`。

## 限价单创建入口

浏览器不能直接调用普通 gRPC，因此前端通过 Next.js API route 转发到后端：

```http
POST /api/orders
```

该接口会把签名后的订单转发到后端 `Executor/CreateOrder`，成功后订单进入数据库，等待执行器扫描。

当前提交字段包括：

- `chainId`
- `settlementAddress`
- `orderHash`
- `maker`
- `inputToken`
- `outputToken`
- `amountIn`
- `minAmountOut`
- `maxExecutorRewardBps`
- `triggerPriceX18`
- `expiry`
- `nonce`
- `recipient`
- `signature`
- `source`

其中限价单关键字段的数值口径约定如下：

- `amountIn`：卖出代币按自身 `decimals` 转成的最小单位整数。
- `minAmountOut`：最低买入数量按目标代币 `decimals` 转成的最小单位整数。
- `triggerPriceX18`：按输入/输出代币精度归一后的价格整数，统一放大到 `1e18` 精度，不是直接用两个最小单位整数相除。
- 前端会先把用户输入的展示值转换成上述整数口径，再提交给后端创建订单。

## 合约地址配置

本地 Hardhat 地址会从上一层 `contracts/ignition/deployments` 自动同步：

```bash
npm run contracts:sync
```

同步生成文件：

- `src/config/contracts.generated.ts`

前端使用入口：

- `src/config/contracts.ts`

可以通过 helper 按链读取地址：

```ts
import { getContractAddress, getRequiredContractAddress } from '@/config/contracts'
```

## 当前生成规则

- 来源：上一层 `contracts` 工程的 Hardhat artifacts。
- 范围：正式合约，不包含 `mocks`。
- 已排除：`build-info`、`.dbg.json`。
- 默认不在前端手工维护 ABI。

## 环境变量

请参考 `.env.example`。

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `BACKEND_GRPC_URL`
- `NEXT_PUBLIC_SEPOLIA_FLUX_BUYBACK_EXECUTOR`
- `NEXT_PUBLIC_SEPOLIA_FLUX_MULTI_POOL_MANAGER`
- `NEXT_PUBLIC_SEPOLIA_FLUX_POOL_FACTORY`
- `NEXT_PUBLIC_SEPOLIA_FLUX_REVENUE_DISTRIBUTOR`
- `NEXT_PUBLIC_SEPOLIA_FLUX_SIGNED_ORDER_SETTLEMENT`
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
