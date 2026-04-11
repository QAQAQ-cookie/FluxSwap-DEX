# Pool Governance 测试说明

本目录用于存放“池治理测试”。

这里的重点不是普通功能正确性，而是验证与建池、池注册、奖励配置、治理交接、treasury 指针更新相关的 owner / setter 权限边界，确保治理变更会完整作用到存量池与后续新池，而不会留下静默失配状态。

## 当前已完成的测试

### `FluxPoolFactory.test.ts`

- 验证单币池、LP 池的创建与 manager 自动注册
- 验证 duplicate pool、防重复 handoff、同资产替代池重建等治理边界
- 验证 managed pool 奖励配置必须按 self-sync 规则原子更新
- 验证 factory owner 迁移后，对既有 managed pool 的治理能力仍然连续
- 验证工厂可以从 managed pool 回收未分配奖励

### `FluxSwapFactory.test.ts`

- 验证只有当前 `treasurySetter` 能更新 `treasury` 并迁移 setter 权限
- 验证 `setTreasurySetter` 会同步迁移 `DEFAULT_ADMIN_ROLE` 与 `TREASURY_SETTER_ROLE`
- 验证不能通过直接 `grantRole / revokeRole / renounceRole` 操作 `TREASURY_SETTER_ROLE`
- 验证存量 pair 也会跟随 factory 的最新 treasury 指针，把后续协议费打到新的 treasury

### `FluxSwapStakingRewards.test.ts`

- 验证 `rewardSource`、`rewardNotifier`、`ownership` 等池级治理入口只允许当前 owner 调整
- 验证 `rewardNotifier` 是独立执行角色，owner 本身不能绕过该角色直接发奖
- 验证进入或退出 self-sync 模式都必须通过 `setRewardConfiguration` 原子完成
- 验证 ownership handoff 后，旧 owner 会失去配置与 `recoverUnallocatedRewards` 权限

## 当前状态

- `pool-governance` 已覆盖 `FluxPoolFactory`、`FluxSwapFactory`、`FluxSwapStakingRewards`
- 当前已经形成池治理相关的核心权限基线

## 后续维护约束

- 若新增 factory 级治理能力，应同步登记到这里
- 若出现新的池级角色收敛规则，也应同步更新本 README
