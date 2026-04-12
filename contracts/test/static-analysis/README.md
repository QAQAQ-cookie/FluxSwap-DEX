# Static Analysis 测试说明

本目录用于存放静态分析相关说明、执行口径和人工复核结论。

静态分析的目标不是替代单元测试或审计，而是尽早把以下几类问题集中暴露出来：

- 权限边界是否清晰
- 外部调用和状态更新顺序是否存在风险
- 低级调用、内联汇编、返回值处理等结构性风险点是否可解释
- 是否存在明显不符合当前编码约束的实现

## 当前接入工具

### `solhint`

- 用途：规则检查、风格约束、基础静态扫描
- 运行命令：`npm run static:solhint`
- 聚合命令：`npm run test:static-analysis`
- 当前配置文件：`contracts/.solhint.json`
- 说明：当前 npm 脚本层只封装了 `solhint`，因此 `test:static-analysis` 现阶段等价于执行一次 `solhint`

当前扫描口径：

- 实际命令是 `solhint "contracts/**/*.sol"`
- 结合 `.solhint.json` 的 `excludedFiles`，当前基线主要覆盖生产实现合约
- 以下内容不纳入当前 `solhint` 结论：
  - `contracts/mocks/**/*.sol`
  - `interfaces/**/*.sol`
  - `node_modules/**/*.sol`

截至 2026-04-11，本地最新实跑结果为：

- `0 error`
- `4 warnings`

对应 warning 为：

- `contracts/FluxSwapPair.sol:204` - `avoid-low-level-calls`
- `contracts/FluxSwapFactory.sol:34` - `no-inline-assembly`
- `contracts/FluxSwapERC20.sol:25` - `no-inline-assembly`
- `contracts/FluxBuybackExecutor.sol:201` - `avoid-low-level-calls`

当前判断：

- 上述 4 条均已人工复核
- 现阶段归类为“可接受 / 可豁免”，不作为阻塞上线的问题
- 后续若进入外部审计，可把这 4 条作为显式披露项保留

### `slither`

- 用途：偏审计导向的安全静态分析
- 当前编译入口：`Foundry`
- 当前建议环境：`WSL Ubuntu`
- 建议命令：在 `contracts` 目录下执行 `slither . --print human-summary`
- 说明：`slither` 当前未封装进 npm runner，保持命令行直跑，避免把环境依赖隐藏在脚本后面

截至 2026-04-11，本地最新实跑摘要为：

- `high`: `5`
- `medium`: `30`
- `low`: `99`
- `informational`: `34`
- `optimization`: `6`

重要说明：

- 这个计数是工具原始摘要，不等于“已确认的生产漏洞数量”
- `Slither` 的统计会包含依赖、接口、测试辅助合约等内容
- DEX / AMM / lock / flash-callback 这类模式天然容易触发较多结构性提示
- 因此必须结合人工复核，不能直接按摘要计数下结论

人工复核后的收口报告见：

- `test/static-analysis/SlitherReport.md`

### `Foundry`

当前 `Slither` 依赖 `Foundry` 完成编译，因此静态分析的推荐执行环境仍然是 `WSL Ubuntu`。

建议先确认以下命令可用：

```bash
forge --version
slither --version
```

## 当前重点扫描合约

本轮人工收口重点关注以下生产实现：

- `contracts/FluxSwapTreasury.sol`
- `contracts/FluxRevenueDistributor.sol`
- `contracts/FluxMultiPoolManager.sol`
- `contracts/FluxBuybackExecutor.sol`
- `contracts/FluxSwapStakingRewards.sol`
- `contracts/FluxSwapFactory.sol`
- `contracts/FluxSwapRouter.sol`
- `contracts/FluxSwapPair.sol`

## 当前状态

- `solhint` 已接入并可稳定运行
- `slither` 已通过 Foundry 编译链跑通
- 当前静态分析基线已形成，可重复执行
- README 与 `test/static-analysis/SlitherReport.md` 的当前口径已对齐
- 当前未发现需要“立即修复后才能继续测试”的明确高危实现缺陷

## 已知限制

- `slither` 目前没有额外封装成 npm runner，`npm run test:static-analysis` 也不会代替它执行
- Windows 下若当前 shell 未直接配置 `forge` / `slither`，建议切到 `WSL Ubuntu` 运行
- 当前 WSL 环境会输出 `/etc/wsl.conf` 中 `user.default` 重复定义的提示
  - 该提示不影响本次 `slither` 成功执行
  - 但建议后续清理，避免环境噪音影响排错
- `slither` 摘要计数会随着工具版本、依赖版本、编译口径变化而波动

## 本目录文件

- `README.md`：静态分析执行口径与当前基线
- `SlitherReport.md`：`Slither` 人工复核后的收口结论
