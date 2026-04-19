# 上线前检查清单

这份清单用于在“测试基本补齐”之后，继续确认上线前仍需要人工收口的关键项。

## 1. 编译与测试基线

- `npx hardhat compile` 可以稳定通过
- `forge build` 可以稳定通过
- `npm run test:unit` 通过
- `npm run test:integration` 通过
- `npm run test:regression` 通过
- `npm run test:permissions-governance` 通过
- `npm run test:economic-security` 通过
- `npm run test:fuzz` 通过
- `npm run test:invariant` 通过
- `npm run test:static-analysis` 通过
- `slither . --print human-summary` 已执行，并已结合 `test/static-analysis/SlitherReport.md` 做过人工复核

## 2. 部署参数确认

- `FluxToken` 的初始参数、cap、owner、minter 已确认
- `FluxSwapFactory` 的 `treasury` 指针已确认
- `FluxSwapTreasury` 的 `multisig / guardian / minDelay / operator` 已确认
- `FluxMultiPoolManager` 的 `treasury / poolFactory / operator` 已确认
- `FluxRevenueDistributor` 的 `treasury / manager / buybackExecutor / operator` 已确认
- `FluxBuybackExecutor` 的 `treasury / router / defaultRecipient / operator` 已确认
- 生产环境使用的 `fee bps`、`daily cap`、`allowlist`、`spender` 配置已逐项确认

## 3. 权限与治理收口

- 所有 `owner` 已切换到预期治理地址，而不是部署者临时地址
- 所有 `operator` 已切换到正式地址
- 不再需要的临时权限、测试地址、额外授权都已移除
- `guardian` 仅保留暂停能力，不保留资金管理或恢复类高权限
- timelock 流程已完整走通过一次：`schedule -> delay -> execute`
- 关键 handoff 完成后，旧地址不能继续控制核心入口

## 4. 金库与资金流确认

- Treasury 的 `allowlist` 与 `cap` 和生产资产清单一致
- 原生 ETH 与 ERC20 的额度分别确认，不串账
- buyback 收款地址、销毁地址、奖励分发地址均已确认
- 历史测试余额、测试 token、临时资金已清理
- 不存在把 buyback / distribute 结果错误指向非 Treasury 体系地址的配置

## 5. 池子与奖励参数确认

- 需要上线的池子、pair、managed pool 清单已确认
- `allocPoint` 配置与预期激励比例一致
- `self-sync / treasury direct notify` 两种模式的实际使用方案已确认
- 替代池、旧池停用、奖励迁移方案已明确
- 真实 reward token 来源和补充流程已确认

## 6. AMM 与路由配置确认

- 计划上线的交易对清单已确认
- 初始流动性注入方案已确认
- 已确认协议**不支持** `fee-on-transfer` / `taxed token`，生产环境不应接入此类资产
- Router 依赖的 `WETH` 地址已确认
- 若存在多跳主路径，关键路径流动性深度已确认足够

## 7. 运维与应急准备

- `pause / unpause` 责任人和流程已明确
- 紧急提款、奖励暂停、回购暂停的触发条件已明确
- 生产监控需要关注的指标已列出：
- Treasury 余额变化
- Manager `pending / undistributed` 变化
- Pool 奖励同步异常
- Buyback 执行失败
- Pair reserve 异常波动
- 若发生配置错误，谁来执行 `schedule / execute` 修复操作已明确

## 8. 文档与对外说明

- 合约地址表待部署后补齐
- 核心参数表待部署后补齐
- 权限结构图待最终地址确定后补齐
- 风险披露中应保留静态分析可豁免项的解释说明
- 测试总览、运行方式、已覆盖范围与当前代码保持一致

## 当前建议

如果现在进入“准备上线 / 准备审计 / 准备交付”阶段，最值得优先逐项确认的是：

1. 正式 `owner / operator / multisig / guardian` 地址
2. `treasury / manager / distributor / buybackExecutor` 指针一致性
3. 生产池子、奖励来源、`allocPoint`、`daily cap` 的最终配置
4. `slither` 人工复核结论是否仍与当前代码一致
