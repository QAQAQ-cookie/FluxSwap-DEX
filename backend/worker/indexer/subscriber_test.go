package indexer

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"testing"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDecodeLogParsesOrderExecutedAmountsFromCorrectOffset(t *testing.T) {
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	}

	entry := types.Log{
		Address: common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:  common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		Topics: []common.Hash{
			orderExecutedTopic,
			common.HexToHash("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
			common.HexToHash("0x0000000000000000000000002222222222222222222222222222222222222222"),
		},
		Data: mustDecodeHex(
			"0000000000000000000000003333333333333333333333333333333333333333" +
				"0000000000000000000000004444444444444444444444444444444444444444" +
				"0000000000000000000000000000000000000000000000000000000000000064" +
				"00000000000000000000000000000000000000000000000000000000000000c8" +
				"00000000000000000000000000000000000000000000000000000000000000be" +
				"000000000000000000000000000000000000000000000000000000000000000a" +
				"0000000000000000000000005555555555555555555555555555555555555555",
		),
	}

	event, ok := subscriber.decodeLog(EventOrderExecuted, entry)
	require.True(t, ok)
	require.Equal(t, "200", event.GrossAmountOut)
	require.Equal(t, "190", event.RecipientAmountOut)
	require.Equal(t, "10", event.ExecutorFeeAmount)
}

func mustDecodeHex(value string) []byte {
	decoded, err := hex.DecodeString(value)
	if err != nil {
		panic(err)
	}
	return decoded
}

// 索引器遇到本地不存在的订单时应返回错误，且不能把游标推进到该事件之后。
func TestHandleLogReturnsErrorAndDoesNotAdvanceCursorWhenOrderMissing(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	entry := types.Log{
		Address:     common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:      common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		BlockNumber: 123,
		BlockHash:   common.HexToHash("0x1234000000000000000000000000000000000000000000000000000000000000"),
		Index:       0,
		Topics: []common.Hash{
			orderExecutedTopic,
			common.HexToHash("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
			common.HexToHash("0x0000000000000000000000002222222222222222222222222222222222222222"),
		},
		Data: mustDecodeHex(
			"0000000000000000000000003333333333333333333333333333333333333333" +
				"0000000000000000000000004444444444444444444444444444444444444444" +
				"0000000000000000000000000000000000000000000000000000000000000064" +
				"00000000000000000000000000000000000000000000000000000000000000c8" +
				"00000000000000000000000000000000000000000000000000000000000000be" +
				"000000000000000000000000000000000000000000000000000000000000000a" +
				"0000000000000000000000005555555555555555555555555555555555555555",
		),
	}

	err := subscriber.handleLog(t.Context(), entry)
	require.Error(t, err)
	require.Contains(t, err.Error(), "apply event OrderExecuted")
	require.Contains(t, err.Error(), "record not found")

	_, err = subscriber.cursorRepo.GetPosition(t.Context(), subscriber.cursorName(), subscriber.cfg.ChainID)
	require.Error(t, err)
}

func TestHandleLogRevertsRemovedLog(t *testing.T) {
	db := openIndexerTestDB(t)
	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "8",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + repeatIndexerHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(t.Context(), order))

	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	entry := types.Log{
		Address:     common.HexToAddress(order.SettlementAddress),
		TxHash:      common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		BlockNumber: 123,
		BlockHash:   common.HexToHash("0x5678000000000000000000000000000000000000000000000000000000000000"),
		Index:       0,
		Topics: []common.Hash{
			orderExecutedTopic,
			common.HexToHash(order.OrderHash),
			common.HexToHash("0x0000000000000000000000002222222222222222222222222222222222222222"),
		},
		Data: mustDecodeHex(
			"0000000000000000000000003333333333333333333333333333333333333333" +
				"0000000000000000000000004444444444444444444444444444444444444444" +
				"0000000000000000000000000000000000000000000000000000000000000064" +
				"00000000000000000000000000000000000000000000000000000000000000c8" +
				"00000000000000000000000000000000000000000000000000000000000000be" +
				"000000000000000000000000000000000000000000000000000000000000000a" +
				"0000000000000000000000005555555555555555555555555555555555555555",
		),
	}

	require.NoError(t, subscriber.handleLog(t.Context(), entry))

	removed := entry
	removed.Removed = true
	require.NoError(t, subscriber.handleLog(t.Context(), removed))

	stored, err := repo.NewOrderRepository(db).GetByOrderHash(t.Context(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, err)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.ExecutedTxHash)
}

