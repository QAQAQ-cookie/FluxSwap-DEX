# Integrated AMM 测试说明

本目录用于存放“AMM 综合经济行为测试”。

当前已有文件：

### `FluxSwap.test.ts`

- 覆盖 Factory、Router、Pair、ETH 路径、LP 增减仓、多角色交易、多跳交换、协议费、flash swap、fee-on-transfer token 等 AMM 主链路。
- 这里更偏“系统级行为”与“完整业务流”，用于确认 DEX 在真实交互路径下整体可用。

## 当前状态

- 协议费基础行为已经在这里有覆盖。
- 更细的手续费归集、burn / distribute 比例、奖励 rounding 等经济细节，已经转由上层的 `fee-model` 子目录承接。