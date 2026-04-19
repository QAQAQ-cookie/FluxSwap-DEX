# Internal Modules

这个目录对应后端的“内部共享层”。

它存放后端跨进程、跨模块复用的基础能力，供进程入口层、RPC 接口层与后台任务层共同使用。

## 目录结构

- `app/`
  - 应用服务与跨模块业务编排
- `chain/`
  - 链上交互与合约 binding 封装
- `config/`
  - 共享配置结构
- `domain/`
  - 领域模型
- `repo/`
  - 数据访问层

## 层级定位

- 正式职责名
  - 内部共享层
- 主要服务对象
  - `cmd/` 进程入口层
  - `rpc/` RPC 接口层
  - `worker/` 后台任务层
- 主要目标
  - 把可复用的配置、模型、仓储、链客户端与应用服务集中在一处，避免重复实现

## 各模块职责

### `app/`

当前主要包括：

- `health_server.go`
  - Executor / Indexer 健康检查服务
- `order_event_service.go`
  - 链上事件应用服务

当前职责：

- 聚合运行状态
- 提供健康检查 HTTP 服务
- 负责把链上事件以事务方式写入数据库并更新订单状态

### `chain/`

当前主要包括：

- `flux_signed_order_settlement.go`
  - 结算合约 Go binding
- `flux_swap_router.go`
  - Router 合约 Go binding
- `order_signature.go`
  - 订单哈希、EIP-712 摘要与签名校验工具
- `settlement_client.go`
  - 结算客户端

当前职责：

- 本地验签
- 计算订单摘要
- 查询订单是否可执行
- 估算执行费
- 发起订单执行交易
- 校验用户已提交的批量 nonce 作废交易
- 查询交易回执

### `config/`

- 定义统一配置结构
- 供所有进程入口与共享模块复用

### `domain/`

当前主要模型包括：

- `order.go`
  - 订单模型
- `order_event.go`
  - 订单事件模型
- `sync_cursor.go`
  - 同步游标模型

### `repo/`

当前主要包括：

- `db.go`
  - 数据库连接初始化
- `migrate.go`
  - 自动迁移入口
- `order_repo.go`
  - 订单仓储
- `order_event_repo.go`
  - 事件仓储
- `cursor_repo.go`
  - 游标仓储

当前职责：

- 初始化数据库连接
- 自动迁移
- 订单读写
- 订单事件读写
- 游标读写

## 当前关键实现

### 事件写库事务化

- `order_event_service.go` 当前把“事件落库 + 订单状态更新”放在同一个数据库事务内
- 用于避免出现“事件表已写，但订单状态未更新”的半成功状态

### 精确游标续跑

- `cursor_repo.go` 当前保存 `blockNumber + logIndex`
- 用于 indexer 精确续跑

### 本地验签与摘要计算

- `order_signature.go` 当前按结算合约一致的 EIP-712 规则计算订单哈希与摘要
- 在订单写库前即可完成签名真伪校验

### 懒初始化链 ABI

- `chain` 层已经改为按需初始化 ABI
- 避免包加载阶段因 ABI 解析失败直接 `panic`

## 测试覆盖

当前已补的重点内部层测试包括：

- `app/health_server_test.go`
- `app/order_event_service_test.go`
- `chain/settlement_client_test.go`
- `config/config_test.go`
- `repo/cursor_repo_test.go`
- `repo/order_repo_test.go`
