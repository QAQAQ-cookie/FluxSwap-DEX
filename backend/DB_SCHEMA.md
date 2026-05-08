# Backend Database Schema

这份文档描述当前 FluxSwap 后端在 PostgreSQL 中使用的核心表结构、职责边界、关键索引和典型读写路径。

当前数据库设计遵循三层拆分：

- `orders`
  - 保存订单定义态和主状态
- `order_runtime`
  - 保存订单运行态快照
- `order_activities`
  - 保存订单生命周期活动流

另外还有：

- `order_events`
  - 保存链上事件原始落库记录
- `sync_cursor`
  - 保存各消费者的同步进度

## 1. `orders`

### 作用

`orders` 是订单主表，保存一笔限价单的静态定义，以及面向系统协作的主状态字段。

它不再承载执行检查、交易哈希、链上对账结果等运行态信息。

### 核心字段

| 字段 | 含义 |
| --- | --- |
| `id` | 订单内部主键 |
| `chain_id` | 订单所属链ID |
| `settlement_address` | 结算合约地址 |
| `order_hash` | 订单哈希 |
| `maker` | 下单钱包地址 |
| `input_token` | 卖出代币地址 |
| `output_token` | 买入代币地址 |
| `amount_in` | 卖出数量，最小单位整数 |
| `min_amount_out` | 最少买入数量，最小单位整数 |
| `executor_fee` | 用户签名允许的最大执行奖励BPS |
| `executor_fee_token` | 执行奖励结算代币地址 |
| `trigger_price_x18` | 触发价格，18位精度整数 |
| `expiry` | 订单过期时间戳 |
| `nonce` | 订单Nonce |
| `recipient` | 成交收款地址 |
| `signature` | EIP-712签名 |
| `source` | 订单来源 |
| `status` | 主状态 |
| `created_at` | 创建时间 |
| `updated_at` | 最近更新时间 |

### 当前状态字段定位

`status` 只表达订单当前主阶段，例如：

- `open`
- `submitting_execute`
- `pending_execute`
- `pending_cancel`
- `executed`
- `cancelled`
- `expired`

更细的原因解释不再放在这张表里，而在 `order_runtime.status_reason` 中表达。

### 关键索引

| 索引名 | 作用 |
| --- | --- |
| `idx_order_hash_unique` | 约束 `chain_id + settlement_address + order_hash` 业务唯一 |
| `maker` 普通索引 | 支持按 maker 查询订单 |
| `status` 普通索引 | 支持按主状态扫描订单 |

## 2. `order_runtime`

### 作用

`order_runtime` 是订单运行态快照表，保存执行器、索引器、回执对账流程需要的动态字段。

这张表和 `orders` 是一对一关系。

### 核心字段

| 字段 | 含义 |
| --- | --- |
| `order_id` | 关联 `orders.id` |
| `status_reason` | 当前状态原因 |
| `estimated_gas_used` | 最近一次估算Gas使用量 |
| `gas_price_at_quote` | 最近一次报价时Gas价格 |
| `fee_quote_at` | 最近一次执行费报价时间 |
| `last_required_executor_fee` | 最近一次计算出的所需执行奖励 |
| `last_fee_check_at` | 最近一次执行费检查时间 |
| `last_execution_check_at` | 最近一次可执行性检查时间 |
| `last_block_reason` | 最近一次阻塞原因 |
| `settled_amount_out` | 实际成交输出数量 |
| `settled_executor_fee` | 实际支付执行奖励 |
| `submitted_tx_hash` | 最近一次执行提交交易哈希 |
| `executed_tx_hash` | 最近一次成交交易哈希 |
| `cancelled_tx_hash` | 最近一次撤单交易哈希 |
| `last_checked_block` | 最近一次链上对账区块号 |
| `created_at` | 创建时间 |
| `updated_at` | 最近更新时间 |

### 设计意图

这张表存在的意义，是把“订单定义”与“订单运行过程”分开：

- 前者更稳定
- 后者更新频繁
- 后者经常带时间戳、交易哈希、链上对账中间态

拆开后，`orders` 不再被运行态噪音污染，活动流和查询聚合也更清楚。

### 关键索引

| 索引名 | 作用 |
| --- | --- |
| `order_runtime_order_id_key` | 约束每个订单只允许一条运行态快照 |
| `last_execution_check_at` 普通索引 | 支持按最久未检查顺序扫描 open 订单 |

## 3. `order_activities`

### 作用

`order_activities` 保存订单生命周期中的业务活动轨迹，用于：

- 前端活动时间线展示
- 后台排查订单状态流转
- 区分“为什么变成这样”和“什么时候变成这样”

它不替代 `orders.status`，也不替代 `order_runtime`，而是记录流转事件本身。

### 核心字段

| 字段 | 含义 |
| --- | --- |
| `order_id` | 关联订单主键 |
| `chain_id` | 订单所属链ID |
| `settlement_address` | 结算合约地址 |
| `order_hash` | 订单哈希 |
| `activity_type` | 活动类型 |
| `from_status` | 变更前状态 |
| `to_status` | 变更后状态 |
| `reason_code` | 原因代码 |
| `reason_detail` | 原因详情 |
| `source` | 来源模块，如 rpc / executor / indexer |
| `actor_address` | 触发动作的钱包地址 |
| `tx_hash` | 关联交易哈希 |
| `block_number` | 关联区块号 |
| `log_index` | 关联日志索引 |
| `dedupe_key` | 去重键 |
| `payload_json` | 附加负载 |
| `occurred_at` | 活动发生时间 |
| `created_at` | 入库时间 |

