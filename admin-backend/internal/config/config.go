package config

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
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
	ChainConfig        ChainConfig
	SyncLookbackBlocks uint64
}

func Load() (Config, error) {
	chainConfig, err := loadChainConfig()
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppEnv:             envString("ADMIN_APP_ENV", "local"),
		HTTPAddr:           envString("ADMIN_HTTP_ADDR", ":8081"),
		DatabaseDSN:        envString("ADMIN_DATABASE_DSN", ""),
		AllowedURLs:        envList("ADMIN_ALLOWED_ORIGINS"),
		AdminWallets:       normalizeList(envList("ADMIN_WALLETS")),
		SessionTTLHours:    envInt("ADMIN_SESSION_TTL_HOURS", 12),
		ChainConfig:        chainConfig,
		SyncLookbackBlocks: uint64(envInt("ADMIN_SYNC_LOOKBACK_BLOCKS", 20_000)),
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) FindChainConfig(chainID int64) (ChainConfig, bool) {
	if !c.ChainConfig.Enabled || c.ChainConfig.ChainID != chainID {
		return ChainConfig{}, false
	}
	return c.ChainConfig, true
}

func (c Config) Validate() error {
	if !strings.EqualFold(strings.TrimSpace(c.AppEnv), "production") {
		return nil
	}

	if len(c.AdminWallets) == 0 {
		return fmt.Errorf("ADMIN_WALLETS is required in production")
	}
	for _, wallet := range c.AdminWallets {
		if !common.IsHexAddress(wallet) {
			return fmt.Errorf("ADMIN_WALLETS contains invalid wallet address %q in production", wallet)
		}
	}
	if strings.TrimSpace(c.DatabaseDSN) == "" {
		return fmt.Errorf("ADMIN_DATABASE_DSN is required in production")
	}
	if isLocalEndpoint(c.DatabaseDSN) {
		return fmt.Errorf("ADMIN_DATABASE_DSN must not point to a local host in production")
	}

	for _, origin := range c.AllowedURLs {
		if strings.TrimSpace(origin) == "*" {
			return fmt.Errorf("ADMIN_ALLOWED_ORIGINS must not allow wildcard origins in production")
		}
		if isLocalEndpoint(origin) {
			return fmt.Errorf("ADMIN_ALLOWED_ORIGINS must not contain local origin %q in production", origin)
		}
	}

	chainConfig := c.ChainConfig
	if !chainConfig.Enabled {
		return fmt.Errorf("ADMIN_CHAIN_ID is required in production")
	}
	if isLocalChainID(chainConfig.ChainID) {
		return fmt.Errorf("ADMIN_CHAIN_ID %d is not allowed in production", chainConfig.ChainID)
	}
	if isLocalEndpoint(chainConfig.RPCURL) {
		return fmt.Errorf("ADMIN_RPC_URL must not point to a local host in production")
	}

	return nil
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

func isLocalChainID(chainID int64) bool {
	return chainID == 31337 || chainID == 1337
}

func isLocalEndpoint(raw string) bool {
	host := endpointHost(raw)
	if host == "" {
		return false
	}

	host = strings.ToLower(strings.Trim(host, "[]"))
	if host == "localhost" || host == "host.docker.internal" {
		return true
	}
	if strings.HasSuffix(host, ".localhost") {
		return true
	}

	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

func endpointHost(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}

	if parsed, err := url.Parse(value); err == nil && parsed.Host != "" {
		if host := parsed.Hostname(); host != "" {
			return host
		}
		return parsed.Host
	}

	for _, part := range strings.Fields(value) {
		if !strings.Contains(part, "=") {
			continue
		}
		keyValue := strings.SplitN(part, "=", 2)
		key := strings.ToLower(strings.TrimSpace(keyValue[0]))
		if key != "host" {
			continue
		}
		host := strings.Trim(strings.TrimSpace(keyValue[1]), `'"`)
		if parsedHost, _, err := net.SplitHostPort(host); err == nil {
			return parsedHost
		}
		return host
	}

	if host, _, err := net.SplitHostPort(value); err == nil {
		return host
	}
	return value
}

func loadChainConfig() (ChainConfig, error) {
	rawChainID := strings.TrimSpace(os.Getenv("ADMIN_CHAIN_ID"))
	if rawChainID == "" {
		return ChainConfig{}, nil
	}

	chainID, err := strconv.ParseInt(rawChainID, 10, 64)
	if err != nil || chainID <= 0 {
		return ChainConfig{}, fmt.Errorf("ADMIN_CHAIN_ID must be a positive integer")
	}

	chainConfig := ChainConfig{
		ChainID:         chainID,
		ChainName:       envString("ADMIN_CHAIN_NAME", ""),
		RPCURL:          envString("ADMIN_RPC_URL", ""),
		TreasuryAddress: strings.ToLower(envString("ADMIN_TREASURY_ADDRESS", "")),
		Enabled:         true,
	}
	if chainConfig.RPCURL == "" {
		return ChainConfig{}, fmt.Errorf("ADMIN_RPC_URL is required when ADMIN_CHAIN_ID is configured")
	}
	if !common.IsHexAddress(chainConfig.TreasuryAddress) {
		return ChainConfig{}, fmt.Errorf("ADMIN_TREASURY_ADDRESS must be a valid address when ADMIN_CHAIN_ID is configured")
	}

	return chainConfig, nil
}
