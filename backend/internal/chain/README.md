# Chain Modules

这个目录保存后端真实使用的链上交互代码。

## 文件说明

- `flux_signed_order_settlement.go`
  - 使用 `abigen` 基于 `FluxSignedOrderSettlement` 最新编译产物生成。
  - 当前 `SignedOrder` 使用 `maxExecutorRewardBps`，表示执行器最多可拿走 surplus 的比例上限。
- `flux_swap_router.go`
  - 使用 `abigen` 基于 `FluxSwapRouter` 最新编译产物生成。
  - 用于查询兑换路径、估算执行成本对应的输出代币数量。
- `settlement_client.go`
  - 封装执行器使用的链上读写能力。
  - 负责读取订单报价、检查订单是否可执行、估算执行成本、提交执行交易、校验撤单交易和读取回执。
- `order_signature.go`
  - 按合约一致的 EIP-712 规则计算订单哈希和签名摘要。

## SignedOrder 数值口径

- `amountIn`：输入代币最小单位整数。
- `minAmountOut`：输出代币最小单位整数。
- `triggerPriceX18`：按输入/输出代币 `decimals` 归一后的价格整数，并统一放大到 `1e18`。
- 执行器把数据库中的这些整数字段直接组装进 `SignedOrder` 后调用合约，不会在执行前再做一次“小数转精度”。
- 合约在执行和 `canExecuteOrder` 时，也会把链上实时报价按同一口径归一后，再与 `triggerPriceX18` 比较。

## 当前限价单费用模型

- 用户签名里不再写固定 `executorFee` 数量。
- 用户签名里写 `maxExecutorRewardBps`，表示执行器最多可拿走成交 surplus 的多少比例。
- 执行器执行前会读取当前报价，计算：
  - `surplus = amountOut - minAmountOut`
  - `maxExecutorReward = surplus * maxExecutorRewardBps / 10000`
- 执行器再根据当前 gas 成本估算本次需要的 `executorReward`。
- 链上 `executeOrder` 会再次校验 `executorReward <= maxExecutorReward`，并保证用户至少收到 `minAmountOut`。

## 重新生成 binding

如果 `FluxSignedOrderSettlement.sol` 有改动，建议按下面顺序重新生成 `flux_signed_order_settlement.go`。

### 1. 重新编译合约

在 `contracts` 目录下执行：

```bash
npx hardhat clean
npx hardhat compile
```

### 2. 从最新 artifact 提取 ABI

下面这条命令在 Windows PowerShell 下可直接执行，会从最新编译产物里提取 `abi` 字段，并写成无 BOM 的 UTF-8 文件，避免 `abigen` 读取时报 `invalid character 'ï'`：

```powershell
$artifact = "..\\contracts\\artifacts\\contracts\\FluxSignedOrderSettlement.sol\\FluxSignedOrderSettlement.json"
$abiOut = ".\\internal\\chain\\FluxSignedOrderSettlement.abi.json"
$json = Get-Content $artifact -Raw | ConvertFrom-Json
$abi = $json.abi | ConvertTo-Json -Depth 100
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($abiOut, $abi, $utf8NoBom)
```

### 3. 重新生成 Go binding

在 `backend` 目录下执行：

```bash
go run github.com/ethereum/go-ethereum/cmd/abigen --abi ./internal/chain/FluxSignedOrderSettlement.abi.json --pkg chain --type FluxSignedOrderSettlement --out ./internal/chain/flux_signed_order_settlement.go
```

如果本机已经把 `abigen` 加进了 PATH，也可以把上面的 `go run github.com/ethereum/go-ethereum/cmd/abigen` 换成直接执行 `abigen`。
