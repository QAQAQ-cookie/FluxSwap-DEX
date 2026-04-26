package routergraph

type PairMetadata struct {
	ChainID     int64  `json:"chainId"`
	PairAddress string `json:"pairAddress"`
	Token0      string `json:"token0"`
	Token1      string `json:"token1"`
}

type TokenNeighbors struct {
	ChainID   int64    `json:"chainId"`
	Token     string   `json:"token"`
	Neighbors []string `json:"neighbors"`
	UpdatedAt int64    `json:"updatedAt"`
}

type SyncCursor struct {
	ChainID        int64  `json:"chainId"`
	FactoryAddress string `json:"factoryAddress"`
	BlockNumber    uint64 `json:"blockNumber"`
	BlockHash      string `json:"blockHash"`
	LogIndex       uint   `json:"logIndex"`
	UpdatedAt      int64  `json:"updatedAt"`
}
