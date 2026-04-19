package indexer

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"fluxswap-backend/internal/repo"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"gorm.io/gorm"
)

var (
	orderExecutedTopic    = crypto.Keccak256Hash([]byte("OrderExecuted(bytes32,address,address,address,address,uint256,uint256,uint256,uint256,address)"))
	nonceInvalidatedTopic = crypto.Keccak256Hash([]byte("NonceInvalidated(address,uint256)"))
)

// Config 控制索引器订阅行为、重连策略和历史回补范围。
type Config struct {
	ChainID           int64
	RPCURL            string
	SettlementAddress string
	ReconnectDelay    time.Duration
	BackfillBlocks    int64
}

// Subscriber 负责维护 websocket 连接、历史回补流程和游标持久化。
type Subscriber struct {
	cfg        Config
	worker     *Worker
	cursorRepo *repo.SyncCursorRepository
}

// backfillClient 抽象历史回补所需的最小链客户端能力，方便测试注入。
type backfillClient interface {
	BlockNumber(ctx context.Context) (uint64, error)
	FilterLogs(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error)
}

// NewSubscriber 校验配置并创建一个索引器订阅器。
func NewSubscriber(db *gorm.DB, cfg Config) (*Subscriber, error) {
	rpcURL := strings.TrimSpace(cfg.RPCURL)
	settlementAddress := strings.TrimSpace(cfg.SettlementAddress)
	if db == nil {
		return nil, fmt.Errorf("database is required")
	}
	if cfg.ChainID <= 0 {
		return nil, fmt.Errorf("chain id must be greater than 0")
	}
	if rpcURL == "" {
		return nil, fmt.Errorf("rpc url is required")
	}
	if !strings.HasPrefix(strings.ToLower(rpcURL), "ws://") && !strings.HasPrefix(strings.ToLower(rpcURL), "wss://") {
		return nil, fmt.Errorf("rpc url must be a websocket endpoint")
	}
	if !common.IsHexAddress(settlementAddress) {
		return nil, fmt.Errorf("settlement address must be a valid address")
	}
	if cfg.ReconnectDelay <= 0 {
		cfg.ReconnectDelay = 3 * time.Second
	}

	return &Subscriber{
		cfg:        cfg,
		worker:     NewWorker(db),
		cursorRepo: repo.NewSyncCursorRepository(db),
	}, nil
}

// Run 持续保持 websocket 订阅，在临时故障时自动重连。
func (s *Subscriber) Run(ctx context.Context) error {
	// 进入长期运行循环；每一轮都会建立一次完整的 websocket 会话。
	for {
		// 执行一次“连接节点 -> 回补历史 -> 实时订阅”的完整流程。
		err := s.runOnce(ctx)
		// 如果本轮正常结束，或者外层上下文已经要求退出，就直接返回。
		if err == nil || ctx.Err() != nil {
			return err
		}

		// 记录本轮失败信息，方便排查 websocket 或节点异常。
		fmt.Printf("indexer subscriber failed, reconnecting in %s: %v\n", s.cfg.ReconnectDelay, err)

		// 在“进程退出”和“等待重连间隔”之间二选一。
		select {
		// 外层要求停机时，直接返回上下文错误。
		case <-ctx.Done():
			return ctx.Err()
		// 等待固定重连间隔后，继续下一轮 runOnce。
		case <-time.After(s.cfg.ReconnectDelay):
		}
	}
}

// runOnce 执行一次完整的 websocket 会话：先回补历史，再进入实时订阅。
func (s *Subscriber) runOnce(ctx context.Context) error {
	client, err := ethclient.DialContext(ctx, s.cfg.RPCURL)
	if err != nil {
		return fmt.Errorf("dial websocket rpc: %w", err)
	}
	defer client.Close()

	fmt.Printf("indexer connected to websocket rpc %s\n", s.cfg.RPCURL)

	logsCh := make(chan types.Log, 128)
	query := ethereum.FilterQuery{
		Addresses: []common.Address{common.HexToAddress(s.cfg.SettlementAddress)},
	}

	if err := s.backfillRecentLogs(ctx, client, query); err != nil {
		return err
	}

	sub, err := client.SubscribeFilterLogs(ctx, query, logsCh)
	if err != nil {
		return fmt.Errorf("subscribe filter logs: %w", err)
	}
	defer sub.Unsubscribe()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-sub.Err():
			if err == nil {
				return nil
			}
			return fmt.Errorf("subscription error: %w", err)
		case entry, ok := <-logsCh:
			if !ok {
				return fmt.Errorf("log channel closed")
			}
			if err := s.handleLog(ctx, entry); err != nil {
				return err
			}
		}
	}
}

