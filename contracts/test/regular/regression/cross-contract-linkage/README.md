# cross-contract-linkage

本目录用于存放跨合约联动类回归测试。

## 当前已完成的回归测试

### `FluxCrossContractLinkageRegression.test.ts`

已覆盖的回归点：

- manager 与 buyback executor 的 treasury 指针一旦分叉，`FluxRevenueDistributor` 的两个入口都会拒绝执行。
- formal buyback 成功链路会把 treasury 内交易手续费正确拆分为“回购后销毁 + manager 奖励分发”。
- treasury pause 会向上游传播，阻断 manager 发奖、distributor 直发奖励、buyback 回购分发。
- managed pool 交接时会同步清理工厂映射与 manager 活跃状态，并允许同资产重建新池。
- managed pool 奖励配置从 `manager -> pool.syncRewards` 切换到 `treasury -> notifyRewardAmount` 后，旧奖励累计与新奖励发放都保持正确。
- distributor、manager、buybackExecutor 任一组件本地暂停时，对应分发链路都必须阻断，并且只有解除暂停后才允许恢复执行。

## 当前状态

- 原先列出的计划补充点已全部补齐。
