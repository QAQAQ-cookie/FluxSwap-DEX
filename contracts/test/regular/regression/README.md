# Regression 测试说明

本目录用于锁定已经修过、后续最容易被改坏的高风险行为。

## 当前目录结构

- `treasury-accounting`
  - 金库记账、额度、支出与原生 ETH 相关回归点。
- `rewards-accounting`
  - 奖励储备、用户奖励、队列奖励与分账比例相关回归点。
- `router-pair-critical`
  - Router / Pair 的关键交易路径与敏感边界。
  - 当前仅覆盖标准 ERC20 / WETH 路径，不再包含 fee-on-transfer 相关回归点。
- `cross-contract-linkage`
  - 多合约联动、配置耦合、暂停传播与依赖一致性。

## 说明

- 回归测试优先锁单点风险，不追求重复完整业务流。
- 当前协议已明确不支持 `fee-on-transfer` / `taxed token`，因此相关回归项已移除。
