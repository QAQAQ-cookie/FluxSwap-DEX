package client

import (
	"context"
	"strings"
	"time"

	redisconfig "fluxswap-backend/redis/config"
	redisshared "fluxswap-backend/redis/shared"

	goredis "github.com/redis/go-redis/v9"
)

type Options = redisshared.Options

type Store interface {
	Enabled() bool
	Ping(ctx context.Context) error
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key string, value any, ttl time.Duration) error
	Delete(ctx context.Context, keys ...string) (int64, error)
	Close() error
}

type Client struct {
	opts   Options
	client *goredis.Client
}

func New(opts Options) (Store, error) {
	normalized := redisconfig.NormalizeOptions(opts)
	if err := redisconfig.ValidateOptions(normalized); err != nil {
		return nil, err
	}
	if !normalized.Enabled {
		return NewNoop(normalized.KeyPrefix), nil
	}

	client := goredis.NewClient(&goredis.Options{
		Addr:         normalized.Addr,
		Username:     normalized.Username,
		Password:     normalized.Password,
		DB:           normalized.DB,
		DialTimeout:  normalized.DialTimeout,
		ReadTimeout:  normalized.ReadTimeout,
		WriteTimeout: normalized.WriteTimeout,
		PoolTimeout:  normalized.PoolTimeout,
		MinIdleConns: normalized.MinIdleConns,
		MaxIdleConns: normalized.MaxIdleConns,
		PoolSize:     normalized.PoolSize,
	})

	return &Client{
		opts:   normalized,
		client: client,
	}, nil
}

func (c *Client) Enabled() bool {
	return true
}

func (c *Client) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	normalizedKey, err := PrefixKey(c.opts.KeyPrefix, key)
	if err != nil {
		return "", err
	}
	return c.client.Get(ctx, normalizedKey).Result()
}

func (c *Client) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	normalizedKey, err := PrefixKey(c.opts.KeyPrefix, key)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, normalizedKey, value, ttl).Err()
}

func (c *Client) Delete(ctx context.Context, keys ...string) (int64, error) {
	if len(keys) == 0 {
		return 0, nil
	}

	normalizedKeys := make([]string, 0, len(keys))
	for _, key := range keys {
		normalizedKey, err := PrefixKey(c.opts.KeyPrefix, key)
		if err != nil {
			return 0, err
		}
		normalizedKeys = append(normalizedKeys, normalizedKey)
	}

	return c.client.Del(ctx, normalizedKeys...).Result()
}

func (c *Client) Close() error {
	return c.client.Close()
}

func (c *Client) Raw() *goredis.Client {
	return c.client
}

func PrefixKey(prefix string, key string) (string, error) {
	trimmedKey := strings.TrimSpace(key)
	if trimmedKey == "" {
		return "", redisshared.ErrEmptyKey
	}

	trimmedPrefix := strings.TrimSpace(prefix)
	if trimmedPrefix == "" {
		return trimmedKey, nil
	}

	trimmedPrefix = strings.TrimSuffix(trimmedPrefix, ":")
	return trimmedPrefix + ":" + trimmedKey, nil
}
