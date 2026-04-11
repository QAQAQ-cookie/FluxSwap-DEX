# Fee Model 测试说明

本目录用于存放“手续费 / 收入分账模型测试”。

这里的关注点不是权限边界，也不是单纯把业务流跑通，而是把每一笔价值流拆开做精确对账。

当前重点核对：

- swap 输入中的协议费是否按 `5 bps` 正确沉淀到 treasury
- treasury handoff 后，新旧 treasury 的收入归属是否隔离
- revenue buyback 后的 treasury 剩余、burn 数量、manager 分发数量是否能和 `buybackBps`、`burnBps` 对上
- multi-pool manager 在整数除法下产生的舍入余量是否保存在 `undistributedRewards` 并在后续回补

## 当前测试文件

### `FluxFeeModel.test.ts`

- 校验单跳连续交易的协议费累计
- 校验多跳路径上每一跳输入代币的协议费归集
- 校验 factory 切换 treasury 指针后的手续费不会串账
- 校验 revenueDistributor 的 buyback / burn / distribute 精确分账
- 校验 manager 的奖励舍入余量回补逻辑

## 当前状态

- 这一层已经承接了 `economic-security` 里最需要精确对账的部分
- 当前覆盖已经落在“归集口径”“分账口径”“舍入口径”“跨组件连续性”四条主线上
