# Treasury Controls 测试说明

本目录用于存放“金库控制测试”。

这里的测试重点不是普通转账功能，而是验证 `FluxSwapTreasury` 作为协议金库时，multisig、guardian、operator、approved spender、timelock、daily cap、allowlist 等控制面是否按预期工作。

## 当前已完成的测试

### `FluxSwapTreasury.test.ts`

- 验证 `setOperator`、`setGuardian`、`setMinDelay` 的 timelock 调度与执行边界，确保只有 multisig 可以排程治理操作。
- 验证已排程操作只能由 multisig `cancelOperation` 取消，取消后不能再执行。
- 验证 token allowlist、recipient allowlist、daily cap 会约束 operator 的金库拨付。
- 验证 guardian 可以 `pause`，而只有 multisig 可以 `unpause`。
- 验证 approved spender 的 timelock 授权、额度消耗、`consumeApprovedSpenderCap`、`pull`、`burn`、`revoke`，以及 no-return ERC20 兼容。
- 验证原生 ETH 的日限额分配路径。
- 验证 token / native emergency withdraw 都受 timelock 保护。
- 验证 DEX 协议费进入 treasury 后，仍然要经过受治理约束的 allowlist / cap 才能拨付。
- 验证 treasury `pause` 不会阻断协议费继续沉淀，但会阻断 operator 花费。

## 当前状态

- `treasury-controls` 当前已覆盖 `FluxSwapTreasury` 的核心金库治理路径。
- 后续若补充新的 timelock 操作类型、spender 消费模式或 native 资金治理入口，应同步更新这里的清单。
