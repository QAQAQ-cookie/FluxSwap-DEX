# 上线前检查清单

这份清单用于在“测试已经够用”之后，收口测试之外仍需要人工确认的上线项。

## 1. 编译与测试基线

- `npx hardhat compile` 可稳定通过。
- `forge build` 可稳定通过。
- `npm run test:unit` 通过。
- `npm run test:integration` 通过。
- `npm run test:regression` 通过。
- `npm run test:permissions-governance` 通过。
- `npm run test:economic-security` 通过。
- `npm run test:fuzz` 通过。
- `npm run test:invariant` 通过。
- `npm run test:static-analysis` 通过。
- `slither . --print human-summary` 已执行，并结合 `test/static-analysis/SlitherReport.md` 做过人工复核。

## 2. 部署参数确认

- `FluxToken` 的初始参数、cap、owner、minter 配置已确认。
- `FluxSwapFactory` 的 `treasury` 指针已确认。
- `FluxSwapTreasury` 的 `multisig / guardian / minDelay / operator` 已确认。
- `FluxMultiPoolManager` 的 `treasury / poolFactory / operator` 已确认。
- `FluxRevenueDistributor` 的 `treasury / manager / buybackExecutor / operator` 已确认。
- `FluxBuybackExecutor` 的 `treasury / router / defaultRecipient / operator` 已确认。
- 生产环境使用的 fee bps、daily cap、allowlist、spender 配置已逐项确认。

## 3. 权限与治理收口

- 所有 owner 都已经交到预期治理地址，而不是部署者临时地址。
- 所有 operator 都已经切换到正式地址。
- 不再需要的临时权限、测试地址、额外授权都已移除。
- `guardian` 仅保留暂停能力，没有误拿恢复或资金支配权限。
- timelock 流程已实测一遍：`schedule -> delay -> execute`。
- 关键 handoff 后旧地址已不能继续控制核心入口。

## 4. 金库与资金流确认

- treasury 的 allowlist 和 cap 与生产资产清单一致。
- 原生 ETH 与 ERC20 的日额度分别确认，不串账。
- buyback 收款地址、销毁地址、奖励分发地址都已确认。
- 需要回收或销毁的历史测试余额、测试 token、临时资金已清理。
- 不存在把 buyback / distribute 结果错误指向非 treasury 体系地址的配置。

## 5. 池子与奖励配置确认

- 需要上线的池子、pair、managed pool 清单已确认。
- `allocPoint` 配置与预期激励比例一致。
- self-sync / treasury direct notify 两种模式的实际使用方案已确认。
- 替代池、旧池停用、奖励迁移方案已明确。
- 真实 reward token 来源和补充流程已确认。

## 6. AMM 与路由参数确认

- 计划上线的交易对清单已确认。
- 初始流动性注入方案已确认。
- 需要支持的 fee-on-transfer 资产已确认。
- Router 依赖的 WETH 地址已确认。
- 如果存在多跳主路径，关键路径的流动性深度已确认足够。

## 7. 运维与应急准备

- pause / unpause 责任人和流程已明确。
- 紧急提取、奖励暂停、回购暂停的触发条件已明确。
- 生产监控需要关注的指标已列出：
  - treasury 余额变化
  - manager pending / undistributed 变化
  - pool 奖励同步异常
  - buyback 执行失败
  - pair reserve 异常波动
- 发生配置错误时，谁来 schedule / execute 修复操作已明确。

## 8. 文档与对外说明

- 合约地址表待部署后补齐。
- 核心参数表待部署后补齐。
- 权限结构图待最终地址落定后补齐。
- 风险披露中应保留静态分析的可豁免项说明。
- 测试总览、运行方式、已覆盖范围已和当前代码保持一致。

## 当前建议

如果现在进入“准备上线 / 准备审计 / 准备交付”阶段，这份清单里最值得优先逐项确认的是：

1. 正式 owner / operator / multisig / guardian 地址
2. treasury / manager / distributor / buybackExecutor 的指针一致性
3. 生产池子、奖励源、allocPoint、daily cap 的最终配置
4. `slither` 人工复核结论与当前代码是否仍一致
