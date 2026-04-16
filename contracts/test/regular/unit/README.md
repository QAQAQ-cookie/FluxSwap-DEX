# Unit 测试说明

本目录用于存放“单元测试”。

这里的单元测试重点不是串完整业务流程，而是把单个合约自身的职责、权限、参数校验、状态迁移和边界行为拆开验证。

这类测试通常有几个特点：
- 部署夹具尽量小，优先只覆盖一个合约或一个非常薄的依赖面。
- 重点验证构造参数、权限控制、角色轮换、暂停开关、记账边界、错误分支。
- 当某个行为更适合放在跨合约联调里验证时，会留给 `integration` 或 `regression` 目录处理。

## 当前已完成的单元测试

### `FluxToken.test.ts`

- 验证代币名称、符号、精度、cap、初始供应量初始化正确。
- 验证 `supportsInterface`、`MINTER_ROLE` 授权/撤销、owner 权限边界。
- 验证 mint 不可超过 cap，`burn` / `burnFrom` 正常工作。
- 验证 ownership 迁移后新 owner 接管管理权，并拒绝 same-owner / zero-address 类非法操作。

### `FluxSwapFactory.test.ts`

- 验证构造参数与 ERC165 支持。
- 验证交易对创建后会按双向 token 顺序正确登记。
- 验证 duplicate pair、identical token、zero-address 等非法建池路径会被拒绝。
- 验证 `treasurySetter` 的更新、交接，以及不能通过直接授予角色绕过受控移交。

### `FluxSwapPair.test.ts`

- 验证 pair 只能由 factory 初始化一次，且 token 参数必须合法。
- 验证首次注入流动性、储备更新、最小流动性锁定。
- 验证销毁 LP 后按比例赎回底层资产。
- 验证配置 treasury 后 swap 会正确沉淀协议费。
- 验证非法输出、非法接收方、恒定乘积被破坏等失败分支。
- 验证 flash swap 全额还款成功、少还手续费失败。
- 验证 permit、`transferFrom`、`skim`、`sync` 等底层行为。

### `FluxSwapRouter.test.ts`

- 验证构造参数、报价 helper、无效 helper 输入。
- 验证过期调用、非法 ETH path、缺失 pair 等前置校验。
- 验证 exact-input / exact-output 的 token、ETH 各类 swap 入口。
- 验证 token 与 ETH 流动性的添加、移除、permit 移除路径。
- 验证 `amountMin` / `liquidityMin` 等滑点保护。
- 验证 fee-on-transfer token 的 swap 兼容路径与非法 path 拒绝逻辑。

### `FluxSwapStakingRewards.test.ts`

- 验证构造参数与基础 stake / withdraw 输入校验。
- 验证单用户、多用户、多批次奖励分发与退出结算。
- 验证 `rewardSource` / `rewardNotifier` 原子更新与 self-sync 模式约束。
- 验证 ownership 迁移后的配置权限收敛。
- 验证 queued reward、rounding dust、首个质押用户入场时的奖励释放。
- 验证 treasury pause 对通知发奖的阻断。
- 验证 `recoverUnallocatedRewards` 只能回收未分配奖励，不能回收已归属用户奖励。
- 验证从 manager 自同步拉取奖励的路径。

### `FluxSwapLPStakingPool.test.ts`

- 验证 LP pair 必须来自目标 factory。
- 验证构造参数合法性与 LP pair 元信息暴露。
- 验证用户质押 LP 后能够从 treasury 奖励源获得 FLUX 奖励并正常退出。

### `FluxSwapTreasury.unit.test.ts`

- 验证构造参数与 treasury marker。
- 验证 timelock 操作的 schedule / cancel 只能由 multisig 执行。
- 验证 operator、guardian、minDelay 变更都受 timelock 保护。
- 验证 token allocate、allowlist、daily cap、次日额度重置。
- 验证 approved spender 的额度消耗、pull、burn、revoke 与 no-return ERC20 兼容。
- 验证 pause / unpause 权限边界。
- 验证原生 ETH 分配路径。
- 验证 token / native emergency withdraw 只能在 timelock 到期后执行。

### `FluxMultiPoolManager.unit.test.ts`

- 验证构造参数、ERC165 支持。
- 验证池子的添加、停用、`allocPoint` 统计，以及 poolFactory 代理操作权限。
- 验证奖励分发、pool claim、pool 配置更新、treasury 指针更新、poolFactory 指针更新。
- 验证暂停状态、treasury pause、非法 claim / distribute 的拒绝逻辑。
- 验证 reward token 不可被 recover，而无关 token 可被 recover。
- 验证 operator 轮换、禁止直接 `grantRole` 绕过、ownership 迁移后的权限清理。

### `FluxPoolFactory.unit.test.ts`

- 验证构造参数。
- 验证单币池、LP 池的创建与注册。
- 验证 managed pool 奖励配置的原子更新与后续细粒度更新。
- 验证 duplicate pool、unmanaged pool、self-sync 下半更新等非法路径。
- 验证 managed pool ownership handoff、旧池停用、同资产重建替代池。
- 验证工厂从 managed pool 回收未分配奖励。
- 验证 owner 迁移后治理能力仍然连续。

### `FluxBuybackExecutor.unit.test.ts`

- 验证构造参数与 ERC165 支持。
- 验证 buyback 会把回购结果打回 treasury。
- 验证 buyback 参数校验、recipient 必须受 treasury 约束。
- 验证 executor pause 与 treasury pause 都会阻断回购执行。
- 验证 treasury 与 default recipient 联动更新。
- 验证 operator 轮换与禁止直接角色突变。
- 验证 stray token recover 与 ownership 迁移后的重叠 operator 权限清理。

### `FluxRevenueDistributor.unit.test.ts`

- 验证构造参数与 ERC165 支持。
- 验证 treasury FLUX 直发奖励到 manager。
- 验证收入资产经 buyback 后再 burn / distribute 的分发链路。
- 验证 manager 与 buyback executor treasury 指针分叉时必须拒绝执行。
- 验证 pause、收入配置更新、BPS 边界。
- 验证 operator 权限管理、替换 buyback executor / manager 时的一致性约束。
- 验证 stray token recover 与 ownership 迁移后的权限清理。

### `FluxSignedOrderSettlement.unit.test.ts`

- 验证链下签名订单的哈希、EIP-712 验签、重复执行防重放与 nonce 失效逻辑。
- 验证 `ERC20 -> ERC20`、`ERC20 -> ETH` 以及“原生币输入语义按 WETH 结算”三类结算入口都能通过真实 Router 路径完成成交。
- 验证 `invalidateNoncesBySig` 的单 nonce 失效、批量 nonce 失效、重复 nonce 拒绝与签名校验语义。
- 验证触发价格未达到、订单过期、签名错误、执行器受限、暂停状态等关键失败分支。
- 验证 `canExecuteOrder` 与 `getOrderQuote` 的只读状态和 readiness reason 口径。

## 执行方式

- 运行全部单元测试：
  - `npm run test:unit`
- 运行单个单元测试文件：
  - `npx hardhat test test/regular/unit/FluxSwapTreasury.unit.test.ts`

## 当前状态

- 本目录下现有单元测试文件已全部登记到本 README。
- 后续若新增单元测试文件或扩展覆盖点，应同步更新这里的清单。
