package repo

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// 覆盖游标精确位置模式，确保 block 和 logIndex 都能正确读回。
func TestSyncCursorRepositoryUpsertPositionAndGetPosition(t *testing.T) {
	db := openCursorTestDB(t)
	cursorRepo := NewSyncCursorRepository(db)

	err := cursorRepo.UpsertPosition(context.Background(), "indexer:test", 31337, 123, "0xabc", 9)
	require.NoError(t, err)

	position, err := cursorRepo.GetPosition(context.Background(), "indexer:test", 31337)
	require.NoError(t, err)
	require.Equal(t, int64(123), position.BlockNumber)
	require.Equal(t, "0xabc", position.BlockHash)
	require.Equal(t, int64(9), position.LogIndex)
}

// 兼容旧的“只记块高”模式，避免读取逻辑把老数据判坏。
func TestSyncCursorRepositoryUpsertKeepsBlockOnlyMode(t *testing.T) {
	db := openCursorTestDB(t)
	cursorRepo := NewSyncCursorRepository(db)

	err := cursorRepo.Upsert(context.Background(), "indexer:test", 31337, 456)
	require.NoError(t, err)

	position, err := cursorRepo.GetPosition(context.Background(), "indexer:test", 31337)
	require.NoError(t, err)
	require.Equal(t, int64(456), position.BlockNumber)
	require.Equal(t, "", position.BlockHash)
	require.Equal(t, int64(-1), position.LogIndex)
}

// 这里同样使用内存 SQLite，便于快速验证仓储层行为。
func openCursorTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, AutoMigrate(db))
	return db
}
