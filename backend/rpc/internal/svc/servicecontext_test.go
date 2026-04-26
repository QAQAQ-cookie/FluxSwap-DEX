package svc

import (
	"testing"

	"fluxswap-backend/internal/config"

	"github.com/stretchr/testify/require"
)

func TestNewServiceContextRequiresPostgresDriver(t *testing.T) {
	_, err := NewServiceContext(config.Config{
		Database: config.DatabaseConfig{
			Driver: "sqlite",
			DSN:    "file:test.db",
		},
		Chains: []config.ChainConfig{
			{
				ChainID:           31337,
				HTTPRPCURL:        "http://127.0.0.1:8545",
				SettlementAddress: "0x1111111111111111111111111111111111111111",
			},
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "postgres database driver")
}

func TestNewServiceContextRequiresDatabaseDSN(t *testing.T) {
	_, err := NewServiceContext(config.Config{
		Database: config.DatabaseConfig{
			Driver: "postgres",
		},
		Chains: []config.ChainConfig{
			{
				ChainID:           31337,
				HTTPRPCURL:        "http://127.0.0.1:8545",
				SettlementAddress: "0x1111111111111111111111111111111111111111",
			},
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "database dsn")
}

func TestServiceContextCloseIsIdempotentWithoutResources(t *testing.T) {
	ctx := &ServiceContext{}

	ctx.Close()
	ctx.Close()
}

func TestNewServiceContextRejectsDuplicateRouteQuoteChainTargets(t *testing.T) {
	_, err := NewServiceContext(config.Config{
		Database: config.DatabaseConfig{
			Driver: "postgres",
			DSN:    "postgres://fluxswap:fluxswap@127.0.0.1:5432/fluxswap?sslmode=disable",
		},
		Chains: []config.ChainConfig{
			{
				ChainID:           31337,
				HTTPRPCURL:        "http://127.0.0.1:8545",
				SettlementAddress: "0x1111111111111111111111111111111111111111",
			},
			{
				ChainID:           31337,
				HTTPRPCURL:        "http://127.0.0.1:8545",
				SettlementAddress: "0x2222222222222222222222222222222222222222",
			},
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate route quote target configured for chain 31337")
}
