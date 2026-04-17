# FluxSwap Executor

褰撳墠鐩綍鐢ㄤ簬閲嶅缓 FluxSwap 鐨勬墽琛屽櫒鍚庣銆?
褰撳墠宸茬粡鍏峰鐨勫熀纭€鑳藉姏锛?
- 鍒濆鍖?Go 妯″潡 `fluxswap-executor`
- 寮曞叆 `go-zero` 浣滀负鍚庣鍩虹妗嗘灦
- 鎻愪緵 go-zero gRPC 鏈嶅姟楠ㄦ灦涓庡彲杩愯鍏ュ彛
- 鎺ュ叆 `gorm + PostgreSQL`
- 鏀寔缁熶竴鏁版嵁搴撹嚜鍔ㄥ缓琛ㄤ笌鐙珛杩佺Щ鍛戒护
- 鏂板鐪熷疄鎺ュ彛 `Executor/CreateOrder`銆乣Executor/CancelOrders`銆乣Executor/ApplyOrderEvent`銆乣Executor/GetOrder`
- `Executor/CancelOrders` 宸插垏鎹负閾句笂鎾ゅ崟妯″紡锛氶€氳繃 `invalidateNoncesBySig` 鎻愪氦 nonce 澶辨晥浜ゆ槗锛屾渶缁堢姸鎬佺敱 indexer 鎸?`NonceInvalidated` 浜嬩欢鍥炲啓
- 褰撳墠鍚庣宸叉敮鎸佸崟瀹炰緥澶氶摼锛氬悓涓€涓?rpc / executor / indexer 杩涚▼鍙悓鏃跺姞杞藉鏉￠摼閰嶇疆锛屾寜 `chainId + settlementAddress` 鍒嗘祦
- 瀹炵幇璁㈠崟浠撳偍銆佷簨浠朵粨鍌ㄤ笌鍚屾娓告爣浠撳偍
- 瀹炵幇閾句笂浜嬩欢鍥炲啓鏈嶅姟 `internal/app/order_event_service.go`
- 瀹炵幇绱㈠紩鍣?`cmd/indexer`锛屾敮鎸佸洖琛ュ尯鍧?+ WebSocket 瀹炴椂璁㈤槄
- 瀹炵幇鎵ц鍣?`cmd/executor`锛屾敮鎸佸垽瀹氳鍗曟槸鍚﹀埌浠峰苟鐪熷疄鎻愪氦 `executeOrder` 浜ゆ槗

褰撳墠鐩綍缁撴瀯鑱岃矗锛?
- `rpc/`: gRPC 鍗忚涓庢帴鍙ｅ疄鐜?- `cmd/migrate`: 鏁版嵁搴撹縼绉诲叆鍙?- `internal/domain`: 璁㈠崟銆佷簨浠躲€佹父鏍囩瓑棰嗗煙妯″瀷
- `internal/repo`: PostgreSQL 鎸佷箙灞?- `internal/app`: 鍏变韩涓氬姟鏈嶅姟
- `worker/indexer`: 閾句笂浜嬩欢璁㈤槄涓庣姸鎬佸洖鍐?- `worker/executor`: 鍒颁环妫€娴嬩笌鎵ц浜ゆ槗鎻愪氦
- `cmd/indexer`: 绱㈠紩鍣ㄨ繘绋嬪叆鍙?- `cmd/executor`: 鎵ц鍣ㄨ繘绋嬪叆鍙?
褰撳墠宸插叿澶囩殑閾句笂鑷姩鍥炲啓鍩虹锛?
- `cmd/indexer`: 鐙珛鐨?indexer 鍚姩鍏ュ彛
- `worker/indexer/subscriber.go`: WebSocket 璁㈤槄鍣?- `internal/app/order_event_service.go`: 閾句笂浜嬩欢鍥炲啓鏈嶅姟

褰撳墠宸插叿澶囩殑鎵ц鍣ㄥ熀纭€锛?
- `cmd/executor`: 鐙珛鐨勬墽琛屽櫒鍚姩鍏ュ彛
- `worker/executor/worker.go`: 鎵弿璁㈠崟锛屽垽瀹氬彲鎵ц鎬э紝骞朵娇鐢ㄦ墽琛屽櫒绉侀挜鎻愪氦 `executeOrder`
- `worker/executor/worker.go`: 杞 `pending_execute` 璁㈠崟鍥炴墽锛岀‘璁や氦鏄撴垚鍔熸垨鍦ㄥけ璐ユ椂鍥為€€閲嶈瘯

鏁版嵁搴撳垵濮嬪寲鏂瑰紡锛?
```bash
go run ./cmd/migrate -f ./executor.yaml
```

榛樿閰嶇疆涓?`Database.AutoMigrate: true`锛屽洜姝ゅ湪寮€鍙戠幆澧冧笅鐩存帴鍚姩 `rpc`銆乣executor`銆乣indexer` 鏃朵篃浼氳嚜鍔ㄥ缓琛ㄣ€?
甯哥敤鍚姩鏂瑰紡锛?
```bash
go run ./cmd/rpc -f ./executor.yaml
go run ./cmd/executor -f ./executor.yaml
go run ./cmd/indexer -f ./executor.yaml
```

鍋ュ悍妫€鏌ワ細

- RPC: gRPC health service锛岃窡闅忎富鏈嶅姟鐩戝惉鍦板潃涓€璧锋毚闇?- Executor worker: `GET /healthz`锛岄粯璁ょ洃鍚?`0.0.0.0:9101`
- Indexer worker: `GET /healthz`锛岄粯璁ょ洃鍚?`0.0.0.0:9102`

Docker 杩愯鏂瑰紡锛?
```bash
docker compose up --build
```

瀹瑰櫒缂栨帓鏂囦欢锛?
- [docker-compose.yml](D:/work/CodeLab/FluxSwap-DEX/executor/docker-compose.yml)
- [Dockerfile](D:/work/CodeLab/FluxSwap-DEX/executor/Dockerfile)
- [executor.docker.yaml](D:/work/CodeLab/FluxSwap-DEX/executor/executor.docker.yaml)

Docker 榛樿鏈嶅姟璇存槑锛?
- `postgres`: PostgreSQL 17
- `migrate`: 鍚姩鏃舵墽琛屼竴娆″缓琛ㄨ縼绉?- `rpc`: gRPC 鏈嶅姟锛岄粯璁ゆ槧灏?`9001`
- `executor`: 璁㈠崟鎵ц worker锛岄粯璁ゆ槧灏勫仴搴锋鏌?`9101`
- `indexer`: 浜嬩欢绱㈠紩 worker锛岄粯璁ゆ槧灏勫仴搴锋鏌?`9102`

Docker 閰嶇疆娉ㄦ剰浜嬮」锛?
- `Chain.HTTPRPCURL` 渚?`rpc` 鍜?`executor` 浣跨敤锛屾寚鍚戝彲鍐欎氦鏄撲笌鍙璋冪敤鐨?HTTP RPC
- `Chain.WSRPCURL` 渚?`indexer` 浣跨敤锛屾寚鍚?WebSocket RPC 浠ヤ究瀹炴椂璁㈤槄浜嬩欢
- 榛樿绀轰緥浣跨敤 `ws://host.docker.internal:8545`锛岄€傚悎瀹瑰櫒璁块棶瀹夸富鏈轰笂鐨勬湰鍦板尯鍧楅摼
- 鍚姩鍓嶉渶瑕佹妸 `executor.docker.yaml` 閲岀殑 `SettlementAddress` 鍜?`ExecutorPrivateKey` 鏀规垚瀹為檯鍊?- 濡傛灉浣犵殑閾句笉鍦ㄥ涓绘満锛岃€屽湪鍒殑瀹瑰櫒鎴栬繙绔妭鐐癸紝璇锋妸 `Chain.HTTPRPCURL` 鍜?`Chain.WSRPCURL` 鍒嗗埆鏀规垚瀵瑰簲鍦板潃

寮€鍙戠幆澧冩帓鏌ュ缓璁細

- 鑻ヨ鍗曚竴鐩村仠鍦?`open`锛屽厛鐪?executor 鏃ュ織涓殑 `canExecuteOrder` reason
- 鑻ヨ鍗曡繘鍏?`pending_execute` 浣嗘湭鏈€缁堣惤涓?`executed`锛屽厛鐪?executor 鍥炴墽鏃ュ織锛屽啀鐪?indexer 鏄惁鏀跺埌 `OrderExecuted`
- 鑻?indexer 鏈秷璐瑰埌浜嬩欢锛屼紭鍏堟鏌?`Chain.WSRPCURL` 鏄惁涓?WebSocket 鍦板潃


