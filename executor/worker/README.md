# Worker Modules

褰撳墠鐩綍鐢ㄤ簬鏀炬墽琛屽櫒鍚庡彴浠诲姟妯″潡銆?
褰撳墠鍖呭惈锛?
- `executor/`
  - 鎵弿骞舵墽琛?`open` 鐘舵€佽鍗?- `indexer/`
  - 璁㈤槄骞跺洖鍐欓摼涓婁簨浠?
褰撳墠琛屼负锛?
- `executor`
  - 鍙壂鎻忎笌褰撳墠 `chainId + settlementAddress` 鍖归厤鐨?`open` 璁㈠崟
  - 鍏堣皟鐢ㄩ摼涓?`canExecuteOrder`
  - 鑻ラ摼涓婃姤浠峰凡婊¤冻鏉′欢锛屽啀閲嶆柊浼扮畻鈥滃綋鍓嶆墍闇€鎵ц璐光€?  - 鍙湁褰?`绛惧悕 executorFee >= 褰撳墠鎵€闇€ executorFee` 鏃讹紝鎵嶇湡姝ｅ彂璧?`executeOrder`
  - 鑻ユ墽琛岃垂涓嶈冻锛屼笉鎻愪氦閾句笂浜ゆ槗锛屽彧鏇存柊锛?    - `lastRequiredExecutorFee`
    - `lastFeeCheckAt`
    - `lastExecutionCheckAt`
    - `lastBlockReason`
    - `statusReason`

- `indexer`
  - 褰撳墠鐩戝惉锛?    - `OrderExecuted`
    - `NonceInvalidated`
  - `OrderExecuted` 浼氬洖鍐欙細
    - `status = executed`
    - `executedTxHash`
    - `settledAmountOut`
    - `settledExecutorFee`
  - `NonceInvalidated` 浼氭妸瀵瑰簲娲昏穬璁㈠崟鍥炲啓涓?`cancelled`

璇存槑锛?
- 璁㈠崟鍒涘缓鏃惰褰曠殑鎵ц璐瑰揩鐓э紝鐢ㄤ簬璁㈠崟椤靛睍绀衡€滈浼版墽琛岃垂鈥濄€?- worker 鎵ц鍓嶉噸鏂拌绠楃殑鏄€滃綋鍓嶆墍闇€鎵ц璐光€濓紝浠呯敤浜庨鎺у垽鏂紝涓嶄細瑕嗙洊鐢ㄦ埛绛惧悕涓殑鍥哄畾 `executorFee`銆?
鍚姩鏂瑰紡锛?
```bash
go run ./cmd/executor -f ./executor.yaml
go run ./cmd/indexer -f ./executor.yaml
```


