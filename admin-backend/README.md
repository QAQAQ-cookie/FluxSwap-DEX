# FluxSwap 管理后端

这是 FluxSwap 管理端的后端服务。它负责保存管理端业务数据、管理员钱包签名认证、金库治理操作元数据、审计日志、链上同步游标，以及本地开发环境的数据维护。

链上合约仍然是最终事实来源。管理后端不会保管私钥，也不会绕过钱包替用户发交易；它只保存“管理端需要恢复和审计的信息”。

## 技术栈

- Go
- Gin
- GORM
- PostgreSQL
- go-ethereum

## 启动方式

管理后端默认通过 Docker Compose 启动，数据库复用主后端的 PostgreSQL 实例，并使用独立数据库 `fluxswap_admin`。

本地开发时，优先修改 `admin-backend/.env`，`docker compose` 会自动读取这个文件里的配置。

```powershell
docker compose up -d --build
```

健康检查：

```powershell
Invoke-RestMethod http://localhost:8081/api/health
```

停止服务：

```powershell
docker compose down
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `ADMIN_APP_ENV` | 运行环境，本地默认 `local` |
| `ADMIN_HTTP_ADDR` | API 监听地址，本地默认 `:8081` |
| `ADMIN_ALLOWED_ORIGINS` | 允许跨域访问的前端地址 |
| `ADMIN_DATABASE_DSN` | 管理端数据库连接串 |
| `ADMIN_WALLETS` | 管理员钱包白名单，多个地址用英文逗号分隔；本地环境为空时允许任意有效钱包登录 |
| `ADMIN_SESSION_TTL_HOURS` | 管理员登录会话有效小时数 |
| `ADMIN_CHAIN_ID` | 当前部署绑定的唯一链 ID |
| `ADMIN_CHAIN_NAME` | 当前部署链的展示名称 |
| `ADMIN_RPC_URL` | 当前部署链的 RPC 地址 |
| `ADMIN_TREASURY_ADDRESS` | 当前部署链的金库合约地址 |
| `ADMIN_SYNC_LOOKBACK_BLOCKS` | 后续链上同步任务的默认回看区块数 |

本地 Docker Compose 会读取同名环境变量。`ADMIN_APP_ENV=local` 且 `ADMIN_WALLETS` 为空时，会放宽为任意有效钱包都能登录，方便本地联调；只要配置了 `ADMIN_WALLETS`，即使是本地环境也会按白名单校验。非本地环境必须配置 `ADMIN_WALLETS`，否则所有受保护写接口都会拒绝访问。

示例：

```powershell
$env:ADMIN_WALLETS="0x你的管理员钱包地址"
$env:ADMIN_CHAIN_ID="31337"
$env:ADMIN_CHAIN_NAME="Local Hardhat"
$env:ADMIN_RPC_URL="http://host.docker.internal:8545"
$env:ADMIN_TREASURY_ADDRESS="0x你的金库合约地址"
docker compose up -d --build
```

管理端按单链部署：本地、Sepolia 与正式网络分别使用自己的环境变量、数据库和服务实例，不在同一个实例中同时配置多条链。

生产环境会做额外启动校验，避免误连本地资源：

- `ADMIN_WALLETS` 必须至少配置一个有效管理员钱包。
- `ADMIN_DATABASE_DSN` 不能为空，且不能指向 `localhost`、`127.0.0.1`、`0.0.0.0`、`host.docker.internal`。
- `ADMIN_ALLOWED_ORIGINS` 不能使用 `*`，也不能包含本地前端地址。
- `ADMIN_CHAIN_ID`、`ADMIN_RPC_URL` 和 `ADMIN_TREASURY_ADDRESS` 必须完整配置；生产环境不能使用 Hardhat 常见链 ID `31337`、`1337`，RPC 也不能指向本地地址。

## 认证模型

管理端前端在调用受保护写接口前，会走一次钱包签名登录：

1. 前端调用 `POST /api/admin/auth/nonce`，提交钱包地址。
2. 后端校验钱包权限。本地环境空白名单会放行任意有效钱包；配置白名单或非本地环境时，会校验钱包是否在 `ADMIN_WALLETS` 内。
3. 后端生成一次性随机数和待签名消息。
4. 前端调用钱包签名消息。
5. 前端调用 `POST /api/admin/auth/verify`，提交随机数和签名。
6. 后端恢复签名地址，再次确认地址符合管理端权限规则。
7. 后端创建登录会话，返回短期 token。
8. 前端后续写接口携带 `Authorization: Bearer <token>`。

token 只保存哈希到数据库，明文只返回给前端一次。随机数只能使用一次，过期随机数和过期会话会在服务启动或维护接口中清理。

## 数据表

| 表名 | 用途 |
|---|---|
| `admin_auth_nonces` | 管理员钱包登录随机数 |
| `admin_sessions` | 管理员登录会话 |
| `treasury_operations` | 金库治理操作详情 |
| `admin_operation_logs` | 管理端操作审计日志 |
| `chain_sync_cursors` | 链上事件同步游标 |

表和字段启动时会自动迁移，并给 PostgreSQL 添加中文备注。字段名和状态码使用英文，展示字段使用中文，方便数据库里直接查看。

## 接口

认证接口：

```txt
POST /api/admin/auth/nonce
POST /api/admin/auth/verify
```

金库治理操作：

```txt
POST  /api/admin/treasury/operations
GET   /api/admin/treasury/operations
GET   /api/admin/treasury/operations/:operationId
PATCH /api/admin/treasury/operations/:operationId/status
```

日志：

```txt
GET /api/admin/logs
```

链上同步游标：

```txt
GET  /api/admin/sync/cursors
POST /api/admin/sync/cursors
```

维护接口：

```txt
POST /api/admin/maintenance/cleanup
POST /api/admin/maintenance/reset-local-data
```

写接口需要管理员登录 token；查询接口保持公开，方便管理端页面刷新和排查数据。

## 金库操作校验

管理后端会对金库治理操作做三层校验：

- 请求里的 `chainId` 必须等于当前部署的 `ADMIN_CHAIN_ID`。
- 请求里的金库地址必须匹配该链配置中的 `treasuryAddress`。
- 后端会读取该链配置里的 `rpcUrl`，调用链上的 `operationReadyAt(bytes32)`，确认操作确实存在或已经被链上消费。

这能避免前端误把其他链、其他金库或不存在的 operationId 写进管理数据库。

## 本地链重启后的清理

本地 Hardhat 链重启后，管理端数据库里保存的旧金库操作、日志和游标可能已经不再对应新链。可以在管理员登录后调用：

```txt
POST /api/admin/maintenance/reset-local-data
```

它只清理管理端自己的业务表，不会清理主后端业务库，也不会清理链上数据。

## 开发验证

```powershell
go test ./...
```