func TestHandleLogAdvancesCursorForUnknownTopic(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	entry := types.Log{
		Address:     common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:      common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		BlockNumber: 200,
		BlockHash:   common.HexToHash("0x2000000000000000000000000000000000000000000000000000000000000000"),
		Index:       3,
		Topics: []common.Hash{
			common.HexToHash("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
		},
	}

	require.NoError(t, subscriber.handleLog(t.Context(), entry))

	position, err := subscriber.cursorRepo.GetPosition(t.Context(), subscriber.cursorName(), subscriber.cfg.ChainID)
	require.NoError(t, err)
	require.Equal(t, int64(200), position.BlockNumber)
	require.Equal(t, int64(3), position.LogIndex)
}

func TestHandleLogFailsForUndecodableKnownTopicWithoutAdvancingCursor(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	entry := types.Log{
		Address:     common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:      common.HexToHash("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
		BlockNumber: 201,
		BlockHash:   common.HexToHash("0x2010000000000000000000000000000000000000000000000000000000000000"),
		Index:       1,
		Topics: []common.Hash{
			orderExecutedTopic,
		},
		Data: []byte{},
	}

	err := subscriber.handleLog(t.Context(), entry)
	require.Error(t, err)
	require.Contains(t, err.Error(), "decode supported event failed")

	_, err = subscriber.cursorRepo.GetPosition(t.Context(), subscriber.cursorName(), subscriber.cfg.ChainID)
	require.Error(t, err)
}

func TestDecodeLogRejectsOrderExecutedWhenAmountsMissing(t *testing.T) {
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	}

	entry := types.Log{
		Address: common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:  common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		Topics: []common.Hash{
			orderExecutedTopic,
			common.HexToHash("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
			common.HexToHash("0x0000000000000000000000002222222222222222222222222222222222222222"),
		},
		Data: mustDecodeHex(
			"0000000000000000000000003333333333333333333333333333333333333333" +
				"0000000000000000000000004444444444444444444444444444444444444444",
		),
	}

	_, ok := subscriber.decodeLog(EventOrderExecuted, entry)
	require.False(t, ok)
}

func TestDecodeLogRejectsNonceInvalidatedWithoutNonceData(t *testing.T) {
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	}

	entry := types.Log{
		Address: common.HexToAddress("0x1111111111111111111111111111111111111111"),
		TxHash:  common.HexToHash("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
		Topics: []common.Hash{
			nonceInvalidatedTopic,
			common.HexToHash("0x0000000000000000000000002222222222222222222222222222222222222222"),
		},
		Data: []byte{},
	}

	_, ok := subscriber.decodeLog(EventNonceInvalidated, entry)
	require.False(t, ok)
}

func TestShouldSkipEntryDoesNotSkipSameHeightLogFromDifferentBlockHash(t *testing.T) {
	cursor := &repo.CursorPosition{
		BlockNumber: 123,
		BlockHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		LogIndex:    5,
	}

	entry := types.Log{
		BlockNumber: 123,
		BlockHash:   common.HexToHash("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
		Index:       0,
	}

	require.False(t, shouldSkipEntry(cursor, entry))
}

func TestCursorNameIncludesChainID(t *testing.T) {
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           11155111,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	}

	require.Equal(t, "indexer:11155111:0x1111111111111111111111111111111111111111", subscriber.cursorName())
}

func TestNewSubscriberRejectsNilDatabase(t *testing.T) {
	_, err := NewSubscriber(nil, Config{
		ChainID:           31337,
		RPCURL:            "ws://127.0.0.1:8546",
		SettlementAddress: "0x1111111111111111111111111111111111111111",
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "database is required")
}

func TestBackfillRecentLogsUsesCursorEvenWhenBackfillDisabled(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
			BackfillBlocks:    0,
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	require.NoError(t, subscriber.cursorRepo.UpsertPosition(
		context.Background(),
		subscriber.cursorName(),
		subscriber.cfg.ChainID,
		120,
		"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		4,
	))

	client := &stubBackfillClient{
		latestBlock: 130,
	}

	require.NoError(t, subscriber.backfillRecentLogs(context.Background(), client, ethereum.FilterQuery{}))
	require.Equal(t, uint64(120), client.lastFromBlock)
	require.Equal(t, uint64(130), client.lastToBlock)
}

func TestBackfillRecentLogsReplaysSameBlockForLegacyBlockOnlyCursor(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
			BackfillBlocks:    0,
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	require.NoError(t, subscriber.cursorRepo.Upsert(
		context.Background(),
		subscriber.cursorName(),
		subscriber.cfg.ChainID,
		120,
	))

	client := &stubBackfillClient{
		latestBlock: 130,
	}

	require.NoError(t, subscriber.backfillRecentLogs(context.Background(), client, ethereum.FilterQuery{}))
	require.Equal(t, uint64(120), client.lastFromBlock)
	require.Equal(t, uint64(130), client.lastToBlock)
}

func TestBackfillRecentLogsSkipsHistoricalScanWithoutCursorWhenBackfillDisabled(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
			BackfillBlocks:    0,
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	client := &stubBackfillClient{
		latestBlock: 130,
	}

	require.NoError(t, subscriber.backfillRecentLogs(context.Background(), client, ethereum.FilterQuery{}))
	require.False(t, client.filterCalled)
}

func TestHandleLogIgnoresZeroValueUnknownEntry(t *testing.T) {
	db := openIndexerTestDB(t)
	subscriber := &Subscriber{
		cfg: Config{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}

	require.NoError(t, subscriber.handleLog(t.Context(), types.Log{}))

	position, err := subscriber.cursorRepo.GetPosition(t.Context(), subscriber.cursorName(), subscriber.cfg.ChainID)
	require.NoError(t, err)
	require.Equal(t, int64(0), position.BlockNumber)
	require.Equal(t, int64(0), position.LogIndex)
}

type stubBackfillClient struct {
	latestBlock   uint64
	filterCalled  bool
	lastFromBlock uint64
	lastToBlock   uint64
}

func (s *stubBackfillClient) BlockNumber(context.Context) (uint64, error) {
	return s.latestBlock, nil
}

func (s *stubBackfillClient) FilterLogs(ctx context.Context, query ethereum.FilterQuery) ([]types.Log, error) {
	s.filterCalled = true
	if query.FromBlock != nil {
		s.lastFromBlock = query.FromBlock.Uint64()
	}
	if query.ToBlock != nil {
		s.lastToBlock = query.ToBlock.Uint64()
	}
	return nil, nil
}

func (s *stubBackfillClient) ChainID(context.Context) (*big.Int, error) {
	return big.NewInt(31337), nil
}

func openIndexerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:indexer_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

func repeatIndexerHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
