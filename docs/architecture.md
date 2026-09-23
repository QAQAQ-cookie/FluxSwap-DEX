# FluxSwap 架构说明

`docs/images/architecture/` 保存项目架构和核心业务流程图，便于在 README、简历或项目答辩中直接引用。

| 文件名 | 内容 |
| --- | --- |
| `system-overview.png` | 前端、合约、子图、业务后端、管理后端之间的关系 |
| `contract-relations.png` | FluxCore 部署的核心合约之间的调用、地址依赖和资金流向 |
| `limit-order-flow.png` | 限价单从签名、后端接收、执行器执行到索引器回写的流程 |
| `liquidity-flow.png` | 添加/移除流动性、LP 份额变化以及子图同步流程 |

## 系统总览

![FluxSwap 系统架构](images/architecture/system-overview.png)

## 合约关系

![FluxSwap 合约关系图](images/architecture/contract-relations.png)

合约关系可以按四条主链路理解：

1. AMM 链路：`FluxSwapFactory` 创建 `FluxSwapPair`，`FluxSwapRouter` 负责兑换和流动性操作。
2. 限价单链路：`FluxSignedOrderSettlement` 校验订单签名和执行条件，再通过 `FluxSwapRouter` 调用 Pair 完成结算；后端 Executor 只负责提交执行交易。
3. 质押奖励链路：`FluxPoolFactory` 创建 LP 池或单币池，`FluxMultiPoolManager` 维护池权重和奖励累计值，具体质押池负责用户份额和奖励领取。
4. 金库收入链路：`FluxSwapTreasury` 管理协议资产和治理权限，`FluxRevenueDistributor` 分配收入，`FluxBuybackExecutor` 从金库取资金并通过 Router 执行回购，奖励资产由 `FluxToken` 承载。

## 限价单流程

![FluxSwap 限价单流程](images/architecture/limit-order-flow.png)

## 流动性流程

![FluxSwap 流动性流程](images/architecture/liquidity-flow.png)

## 模块关系

1. 客户端前端负责连接钱包、读取子图和链上状态，并发起交易、流动性、质押和限价单操作。
2. 管理端前端负责读取协议运营状态，并通过钱包签名发起金库治理、农场和奖励相关操作。
3. AMM、金库、质押池和限价单结算合约部署在目标 EVM 网络上，链上状态是最终事实来源。
4. 业务后端只负责限价单接入、执行器、链上事件回写和订单相关持久化，不代替用户签名。
5. 管理后端保存治理操作元数据、管理员会话和审计记录，用于恢复管理端需要的业务信息；它不保管私钥，也不绕过钱包发交易。
6. 子图异步索引工厂和交易对事件，为市场、池详情、交易量和流动性展示提供 GraphQL 数据。

## 关键数据流

### 普通交易和流动性

```text
客户端前端 -> 钱包 -> Router / Pair 合约 -> 链上事件
                                      -> Graph Node -> 子图 GraphQL -> 客户端前端
```

### 限价单

```text
客户端签名 -> 业务后端 RPC -> PostgreSQL
                         -> Executor -> Settlement 合约 -> Pair / Router
                         -> Indexer -> 订单状态和事件回写
```

### 金库治理

```text
管理端前端 -> 管理员钱包签名 -> Treasury 合约
            -> 管理后端保存治理参数和审计记录
            -> 达到延迟后由多签执行治理操作
```

## 环境边界

- 本地环境使用 Hardhat、Graph Node 本地实例和 Docker Compose。
- Sepolia 环境使用已部署的合约、Sepolia RPC、独立的子图数据和业务数据库。
- 不同链不应复用同一套合约地址、数据库游标或管理端治理记录。
