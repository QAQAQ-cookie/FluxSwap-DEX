package routergraph

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	backendredis "fluxswap-backend/redis"
)

type Store interface {
	SavePairMetadata(ctx context.Context, metadata PairMetadata, ttl time.Duration) error
	GetPairMetadata(ctx context.Context, chainID int64, pairAddress string) (PairMetadata, bool, error)
	SaveTokenNeighbors(ctx context.Context, neighbors TokenNeighbors, ttl time.Duration) error
	GetTokenNeighbors(ctx context.Context, chainID int64, token string) (TokenNeighbors, bool, error)
	SaveSyncCursor(ctx context.Context, cursor SyncCursor, ttl time.Duration) error
	GetSyncCursor(ctx context.Context, chainID int64, factoryAddress string) (SyncCursor, bool, error)
	RawStore() backendredis.Store
}

type RedisStore struct {
	redis backendredis.Store
}

func NewRedisStore(redisStore backendredis.Store) *RedisStore {
	return &RedisStore{redis: redisStore}
}

func (s *RedisStore) SavePairMetadata(ctx context.Context, metadata PairMetadata, ttl time.Duration) error {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return nil
	}

	payload, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("marshal pair metadata: %w", err)
	}

	return s.redis.Set(ctx, PairMetadataKey(metadata.ChainID, metadata.PairAddress), payload, ttl)
}

func (s *RedisStore) GetPairMetadata(ctx context.Context, chainID int64, pairAddress string) (PairMetadata, bool, error) {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return PairMetadata{}, false, nil
	}

	value, err := s.redis.Get(ctx, PairMetadataKey(chainID, pairAddress))
	if err != nil {
		return PairMetadata{}, false, nil
	}

	var metadata PairMetadata
	if err := json.Unmarshal([]byte(value), &metadata); err != nil {
		return PairMetadata{}, false, fmt.Errorf("unmarshal pair metadata: %w", err)
	}

	return metadata, true, nil
}

func (s *RedisStore) SaveTokenNeighbors(ctx context.Context, neighbors TokenNeighbors, ttl time.Duration) error {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return nil
	}

	payload, err := json.Marshal(neighbors)
	if err != nil {
		return fmt.Errorf("marshal token neighbors: %w", err)
	}

	return s.redis.Set(ctx, TokenNeighborsKey(neighbors.ChainID, neighbors.Token), payload, ttl)
}

func (s *RedisStore) GetTokenNeighbors(ctx context.Context, chainID int64, token string) (TokenNeighbors, bool, error) {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return TokenNeighbors{}, false, nil
	}

	value, err := s.redis.Get(ctx, TokenNeighborsKey(chainID, token))
	if err != nil {
		return TokenNeighbors{}, false, nil
	}

	var neighbors TokenNeighbors
	if err := json.Unmarshal([]byte(value), &neighbors); err != nil {
		return TokenNeighbors{}, false, fmt.Errorf("unmarshal token neighbors: %w", err)
	}

	return neighbors, true, nil
}

func (s *RedisStore) SaveSyncCursor(ctx context.Context, cursor SyncCursor, ttl time.Duration) error {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return nil
	}

	payload, err := json.Marshal(cursor)
	if err != nil {
		return fmt.Errorf("marshal sync cursor: %w", err)
	}

	return s.redis.Set(ctx, SyncCursorKey(cursor.ChainID, cursor.FactoryAddress), payload, ttl)
}

func (s *RedisStore) GetSyncCursor(ctx context.Context, chainID int64, factoryAddress string) (SyncCursor, bool, error) {
	if s == nil || s.redis == nil || !s.redis.Enabled() {
		return SyncCursor{}, false, nil
	}

	value, err := s.redis.Get(ctx, SyncCursorKey(chainID, factoryAddress))
	if err != nil {
		return SyncCursor{}, false, nil
	}

	var cursor SyncCursor
	if err := json.Unmarshal([]byte(value), &cursor); err != nil {
		return SyncCursor{}, false, fmt.Errorf("unmarshal sync cursor: %w", err)
	}

	return cursor, true, nil
}

func (s *RedisStore) RawStore() backendredis.Store {
	if s == nil {
		return nil
	}
	return s.redis
}
