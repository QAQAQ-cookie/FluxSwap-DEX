# Role Operators 测试说明

本目录用于存放“角色与操作员权限测试”。

这里的测试重点不是重复完整业务链路，而是把 owner、operator、pauser、admin 等权限入口单独拎出来，验证角色轮换、权限收敛、暂停控制，以及关键依赖指针在治理更新时不会发生静默漂移。

## 当前已完成的测试

### `FluxBuybackExecutor.test.ts`

- 验证 buyback 只能由 owner / operator 触发，且暂停后会被阻断。
- 验证 buyback recipient 必须受 treasury 约束，不能绕过金库。
- 验证 treasury daily cap 与 approved spender 约束会落到 buyback 路径上。
- 验证 `setOperator` 是唯一的 operator 角色入口，ownership 迁移后重叠 operator 权限会被清理。

### `FluxMultiPoolManager.test.ts`

- 验证奖励分发、pool claim、pool 更新等治理入口的 owner / operator 边界。
- 验证 treasury pause 会联动阻断 manager 分发。
- 验证 `setOperator` 是唯一的 operator 角色入口，不能直接 `grantRole` 绕过。
- 验证 reward token recover 限制，以及 ownership 迁移后的 operator 权限清理。

### `FluxRevenueDistributor.test.ts`

- 验证分发入口只允许 owner / operator 调用，且 `setOperator` 后执行权会随之轮换。
- 验证 `setManager`、`setBuybackExecutor`、`setRevenueConfiguration`、`recoverToken` 只能由 owner 执行。
- 验证 pause / unpause 只允许 pauser 角色调用，并且 paused 状态会阻断分发。
- 验证 `setOperator` 是唯一的 OPERATOR_ROLE 入口，禁止直接 `grantRole` / `revokeRole` / `renounceRole`。
- 验证 manager 与 buybackExecutor 的 reward token / treasury 指针必须保持一致。
- 验证 ownership 迁移后 admin / pauser 权限收敛，以及 owner 与 operator 重叠时的权限清理。

### `FluxToken.test.ts`

- 验证 `setMinter` 只能由当前 owner 调用，ownership handoff 后旧 owner 会失去 minter 管理权。
- 验证只有持有 `MINTER_ROLE` 的账户可以执行 `mint`，撤权后会立即失效。
- 验证 `DEFAULT_ADMIN_ROLE` 会随 ownership handoff 迁移，当前 owner 仍可通过 `grantRole` / `revokeRole` 直接治理 `MINTER_ROLE`。
- 验证 delegated minter 可以主动 `renounceRole`，且 owner 能按治理意图重新授予该角色。

## 当前状态

- `role-operators` 目录下的核心治理测试已覆盖 `FluxBuybackExecutor`、`FluxMultiPoolManager`、`FluxRevenueDistributor`、`FluxToken` 四个关键角色治理合约。
- 后续若新增 operator-bearing 合约，或补充新的角色收敛规则，应同步更新这里的清单。
