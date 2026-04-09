# Permissions Governance 测试说明

本目录用于存放“权限与治理审计测试”。

这里的测试重点不是重复完整业务流程，而是把 owner、operator、pauser、admin、setter、multisig、guardian 等治理入口单独抽出来，验证：

- 权限边界是否清晰，非授权账户不能越权调用关键入口。
- 角色轮换、ownership handoff、setter handoff 后，旧权限是否被正确收敛。
- pause、timelock、treasury 指针、reward 配置等关键治理变更是否会完整作用到存量组件。
- 关键依赖之间的 token / treasury / pool 指针是否会在治理更新时发生静默失配。

## 目录分层

### `treasury-controls`

- 聚焦 `FluxSwapTreasury` 的金库控制面。
- 核对 multisig / guardian / operator / approved spender / timelock 的权限边界。

### `role-operators`

- 聚焦具备 owner / operator / pauser / admin 角色面的合约。
- 当前已覆盖 `FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken`。

### `pool-governance`

- 聚焦建池、池注册、池级奖励配置、池级 ownership handoff。
- 当前已覆盖 `FluxPoolFactory`、`FluxSwapFactory`、`FluxSwapStakingRewards`。

## 当前覆盖概览

- 金库治理：`FluxSwapTreasury`
- 角色治理：`FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken`
- 池治理：`FluxPoolFactory`、`FluxSwapFactory`、`FluxSwapStakingRewards`

## 当前状态

- `permissions-governance` 目录下的每个现有层级都应维护自己的 README，并把本层测试文件登记完整。
- 后续若新增新的治理分层、子目录或专项测试文件，应同步补充本 README 与对应子目录 README。
