# FluxSwap 管理端

FluxSwap 管理端是一个独立的 Next.js 前端，用来管理协议的农场、奖励分发、金库和代币配置。

当前管理端主要面向两类场景：

- 本地 Hardhat 链联调
- Sepolia 测试网部署后的管理操作

## 技术栈

- Next.js 16
- React 19
- TypeScript
- wagmi
- viem
- RainbowKit
- Tailwind CSS 4

## 本地启动

先安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认端口：

```bash
http://localhost:3001
```

生产构建与启动：

```bash
npm run build
npm run start
```

## 常用脚本

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
```

## 页面结构

当前管理端包含以下页面：

- `/`：管理首页，展示概览入口和整体状态
- `/overview`：协议概览，包括图谱、待处理事项、奖励容量、农场权重、管理事件频率
- `/farm`：农场管理，处理质押池、权重、奖励分发
- `/treasury`：金库管理，处理资产、授权、金库状态和治理操作
- `/tokens`：代币管理，查看白名单、用途和链上配置一致性
- `/logs`：管理日志，查看农场与金库相关管理事件

## 链与合约配置

管理端支持的链由以下配置共同决定：

- `src/config/contracts.generated.ts`
- `src/config/contracts.ts`
- `src/config/tokens.ts`
- `src/config/wagmi.ts`

### 本地链

本地 Hardhat 链的合约地址优先从生成文件中读取：

- `src/config/contracts.generated.ts`

所以如果你重启了本地链、重新部署了合约，需要同步更新这部分生成配置，否则管理端会继续读取旧地址。

### Sepolia

Sepolia 的部分地址通过环境变量注入，典型字段包括：

```bash
NEXT_PUBLIC_SEPOLIA_FLUX_BUYBACK_EXECUTOR=
NEXT_PUBLIC_SEPOLIA_FLUX_MULTI_POOL_MANAGER=
NEXT_PUBLIC_SEPOLIA_FLUX_POOL_FACTORY=
NEXT_PUBLIC_SEPOLIA_FLUX_REVENUE_DISTRIBUTOR=
NEXT_PUBLIC_SEPOLIA_FLUX_SIGNED_ORDER_SETTLEMENT=
NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_FACTORY=
NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_ROUTER=
NEXT_PUBLIC_SEPOLIA_FLUX_SWAP_TREASURY=
NEXT_PUBLIC_SEPOLIA_FLUX_TOKEN=
NEXT_PUBLIC_SEPOLIA_WETH=
```

如果当前链没有可识别的合约配置，管理端会进入“不支持网络”或“缺少合约配置”的提示状态。

## 数据来源说明

管理端当前主要直接读取链上数据，不依赖单独的后端服务：

- 农场、奖励、池子状态：读取管理合约与质押池合约
- 金库状态与授权：读取金库合约
- 代币白名单与用途：读取链上配置并与前端配置比对
- 管理日志：按最近区块窗口拉取农场和金库管理事件

其中概览页“管理事件频率”当前按最近 `20,000` 个区块统计。

## 开发建议

### 1. 本地联调顺序

推荐顺序：

1. 启动本地 Hardhat 链
2. 部署合约
3. 更新前端使用的合约地址配置
4. 启动管理端

如果你已经重启本地链，但页面还显示旧数据，优先检查：

- 本地链是否真的已经切到新实例
- 合约地址是否还是旧地址
- 钱包网络是否仍停留在旧链配置

### 2. 页面没有数据时先看这几项

- 钱包连接是否正常
- 当前网络是否受支持
- 管理合约地址是否存在
- 金库地址是否存在
- 本地链上的合约是否已经重新部署

### 3. 自动刷新

概览页当前会在首次进入页面时自动加载一次，之后只有手动点击刷新才会重新拉取，避免出现循环刷新。

## 验收命令

提交前建议至少执行：

```bash
npm run typecheck
npm run build
```

如果只想检查某个文件，也可以用 ESLint 单独扫。

## 目录说明

```text
admin-frontend
├─ src/app                 页面入口
├─ src/components          页面组件与业务组件
├─ src/config              链、合约、代币、wagmi 配置
├─ src/lib                 合约 ABI、工具函数和公共逻辑
├─ package.json            脚本与依赖
└─ README.md               当前说明文档
```

## 当前定位

这个管理端现在更偏“协议运营后台”而不是通用 CMS，重点是：

- 让部署后的人能快速看懂协议当前状态
- 让农场、金库、代币配置这些管理动作可以直接落地
- 让本地链和测试网联调时，问题能尽量快定位
