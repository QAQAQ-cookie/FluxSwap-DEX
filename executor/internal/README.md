# Internal Modules

当前目录用于放置执行器的通用业务模块。

规划中的模块包括：

- `domain/`: 领域模型与状态定义
- `repo/`: 数据访问层
- `app/`: 业务编排层
- `chain/`: 链上交互封装

当前已补充：

- `config/config.go`: 共享配置结构
- `repo/db.go`: PostgreSQL 的 Gorm 初始化入口
- `domain/order.go`: 订单模型
- `repo/order_repo.go`: 订单查询仓储
- `domain/sync_cursor.go`: 同步游标模型
- `repo/cursor_repo.go`: 同步游标仓储
- `domain/order_event.go`: 事件落库模型
- `repo/order_event_repo.go`: 事件落库仓储
- `app/order_event_service.go`: 订单事件回写服务

其余模块后续再逐步补充实现。
