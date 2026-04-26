package routergraph

import (
	"fmt"
	"strings"
)

const (
	pairMetadataKeyPrefix   = "routergraph:pair"
	tokenNeighborsKeyPrefix = "routergraph:neighbors"
	syncCursorKeyPrefix     = "routergraph:cursor"
)

func PairMetadataKey(chainID int64, pairAddress string) string {
	return fmt.Sprintf("%s:%d:%s", pairMetadataKeyPrefix, chainID, normalizeAddress(pairAddress))
}

func TokenNeighborsKey(chainID int64, token string) string {
	return fmt.Sprintf("%s:%d:%s", tokenNeighborsKeyPrefix, chainID, normalizeAddress(token))
}

func SyncCursorKey(chainID int64, factoryAddress string) string {
	return fmt.Sprintf("%s:%d:%s", syncCursorKeyPrefix, chainID, normalizeAddress(factoryAddress))
}

func normalizeAddress(address string) string {
	return strings.ToLower(strings.TrimSpace(address))
}
