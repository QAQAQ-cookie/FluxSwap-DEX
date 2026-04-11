# Role Operators 测试说明

本目录用于存放“角色与操作员权限测试”。

这里的重点不是重复完整业务链路，而是验证 `owner`、`operator`、`pauser`、`admin` 等权限入口在角色轮换、权限收敛、暂停控制和关键依赖指针更新时不会发生静默漂移。

## 当前已完成的测试

### `FluxBuybackExecutor.test.ts`

- 验证 buyback 只允许 `owner / operator` 触发，且暂停后会被阻断
- 验证 buyback recipient 必须满足 treasury 约束，不能绕过金库策略
- 验证 treasury daily cap 与 approved spender 限额会落到 buyback 路径
- 验证 `setTreasury`、`setDefaultRecipient`、`recoverToken` 只允许 `owner` 调整
- 验证 `setOperator` 是唯一的 operator 角色入口，禁止直接 `grantRole / revokeRole / renounceRole`
- 验证 pause / unpause 仅允许 pauser 调用

### `FluxMultiPoolManager.test.ts`

- 验证奖励分发、pool claim、pool 更新等治理入口的 owner / operator 边界
- 验证 treasury pause 会联动阻断 manager 分发
- 验证 `setTreasury`、`setPoolFactory` 只允许 `owner` 治理
- 验证只有配置过的 `poolFactory` 可以代理 add / deactivate pool
- 验证 `setOperator` 是唯一的 operator 角色入口，不能绕过角色管控
- 验证 reward token recover 限制与 stray token recover 的 owner-only 边界

### `FluxRevenueDistributor.test.ts`

- 验证 `distributeTreasuryRewards`、`executeBuybackAndDistribute` 只允许 `owner / operator` 调用
- 验证 `setManager`、`setBuybackExecutor`、`setRevenueConfiguration`、`recoverToken` 只允许 `owner`
- 验证 pause / unpause 仅允许 pauser 调用，且 paused 状态会阻断两条分发入口
- 验证 `setOperator` 是唯一的 `OPERATOR_ROLE` 入口
- 验证 manager、buybackExecutor、reward token、treasury 指针保持一致
- 验证 ownership handoff 后 admin / pauser / operator 权限会同步收敛

### `FluxToken.test.ts`

- 验证 `setMinter` 只允许当前 owner 调用
- 验证只有持有 `MINTER_ROLE` 的账户可以执行 `mint`
- 验证 `DEFAULT_ADMIN_ROLE` 会随着 ownership handoff 迁移
- 验证 delegated minter 可主动 `renounceRole`，owner 仍可重新授予

## 当前状态

- `role-operators` 已覆盖 `FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken`
- 当前这一层已经形成核心角色治理基线

## 后续维护约束

- 若新增 operator-bearing 合约，应同步补充到本目录
- 若补充新的角色收敛规则或 ownership handoff 约束，应同步更新本 README
