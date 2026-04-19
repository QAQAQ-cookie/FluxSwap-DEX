# router-pair-critical

本子目录用于承载 Router / Pair 的关键回归风险。

## 当前范围

- 标准 ERC20 多跳路径协议费归属
- token / ETH 与 token / WETH 路径一致性
- permit 与非 permit 的移除流动性关键路径
- flash swap 成功 / 失败分支
- rounding 与 full unwind 边界

## 兼容性说明

- 当前协议已明确不支持 `fee-on-transfer` / `taxed token`。
- 因此税币 supporting 路径相关回归用例已移除。
