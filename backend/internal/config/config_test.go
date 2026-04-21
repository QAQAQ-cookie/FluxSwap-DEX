package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateExecutorChainsRejectsMissingPrivateKey(t *testing.T) {
	err := ValidateExecutorChains([]ChainConfig{
		{
			ChainID:           31337,
			HTTPRPCURL:        "http://127.0.0.1:8545",
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "executor private key")
}

func TestValidateIndexerChainsRejectsMissingWSRPCURL(t *testing.T) {
	err := ValidateIndexerChains([]ChainConfig{
		{
			ChainID:           31337,
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "websocket rpc url")
}

func TestValidateIndexerChainsRejectsNonWebsocketEndpoint(t *testing.T) {
	err := ValidateIndexerChains([]ChainConfig{
		{
			ChainID:           31337,
			WSRPCURL:          "http://127.0.0.1:8545",
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "ws:// or wss://")
}

func TestValidateRPCChainsRejectsDuplicateTargets(t *testing.T) {
	err := ValidateRPCChains([]ChainConfig{
		{
			ChainID:           31337,
			HTTPRPCURL:        "http://127.0.0.1:8545",
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
		{
			ChainID:           31337,
			HTTPRPCURL:        "http://127.0.0.1:9545",
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate chain target")
}

func TestActiveChainsFallsBackToSingleChainWhenOnlyWSRPCURLIsPresent(t *testing.T) {
	cfg := Config{
		Chain: ChainConfig{
			ChainID:           11155111,
			WSRPCURL:          "wss://example.invalid/ws",
			SettlementAddress: "0x1111111111111111111111111111111111111111",
		},
	}

	chains := cfg.ActiveChains()
	require.Len(t, chains, 1)
	require.Equal(t, int64(11155111), chains[0].ChainID)
	require.Equal(t, "wss://example.invalid/ws", chains[0].WSRPCURL)
}

func TestActiveChainsSkipsPlaceholderMultiChainEntries(t *testing.T) {
	cfg := Config{
		Chains: []ChainConfig{
			{
				Name:               "localhost",
				ChainID:            31337,
				HTTPRPCURL:         "http://127.0.0.1:8545",
				WSRPCURL:           "ws://127.0.0.1:8545",
				SettlementAddress:  "0x1111111111111111111111111111111111111111",
				ExecutorPrivateKey: "0xabc",
			},
			{
				Name:    "sepolia",
				ChainID: 11155111,
			},
		},
	}

	chains := cfg.ActiveChains()
	require.Len(t, chains, 1)
	require.Equal(t, int64(31337), chains[0].ChainID)
	require.Equal(t, "localhost", chains[0].Name)
}

func TestWorkerConfigCarriesRPCHealthListenOn(t *testing.T) {
	cfg := Config{
		Worker: WorkerConfig{
			RPCHealthListenOn: "0.0.0.0:9100",
		},
	}

	require.Equal(t, "0.0.0.0:9100", cfg.Worker.RPCHealthListenOn)
}
