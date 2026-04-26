package config

import (
	"fmt"
	"strings"
	"time"

	redisshared "fluxswap-backend/redis/shared"
)

const (
	DefaultDialTimeout  = 3 * time.Second
	DefaultReadTimeout  = 1 * time.Second
	DefaultWriteTimeout = 1 * time.Second
	DefaultPoolTimeout  = 4 * time.Second
	DefaultPoolSize     = 10
)

func NormalizeOptions(opts redisshared.Options) redisshared.Options {
	normalized := opts
	normalized.Addr = strings.TrimSpace(normalized.Addr)
	normalized.Username = strings.TrimSpace(normalized.Username)
	normalized.Password = strings.TrimSpace(normalized.Password)
	normalized.KeyPrefix = strings.TrimSpace(normalized.KeyPrefix)

	if normalized.Enabled {
		if normalized.DialTimeout <= 0 {
			normalized.DialTimeout = DefaultDialTimeout
		}
		if normalized.ReadTimeout <= 0 {
			normalized.ReadTimeout = DefaultReadTimeout
		}
		if normalized.WriteTimeout <= 0 {
			normalized.WriteTimeout = DefaultWriteTimeout
		}
		if normalized.PoolTimeout <= 0 {
			normalized.PoolTimeout = DefaultPoolTimeout
		}
		if normalized.PoolSize <= 0 {
			normalized.PoolSize = DefaultPoolSize
		}
	}

	return normalized
}

func ValidateOptions(opts redisshared.Options) error {
	if !opts.Enabled {
		return nil
	}
	if opts.Addr == "" {
		return redisshared.ErrMissingAddr
	}
	if opts.DB < 0 {
		return fmt.Errorf("redis db must be greater than or equal to 0")
	}
	if opts.MinIdleConns < 0 {
		return fmt.Errorf("redis min idle conns must be greater than or equal to 0")
	}
	if opts.MaxIdleConns < 0 {
		return fmt.Errorf("redis max idle conns must be greater than or equal to 0")
	}
	if opts.MaxIdleConns > 0 && opts.MaxIdleConns < opts.MinIdleConns {
		return fmt.Errorf("redis max idle conns must be greater than or equal to min idle conns")
	}
	return nil
}
