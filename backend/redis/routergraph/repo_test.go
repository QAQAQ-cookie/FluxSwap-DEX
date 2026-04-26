package routergraph

import (
	"context"
	"testing"
	"time"

	backendredis "fluxswap-backend/redis"

	"github.com/stretchr/testify/require"
)

func TestPairMetadataKey(t *testing.T) {
	key := PairMetadataKey(31337, " 0xABCDEF ")

	require.Equal(t, "routergraph:pair:31337:0xabcdef", key)
}

func TestTokenNeighborsKey(t *testing.T) {
	key := TokenNeighborsKey(31337, " 0xABCDEF ")

	require.Equal(t, "routergraph:neighbors:31337:0xabcdef", key)
}

func TestSyncCursorKey(t *testing.T) {
	key := SyncCursorKey(31337, " 0xABCDEF ")

	require.Equal(t, "routergraph:cursor:31337:0xabcdef", key)
}

func TestRedisStoreReturnsMissWhenRedisDisabled(t *testing.T) {
	store := NewRedisStore(backendredis.NewNoop("fluxswap"))

	metadata, found, err := store.GetPairMetadata(context.Background(), 31337, "0xabc")

	require.NoError(t, err)
	require.False(t, found)
	require.Equal(t, PairMetadata{}, metadata)
}

func TestRedisStoreSaveIsNoopWhenRedisDisabled(t *testing.T) {
	store := NewRedisStore(backendredis.NewNoop("fluxswap"))

	err := store.SaveTokenNeighbors(context.Background(), TokenNeighbors{
		ChainID:   31337,
		Token:     "0xabc",
		Neighbors: []string{"0xdef"},
		UpdatedAt: time.Now().Unix(),
	}, time.Minute)

	require.NoError(t, err)
}

func TestRedisStoreCursorReturnsMissWhenRedisDisabled(t *testing.T) {
	store := NewRedisStore(backendredis.NewNoop("fluxswap"))

	cursor, found, err := store.GetSyncCursor(context.Background(), 31337, "0xabc")

	require.NoError(t, err)
	require.False(t, found)
	require.Equal(t, SyncCursor{}, cursor)
}