// handleLog 负责解码一条原始日志、写回数据库，并推进同步游标。
func (s *Subscriber) handleLog(ctx context.Context, entry types.Log) error {
	if len(entry.Topics) == 0 {
		return s.advanceCursor(ctx, entry)
	}

	eventName, ok := eventNameByTopic(entry.Topics[0])
	if !ok {
		return s.advanceCursor(ctx, entry)
	}

	event, ok := s.decodeLog(eventName, entry)
	if !ok {
		return fmt.Errorf(
			"decode supported event failed: event=%s tx=%s block=%d logIndex=%d",
			eventName,
			strings.ToLower(entry.TxHash.Hex()),
			entry.BlockNumber,
			entry.Index,
		)
	}

	fmt.Printf(
		"indexer received event=%s tx=%s block=%d logIndex=%d\n",
		event.EventName,
		event.TxHash,
		event.BlockNumber,
		event.LogIndex,
	)

	_, err := s.worker.ApplyEvent(ctx, event)
	if err != nil {
		return fmt.Errorf("apply event %s: %w", eventName, err)
	}
	return s.advanceCursor(ctx, entry)
}

// advanceCursor 把“这条日志已经安全处理完成”的位置持久化到数据库。
func (s *Subscriber) advanceCursor(ctx context.Context, entry types.Log) error {
	if s == nil || s.cursorRepo == nil {
		return fmt.Errorf("sync cursor repository is not initialized")
	}
	if err := s.cursorRepo.UpsertPosition(
		ctx,
		s.cursorName(),
		s.cfg.ChainID,
		int64(entry.BlockNumber),
		strings.ToLower(entry.BlockHash.Hex()),
		int64(entry.Index),
	); err != nil {
		return fmt.Errorf("update sync cursor: %w", err)
	}

	return nil
}

// backfillRecentLogs 会根据已有游标或回补窗口配置，选择合适的历史区块范围。
func (s *Subscriber) backfillRecentLogs(
	ctx context.Context,
	client backfillClient,
	baseQuery ethereum.FilterQuery,
) error {
	latestBlock, err := client.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("get latest block number: %w", err)
	}

	cursor, err := s.cursorRepo.GetPosition(ctx, s.cursorName(), s.cfg.ChainID)
	if err == nil {
		fromBlock := uint64(cursor.BlockNumber)
		if fromBlock > latestBlock {
			return nil
		}
		return s.backfillFromCursor(ctx, client, baseQuery, fromBlock, cursor)
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("load sync cursor: %w", err)
	}

	if s.cfg.BackfillBlocks <= 0 {
		return nil
	}

	fromBlock := uint64(0)
	if latestBlock+1 > uint64(s.cfg.BackfillBlocks) {
		fromBlock = latestBlock - uint64(s.cfg.BackfillBlocks) + 1
	}

	return s.backfillFromCursor(ctx, client, baseQuery, fromBlock, nil)
}

// backfillFromCursor 拉取指定区块范围内的日志并逐条重放。
func (s *Subscriber) backfillFromCursor(
	ctx context.Context,
	client backfillClient,
	baseQuery ethereum.FilterQuery,
	fromBlock uint64,
	cursor *repo.CursorPosition,
) error {
	latestBlock, err := client.BlockNumber(ctx)
	if err != nil {
		return fmt.Errorf("get latest block number: %w", err)
	}
	if fromBlock > latestBlock {
		return nil
	}

	query := baseQuery
	query.FromBlock = new(big.Int).SetUint64(fromBlock)
	query.ToBlock = new(big.Int).SetUint64(latestBlock)

	logs, err := client.FilterLogs(ctx, query)
	if err != nil {
		return fmt.Errorf("backfill filter logs: %w", err)
	}

	if len(logs) > 0 {
		fmt.Printf("indexer backfill loaded %d historical logs from block %d to %d\n", len(logs), fromBlock, latestBlock)
	}

	for _, entry := range logs {
		if shouldSkipEntry(cursor, entry) {
			continue
		}
		if err := s.handleLog(ctx, entry); err != nil {
			return err
		}
	}

	return nil
}

