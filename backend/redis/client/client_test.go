package client_test

import (
	"context"
	"testing"
	"time"

	backendredis "fluxswap-backend/redis"

	"github.com/stretchr/testify/require"
)

func TestOptionsValidateAllowsDisabledWithoutAddr(t *testing.T) {
	err := backendredis.Options{}.Validate()

	require.NoError(t, err)
}

func TestOptionsValidateRejectsEnabledWithoutAddr(t *testing.T) {
	err := backendredis.Options{Enabled: true}.Normalize().Validate()

	require.ErrorIs(t, err, backendredis.ErrMissingAddr)
}

func TestOptionsNormalizeAppliesDefaults(t *testing.T) {
	opts := backendredis.Options{
		Enabled:   true,
		Addr:      " 127.0.0.1:6379 ",
		KeyPrefix: " quotes ",
	}.Normalize()

	require.Equal(t, "127.0.0.1:6379", opts.Addr)
	require.Equal(t, "quotes", opts.KeyPrefix)
	require.Equal(t, backendredis.DefaultDialTimeout, opts.DialTimeout)
	require.Equal(t, backendredis.DefaultReadTimeout, opts.ReadTimeout)
	require.Equal(t, backendredis.DefaultWriteTimeout, opts.WriteTimeout)
	require.Equal(t, backendredis.DefaultPoolTimeout, opts.PoolTimeout)
	require.Equal(t, backendredis.DefaultPoolSize, opts.PoolSize)
}

func TestPrefixKey(t *testing.T) {
	key, err := backendredis.PrefixKey(" quote:v1: ", " best-route ")

	require.NoError(t, err)
	require.Equal(t, "quote:v1:best-route", key)
}

func TestPrefixKeyRejectsEmptyKey(t *testing.T) {
	_, err := backendredis.PrefixKey("quote:v1", " ")

	require.ErrorIs(t, err, backendredis.ErrEmptyKey)
}

func TestNewReturnsNoopWhenDisabled(t *testing.T) {
	store, err := backendredis.New(backendredis.Options{})

	require.NoError(t, err)
	require.False(t, store.Enabled())
	require.ErrorIs(t, store.Ping(context.Background()), backendredis.ErrDisabled)
}

func TestNewReturnsRealClientWhenEnabled(t *testing.T) {
	store, err := backendredis.New(backendredis.Options{
		Enabled:   true,
		Addr:      "127.0.0.1:6379",
		KeyPrefix: "quotes",
	})
	require.NoError(t, err)

	client, ok := store.(*backendredis.Client)
	require.True(t, ok)
	require.True(t, client.Enabled())
	require.NotNil(t, client.Raw())
	require.NoError(t, client.Close())
}

func TestNoopKeepsKeyValidation(t *testing.T) {
	store := backendredis.NewNoop("quotes")

	err := store.Set(context.Background(), " ", "value", time.Minute)

	require.ErrorIs(t, err, backendredis.ErrEmptyKey)
}
