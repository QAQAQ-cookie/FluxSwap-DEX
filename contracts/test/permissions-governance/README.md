# Permissions Governance 测试说明

本目录用于存放“权限与治理审计测试”。

这里的重点不是重复完整业务流程，而是把 `owner`、`operator`、`pauser`、`admin`、`setter`、`multisig`、`guardian` 等治理入口单独抽出来，验证以下问题：

- 权限边界是否清晰，未授权账户不能越权调用关键入口
- 角色轮换、ownership handoff、setter handoff 后，旧权限是否被正确收敛
- pause、timelock、treasury 指针、reward 配置等关键治理变更是否会完整作用到存量组件
- token / treasury / pool 指针在治理更新时是否会出现静默失配

## 目录分层

### `treasury-controls`

- 聚焦 `FluxSwapTreasury` 的金库控制面
- 核对 multisig / guardian / operator / approved spender / timelock / daily cap / allowlist 的治理边界

### `role-operators`

- 聚焦具备 owner / operator / pauser / admin 角色面的合约
- 当前已覆盖 `FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken`

### `pool-governance`

- 聚焦建池、池注册、奖励配置、治理交接、treasury 指针更新等池级治理入口
- 当前已覆盖 `FluxPoolFactory`、`FluxSwapFactory`、`FluxSwapStakingRewards`

## 当前覆盖概览

- 金库治理：`FluxSwapTreasury`
- 角色治理：`FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken`
- 池治理：`FluxPoolFactory`、`FluxSwapFactory`、`FluxSwapStakingRewards`

## 执行方式

运行全部权限治理测试：

```bash
npm run test:permissions-governance
```

运行单个测试文件：

```bash
npx hardhat test test/permissions-governance/role-operators/FluxRevenueDistributor.test.ts
```

## 当前状态

- `permissions-governance` 的三个现有子层级都已经建立 README，并登记了当前测试文件
- 当前这一层已形成稳定基线，适合继续在新增治理入口时按目录扩展

## 后续维护约束

- 新增治理分层、子目录或专项测试文件时，应同步更新本 README 与对应子目录 README
- 若某个治理入口从“功能测试”升级为“权限审计测试”，也应把它迁入本目录并补充登记
