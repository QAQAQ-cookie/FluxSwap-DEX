# Indexer Worker

褰撳墠鐩綍鐢ㄤ簬鎵胯浇閾句笂浜嬩欢绱㈠紩涓庡洖鍐欓€昏緫銆?
褰撳墠宸插畬鎴愶細

- `Worker.ApplyEvent(...)` 浜嬩欢鍥炲啓鍏ュ彛
- `Subscriber` WebSocket 璁㈤槄鍣?- 鐙珛鍚姩鍏ュ彛 `cmd/indexer`
- 鍚姩鏃朵紭鍏堜粠鏁版嵁搴?`sync_cursor` 缁窇
- 濡傛灉娌℃湁 cursor锛屽垯鍥炴壂鏈€杩?`IndexerBackfillBlocks` 涓尯鍧?- 浜嬩欢浼氳惤搴撳埌 `order_events` 琛紝閲嶅浜嬩欢鎸夊箓绛夎烦杩?
褰撳墠鑷姩璇嗗埆骞跺洖鍐欙細

- `OrderExecuted`
- `OrderCancelled`
- `NonceInvalidated`
- `MinValidNonceUpdated`

鍚姩鏂瑰紡锛?
```bash
go run ./cmd/indexer -f ./executor.yaml
```

鍏抽敭閰嶇疆锛?
- `Chain.WSRPCURL`: 蹇呴』鏄?`ws://` 鎴?`wss://` WebSocket RPC
- `Chain.SettlementAddress`: 绛惧悕璁㈠崟缁撶畻鍚堢害鍦板潃
- `Worker.IndexerBackfillBlocks`: 棣栨鍚姩鎴栨棤 cursor 鏃剁殑鍥炴壂绐楀彛

鍚庣画浠嶅缓璁ˉ鍏咃細

- 鏇寸粏绮掑害鐨勬柇绾挎仮澶嶇瓥鐣?- 鐙珛浜嬩欢钀藉簱琛?- 鏇村畬鏁寸殑 cursor 鍏冧俊鎭?