### 当前活动类型

例如：

- `order_created`
- `execution_claimed`
- `execution_submitted`
- `execution_confirmed`
- `cancel_requested`
- `cancel_confirmed`
- `order_expired`
- `order_reopened`
- `chain_state_reconciled`
- `reorg_restored`

### 关键索引

| 索引名 | 作用 |
| --- | --- |
| `idx_order_activity_order` | 支持按链、结算合约、订单哈希查活动流 |
| `order_activities_dedupe_key_key` | 防止同一活动重复写入 |
| `activity_type` / `reason_code` / `source` 索引 | 支持排查和筛选 |

## 4. `order_events`

### 作用

`order_events` 保存索引器采集到的原始链上事件记录，用于：

- 去重
- 回放
- Reorg 撤销与重建
- 支撑从链上事件恢复订单状态

### 核心字段

| 字段 | 含义 |
| --- | --- |
| `chain_id` | 链ID |
| `contract_address` | 事件来源合约地址 |
| `event_name` | 事件名称 |
| `tx_hash` | 交易哈希 |
| `log_index` | 日志索引 |
| `block_number` | 区块号 |
| `order_hash` | 关联订单哈希 |
| `maker` | 关联钱包地址 |
| `nonce` | 订单Nonce |
| `min_valid_nonce` | 最小有效Nonce |
| `gross_amount_out` | 总输出数量 |
| `recipient_amount_out` | 收款输出数量 |
| `executor_fee_amount` | 执行奖励数量 |
| `observed_at` | 事件观测时间 |

### 关键索引

| 索引名 | 作用 |
| --- | --- |
| `idx_order_events_unique` | 保证 `chain_id + tx_hash + log_index` 唯一 |
| `event_name` / `block_number` / `order_hash` 索引 | 支持事件回放和按订单定位 |

## 5. `sync_cursor`

### 作用

`sync_cursor` 保存各个消费者当前同步到哪里了，主要给：

- indexer
- routergraph
- 其他需要断点续跑的消费者

### 核心字段

| 字段 | 含义 |
| --- | --- |
| `cursor_name` | 游标名称 |
| `chain_id` | 所属链ID |
| `cursor_value` | 兼容旧逻辑的游标值 |
| `block_number` | 当前同步到的区块号 |
| `block_hash` | 当前同步到的区块哈希 |
| `updated_at` | 更新时间 |

### 关键索引

| 索引名 | 作用 |
| --- | --- |
| `idx_sync_cursor_unique` | 约束同一消费者在同一链上只有一个游标 |

## 6. 表之间的关系

### `orders` 与 `order_runtime`

- 一对一
- `order_runtime.order_id -> orders.id`

职责分工：

- `orders`
  - 定义一笔订单是什么
- `order_runtime`
  - 记录它当前运行到了哪一步

### `orders` 与 `order_activities`

- 一对多

职责分工：

- `orders.status`
  - 现在处于哪个主状态
- `order_activities`
  - 是怎么一步步变到这个状态的

### `orders` 与 `order_events`

- 一对多，间接通过 `order_hash` / `maker + nonce`

职责分工：

- `order_events`
  - 保存链上原始事实
- `orders + order_runtime`
  - 保存当前归并后的业务结果

## 7. 典型读写路径

### 创建订单

1. RPC 校验签名和基础字段
2. 写入 `orders`
3. 同步生成 `order_runtime`
4. 记录 `order_activities(order_created)`

### 执行器扫描订单

1. 按 `orders.status = open`
2. 结合 `order_runtime.last_execution_check_at`
3. 更新 `order_runtime` 中的检查结果
4. 必要时推进 `orders.status`
5. 记录活动流

### 用户登记撤单

1. RPC 校验 `cancelTxHash`
2. 更新 `orders.status -> pending_cancel`
3. 更新 `order_runtime.cancelled_tx_hash / status_reason`
4. 记录 `cancel_requested`

### 索引器消费链上事件

1. 原始事件落入 `order_events`
2. 归并更新 `orders + order_runtime`
3. 记录 `order_activities`
4. 推进 `sync_cursor`

## 8. 当前设计原则

### 原则一：主状态只保留一份

订单当前主阶段只由 `orders.status` 表达，不在活动表重复维护“当前状态”。

### 原则二：运行态不回流污染订单定义

交易哈希、对账块高、估算Gas、阻塞原因等都留在 `order_runtime`，不再塞回 `orders` 表。

### 原则三：活动表记录轨迹，不承载快照

`order_activities` 只记录“发生了什么”，不替代 `orders` 或 `order_runtime` 成为最新状态快照。

### 原则四：链上原始事实单独保存

`order_events` 保留原始事件，便于去重、恢复、重放和 Reorg 处理。

## 9. 当前最适合前端的查询聚合

如果后面做查询接口，建议以后端聚合视角提供：

1. 订单详情
   - `orders + order_runtime`
2. 订单活动流
   - `order_activities`
3. 链上事件调试视图
   - `order_events`

这样前端不需要自己猜：

- 哪些字段是定义态
- 哪些字段是运行态
- 哪些字段是历史轨迹

数据库边界会清楚很多。
