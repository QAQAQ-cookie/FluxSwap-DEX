# Integrated AMM 测试说明

本目录用于存放更偏系统级、经济安全视角的 AMM 测试。

## 当前覆盖

### `FluxSwap.test.ts`

- 覆盖 Factory、Router、Pair、ETH 路径、LP 增减仓、多角色交易、多跳交换、协议费、flash swap 等标准 AMM 主链路。
- 更偏向系统级行为与完整业务流，而不是单个函数边界。

## 兼容性说明

- 当前协议明确不支持 `fee-on-transfer` / `taxed token`。
- 因此本目录不再覆盖税币路径。
