package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/common"
)

type ChainConfig struct {
	ChainID         int64
	ChainName       string
	RPCURL          string
	TreasuryAddress string
	Enabled         bool
}

type Config struct {
	AppEnv             string
	HTTPAddr           string
	DatabaseDSN        string
	AllowedURLs        []string
	AdminWallets       []string
	SessionTTLHours    int
	ChainConfigs       map[int64]ChainConfig
	SyncLookbackBlocks uint64
}

func Load() (Config, error) {
	chainConfigs, err := loadChainConfigs()
	if err != nil {
		return Config{}, err
	}

	return Config{
		AppEnv:             envString("ADMIN_APP_ENV", "local"),
		HTTPAddr:           envString("ADMIN_HTTP_ADDR", ":8081"),
		DatabaseDSN:        envString("ADMIN_DATABASE_DSN", ""),
		AllowedURLs:        envList("ADMIN_ALLOWED_ORIGINS"),
		AdminWallets:       normalizeList(envList("ADMIN_WALLETS")),
		SessionTTLHours:    envInt("ADMIN_SESSION_TTL_HOURS", 12),
		ChainConfigs:       chainConfigs,
		SyncLookbackBlocks: uint64(envInt("ADMIN_SYNC_LOOKBACK_BLOCKS", 20_000)),
	}, nil
}

func (c Config) FindChainConfig(chainID int64) (ChainConfig, bool) {
	chainConfig, ok := c.ChainConfigs[chainID]
	if !ok || !chainConfig.Enabled {
		return ChainConfig{}, false
	}
	return chainConfig, true
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envList(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	values := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	var parsed int
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil {
		return fallback
	}
	return parsed
}

func normalizeList(values []string) []string {
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.ToLower(strings.TrimSpace(value))
		if trimmed != "" {
			normalized = append(normalized, trimmed)
		}
	}
	return normalized
}

type rawChainConfig struct {
	ChainID         int64  `json:"chainId"`
	ChainName       string `json:"chainName"`
	RPCURL          string `json:"rpcUrl"`
	TreasuryAddress string `json:"treasuryAddress"`
	Enabled         *bool  `json:"enabled"`
}

func loadChainConfigs() (map[int64]ChainConfig, error) {
	raw := strings.TrimSpace(os.Getenv("ADMIN_CHAIN_CONFIGS"))
	if raw == "" {
		return map[int64]ChainConfig{}, nil
	}

	var parsed []rawChainConfig
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, fmt.Errorf("parse ADMIN_CHAIN_CONFIGS: %w", err)
	}

	chainConfigs := make(map[int64]ChainConfig, len(parsed))
	for _, item := range parsed {
		if item.ChainID <= 0 {
			return nil, fmt.Errorf("ADMIN_CHAIN_CONFIGS contains invalid chainId: %d", item.ChainID)
		}
		if _, exists := chainConfigs[item.ChainID]; exists {
			return nil, fmt.Errorf("ADMIN_CHAIN_CONFIGS contains duplicated chainId: %d", item.ChainID)
		}

		enabled := true
		if item.Enabled != nil {
			enabled = *item.Enabled
		}

		chainConfig := ChainConfig{
			ChainID:         item.ChainID,
			ChainName:       strings.TrimSpace(item.ChainName),
			RPCURL:          strings.TrimSpace(item.RPCURL),
			TreasuryAddress: strings.ToLower(strings.TrimSpace(item.TreasuryAddress)),
			Enabled:         enabled,
		}

		if chainConfig.Enabled {
			if chainConfig.RPCURL == "" {
				return nil, fmt.Errorf("ADMIN_CHAIN_CONFIGS chainId %d is missing rpcUrl", chainConfig.ChainID)
			}
			if !common.IsHexAddress(chainConfig.TreasuryAddress) {
				return nil, fmt.Errorf("ADMIN_CHAIN_CONFIGS chainId %d has invalid treasuryAddress", chainConfig.ChainID)
			}
		}

		chainConfigs[chainConfig.ChainID] = chainConfig
	}

	return chainConfigs, nil
}
