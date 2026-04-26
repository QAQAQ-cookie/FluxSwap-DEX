package redis

import (
	redisclient "fluxswap-backend/redis/client"
	redisconfig "fluxswap-backend/redis/config"
	redisshared "fluxswap-backend/redis/shared"
)

type Options redisshared.Options
type Store = redisclient.Store
type Client = redisclient.Client

var (
	ErrDisabled    = redisshared.ErrDisabled
	ErrMissingAddr = redisshared.ErrMissingAddr
	ErrEmptyKey    = redisshared.ErrEmptyKey
)

const (
	DefaultDialTimeout  = redisconfig.DefaultDialTimeout
	DefaultReadTimeout  = redisconfig.DefaultReadTimeout
	DefaultWriteTimeout = redisconfig.DefaultWriteTimeout
	DefaultPoolTimeout  = redisconfig.DefaultPoolTimeout
	DefaultPoolSize     = redisconfig.DefaultPoolSize
)

func New(opts Options) (Store, error) {
	return redisclient.New(redisshared.Options(opts))
}

func NewNoop(prefix string) Store {
	return redisclient.NewNoop(prefix)
}

func NormalizeOptions(opts Options) Options {
	return Options(redisconfig.NormalizeOptions(redisshared.Options(opts)))
}

func ValidateOptions(opts Options) error {
	return redisconfig.ValidateOptions(redisshared.Options(opts))
}

func PrefixKey(prefix string, key string) (string, error) {
	return redisclient.PrefixKey(prefix, key)
}

func prefixKey(prefix string, key string) (string, error) {
	return PrefixKey(prefix, key)
}

func IsDisabled(err error) bool {
	return redisshared.IsDisabled(err)
}

func (o Options) Normalize() Options {
	return NormalizeOptions(o)
}

func (o Options) Validate() error {
	return ValidateOptions(o)
}
