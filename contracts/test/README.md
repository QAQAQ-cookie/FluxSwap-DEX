# 测试总览

本目录用于集中管理项目当前的测试体系、分类边界和执行入口。

如果你想快速判断“这个项目现在测到了哪一层”，优先看这份总览；如果你想深入看某一类测试具体覆盖了什么，再进入对应子目录 README。

## 当前测试版图

| 大类 | 子目录 | 当前文件数 | 主要目标 | 主要工具 |
| --- | --- | ---: | --- | --- |
| 常规测试 | `regular/unit` | 11 | 单合约职责、参数校验、权限边界、状态迁移 | Hardhat |
| 常规测试 | `regular/integration` | 17 | 真实业务链路、跨合约状态传递、资产闭环 | Hardhat |
| 常规测试 | `regular/regression` | 4 | 高风险历史问题锁定、防止后续改坏 | Hardhat |
| 常规测试 | `regular/performance` | 1 | 基础 gas / 性能观测 | Hardhat |
| 权限与治理 | `permissions-governance` | 8 | owner / operator / guardian / multisig / timelock 治理边界 | Hardhat |
| 经济安全 | `economic-security` | 3 | 协议费、回购、销毁、分发、对抗场景下的经济结果对账 | Hardhat |
| Fuzz | `fuzz` | 25 | 大量随机输入、长序列状态扰动、边界条件补强 | Foundry |
| Invariant | `invariant` | 14 | 长序列下资金守恒、reserve 对账、LP 供给闭合、失败原子性 | Foundry |
| 静态分析 | `static-analysis` | 2 文档 | 结构性风险扫描与人工复核口径 | Solhint / Slither |

## 你现在这套测试的含义

- `unit` 解决“单个合约自己写对了吗”。
- `integration` 解决“真实业务串起来会不会断”。
- `regression` 解决“以前修好的高风险点以后会不会再坏”。
- `permissions-governance` 解决“治理入口会不会越权、错配或交接失效”。
- `economic-security` 解决“价值流和账本结果是否对得上”。
- `fuzz` 解决“随机输入和更长序列下会不会暴露边界问题”。
- `invariant` 解决“无论怎么调用，底层约束是否始终成立”。
- `static-analysis` 解决“结构性风险点有没有被工具和人工提早暴露”。

## 推荐阅读顺序

如果是你自己回看项目，建议按这个顺序理解：

1. 先看 `regular/unit/README.md`
2. 再看 `regular/integration/README.md`
3. 然后看 `regular/regression/README.md`
4. 再看 `permissions-governance/README.md`
5. 再看 `economic-security/README.md`
6. 最后看 `fuzz/README.md` 和 `invariant/README.md`

这样会从“功能正确”逐步走到“安全性和长期约束正确”。

## 常用执行入口

以下命令均以当前目录为 `contracts` 为前提：

```bash
npm run test:unit
npm run test:integration
npm run test:regression
npm run test:permissions-governance
npm run test:economic-security
npm run test:fuzz
npm run test:invariant
npm run test:static-analysis
```

补充说明：

- `regular / permissions-governance / economic-security` 主要走 Hardhat。
- `fuzz / invariant` 主要走 Foundry。
- `static-analysis` 的 npm 入口当前只封装了 `solhint`；`slither` 仍建议命令行直跑。

## 当前整体判断

按当前项目阶段，这套测试已经不是“只有基础单测”的状态，而是已经覆盖到：

- 功能正确性
- 跨合约业务闭环
- 回归锁定
- 权限与治理边界
- 经济安全对账
- 随机输入与长序列扰动
- 不变量约束
- 静态分析人工收口

如果后续没有重大架构变更，这里更适合做“维护与收口”，而不是再无上限扩测试面。

## 对应文档入口

- `regular/unit/README.md`
- `regular/integration/README.md`
- `regular/regression/README.md`
- `permissions-governance/README.md`
- `economic-security/README.md`
- `fuzz/README.md`
- `invariant/README.md`
- `static-analysis/README.md`
- `GoLiveChecklist.md`
