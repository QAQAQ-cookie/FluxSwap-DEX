package client

import (
	"context"
	"time"

	redisshared "fluxswap-backend/redis/shared"
)

type noopClient struct {
	keyPrefix string
}

func NewNoop(prefix string) Store {
	return &noopClient{keyPrefix: prefix}
}

func (c *noopClient) Enabled() bool {
	return false
}

func (c *noopClient) Ping(ctx context.Context) error {
	return redisshared.ErrDisabled
}

func (c *noopClient) Get(ctx context.Context, key string) (string, error) {
	if _, err := PrefixKey(c.keyPrefix, key); err != nil {
		return "", err
	}
	return "", redisshared.ErrDisabled
}

func (c *noopClient) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	_, err := PrefixKey(c.keyPrefix, key)
	if err != nil {
		return err
	}
	return redisshared.ErrDisabled
}

func (c *noopClient) Delete(ctx context.Context, keys ...string) (int64, error) {
	for _, key := range keys {
		if _, err := PrefixKey(c.keyPrefix, key); err != nil {
			return 0, err
		}
	}
	return 0, redisshared.ErrDisabled
}

func (c *noopClient) Close() error {
	return nil
}
