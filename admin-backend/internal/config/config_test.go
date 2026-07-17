package config

import "testing"

const productionAdminWallet = "0x0000000000000000000000000000000000000001"
const productionTreasuryAddress = "0x0000000000000000000000000000000000000002"

func TestValidateAllowsLocalDevelopmentConfig(t *testing.T) {
	cfg := Config{
		AppEnv:      "local",
		DatabaseDSN: "host=host.docker.internal user=fluxswap dbname=fluxswap_admin",
		AllowedURLs: []string{
			"http://localhost:3001",
		},
		ChainConfigs: map[int64]ChainConfig{
			31337: {
				ChainID:         31337,
				RPCURL:          "http://host.docker.internal:8545",
				TreasuryAddress: productionTreasuryAddress,
				Enabled:         true,
			},
		},
	}

	if err := cfg.Validate(); err != nil {
		t.Fatalf("本地开发配置不应该触发生产隔离校验: %v", err)
	}
}

func TestValidateRejectsProductionWithoutAdminWallets(t *testing.T) {
	cfg := validProductionConfig()
	cfg.AdminWallets = nil

	if err := cfg.Validate(); err == nil {
		t.Fatal("生产环境未配置管理员钱包时应该启动失败")
	}
}

func TestValidateRejectsProductionLocalDatabase(t *testing.T) {
	cfg := validProductionConfig()
	cfg.DatabaseDSN = "host=localhost user=fluxswap dbname=fluxswap_admin"

	if err := cfg.Validate(); err == nil {
		t.Fatal("生产环境数据库指向本地地址时应该启动失败")
	}
}

func TestValidateRejectsProductionLocalAllowedOrigin(t *testing.T) {
	cfg := validProductionConfig()
	cfg.AllowedURLs = []string{"http://127.0.0.1:3001"}

	if err := cfg.Validate(); err == nil {
		t.Fatal("生产环境 CORS 来源包含本地地址时应该启动失败")
	}
}

func TestValidateRejectsProductionLocalChainConfig(t *testing.T) {
	cfg := validProductionConfig()
	cfg.ChainConfigs = map[int64]ChainConfig{
		31337: {
			ChainID:         31337,
			RPCURL:          "http://host.docker.internal:8545",
			TreasuryAddress: productionTreasuryAddress,
			Enabled:         true,
		},
	}

	if err := cfg.Validate(); err == nil {
		t.Fatal("生产环境配置本地链时应该启动失败")
	}
}

func TestValidateAcceptsProductionConfig(t *testing.T) {
	cfg := validProductionConfig()

	if err := cfg.Validate(); err != nil {
		t.Fatalf("合法生产配置不应该被拒绝: %v", err)
	}
}

func validProductionConfig() Config {
	return Config{
		AppEnv:      "production",
		DatabaseDSN: "host=db.internal.example.com user=fluxswap dbname=fluxswap_admin",
		AllowedURLs: []string{
			"https://admin.example.com",
		},
		AdminWallets: []string{productionAdminWallet},
		ChainConfigs: map[int64]ChainConfig{
			11155111: {
				ChainID:         11155111,
				RPCURL:          "https://sepolia.infura.io/v3/example",
				TreasuryAddress: productionTreasuryAddress,
				Enabled:         true,
			},
		},
	}
}