func shouldSkipEntry(cursor *repo.CursorPosition, entry types.Log) bool {
	if cursor == nil {
		return false
	}
	if int64(entry.BlockNumber) != cursor.BlockNumber {
		return false
	}
	cursorBlockHash := strings.ToLower(strings.TrimSpace(cursor.BlockHash))
	entryBlockHash := strings.ToLower(entry.BlockHash.Hex())
	if cursorBlockHash != "" && entryBlockHash != "" && cursorBlockHash != entryBlockHash {
		return false
	}
	return int64(entry.Index) <= cursor.LogIndex
}

// cursorName 为当前结算合约生成唯一的游标名称。
func (s *Subscriber) cursorName() string {
	return fmt.Sprintf(
		"indexer:%d:%s",
		s.cfg.ChainID,
		strings.ToLower(strings.TrimSpace(s.cfg.SettlementAddress)),
	)
}

// decodeLog 把 go-ethereum 的原始日志结构转换成 worker 更易使用的 OrderEvent。
func (s *Subscriber) decodeLog(eventName string, entry types.Log) (OrderEvent, bool) {
	base := OrderEvent{
		ChainID:         s.cfg.ChainID,
		ContractAddress: strings.ToLower(entry.Address.Hex()),
		EventName:       eventName,
		Removed:         entry.Removed,
		TxHash:          strings.ToLower(entry.TxHash.Hex()),
		LogIndex:        int64(entry.Index),
		BlockNumber:     int64(entry.BlockNumber),
	}

	switch eventName {
	case EventOrderExecuted:
		if len(entry.Topics) < 2 {
			return OrderEvent{}, false
		}
		base.OrderHash = strings.ToLower(entry.Topics[1].Hex())
		if len(entry.Topics) >= 3 {
			base.Maker = strings.ToLower(common.HexToAddress(entry.Topics[2].Hex()).Hex())
		}
		if grossAmountOut, recipientAmountOut, executorFeeAmount, ok := decodeThreeUint256Offset(entry.Data, 96); ok {
			base.GrossAmountOut = grossAmountOut
			base.RecipientAmountOut = recipientAmountOut
			base.ExecutorFeeAmount = executorFeeAmount
			return base, true
		}
		return OrderEvent{}, false
	case EventNonceInvalidated:
		if len(entry.Topics) < 2 {
			return OrderEvent{}, false
		}
		base.Maker = strings.ToLower(common.HexToAddress(entry.Topics[1].Hex()).Hex())
		if nonce, ok := decodeUint256(entry.Data); ok {
			base.Nonce = nonce
			return base, true
		}
		return OrderEvent{}, false
	default:
		return OrderEvent{}, false
	}
}

// decodeUint256 从 ABI 编码的事件 data 中读取一个 uint256。
func decodeUint256(data []byte) (string, bool) {
	if len(data) < 32 {
		return "", false
	}
	value := new(big.Int).SetBytes(data[:32])
	return value.String(), true
}

// decodeThreeUint256Offset 从 ABI 编码的事件 data 中按偏移读取连续三个 uint256。
func decodeThreeUint256Offset(data []byte, offset int) (string, string, string, bool) {
	if len(data) < offset+96 {
		return "", "", "", false
	}
	first := new(big.Int).SetBytes(data[offset : offset+32]).String()
	second := new(big.Int).SetBytes(data[offset+32 : offset+64]).String()
	third := new(big.Int).SetBytes(data[offset+64 : offset+96]).String()
	return first, second, third, true
}

// eventNameByTopic 根据 topic hash 识别当前支持的结算事件名称。
func eventNameByTopic(topic common.Hash) (string, bool) {
	switch topic {
	case orderExecutedTopic:
		return EventOrderExecuted, true
	case nonceInvalidatedTopic:
		return EventNonceInvalidated, true
	default:
		return "", false
	}
}

