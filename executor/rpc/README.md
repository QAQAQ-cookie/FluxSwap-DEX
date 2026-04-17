# RPC Scaffold

褰撳墠鐩綍鎵胯浇鍩轰簬 `go-zero` 鐨?gRPC 鏈嶅姟灞傘€?
褰撳墠宸插叿澶囷細

- `proto/`
  - gRPC 鍗忚瀹氫箟
- `etc/`
  - RPC 閰嶇疆鏂囦欢
- `internal/logic`
  - RPC 涓氬姟閫昏緫
- `internal/server`
  - gRPC 鏈嶅姟娉ㄥ唽
- `internal/svc`
  - 鏈嶅姟涓婁笅鏂囦笌鍏变韩渚濊禆

褰撳墠鍙敤鎺ュ彛锛?
- `Executor/Ping`
- `Executor/CreateOrder`
- `Executor/CancelOrders`
- `Executor/ApplyOrderEvent`
- `Executor/GetOrder`

鎺ュ彛璇存槑锛?
- `CreateOrder`
  - 鏍￠獙绛惧悕璁㈠崟鍩虹瀛楁
  - 鍐欏叆璁㈠崟琛?  - 璁板綍绛惧悕閲岀殑鍥哄畾 `executorFee`
  - 濡傛灉褰撳墠閾惧鎴风鍙敤锛屼細鍦ㄥ垱寤烘椂椤烘墜璁板綍涓€浠解€滄墽琛岃垂浼扮畻蹇収鈥?- `CancelOrders`
  - 浣跨敤 `invalidateNoncesBySig` 鎻愪氦鎵归噺 nonce 浣滃簾浜ゆ槗
  - 鏈€缁堢姸鎬佺敱 indexer 鏍规嵁 `NonceInvalidated` 浜嬩欢鍥炲啓
- `ApplyOrderEvent`
  - 褰撳墠鍙繚鐣?`OrderExecuted` 浜嬩欢鍥炲啓鍏ュ彛
- `GetOrder`
  - 鎸?`chainId + settlementAddress + orderHash` 鏌ヨ璁㈠崟

褰撳墠璁㈠崟杩斿洖涓柊澧炰簡浠ヤ笅鎵ц璐圭浉鍏冲瓧娈碉細

- `executorFee`
- `executorFeeToken`
- `estimatedGasUsed`
- `gasPriceAtQuote`
- `feeQuoteAt`
- `lastRequiredExecutorFee`
- `lastFeeCheckAt`
- `lastExecutionCheckAt`
- `lastBlockReason`
- `settledAmountOut`
- `settledExecutorFee`

鍚姩鏂瑰紡锛?
```bash
go run ./cmd/rpc -f ./executor.yaml
```


