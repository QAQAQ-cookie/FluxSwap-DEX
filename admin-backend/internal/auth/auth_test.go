package auth

import "testing"

const testAdminAddress = "0x0000000000000000000000000000000000000001"
const otherAddress = "0x0000000000000000000000000000000000000002"

func TestAdminAllowlistAllowsAnyValidWalletInLocalWithoutConfiguredWallets(t *testing.T) {
	allowlist := NewAdminAllowlist(nil, "local")

	if !allowlist.IsConfigured() {
		t.Fatal("本地开发环境空白名单应视为已配置，方便直接登录")
	}
	if !allowlist.IsAdmin(testAdminAddress) {
		t.Fatal("本地开发环境空白名单应允许任意有效钱包登录")
	}
	if allowlist.IsAdmin("not-an-address") {
		t.Fatal("本地开发环境也不能允许无效钱包地址登录")
	}
}

func TestAdminAllowlistRequiresConfiguredWalletsOutsideLocal(t *testing.T) {
	allowlist := NewAdminAllowlist(nil, "production")

	if allowlist.IsConfigured() {
		t.Fatal("非本地环境空白名单不能视为已配置")
	}
	if allowlist.IsAdmin(testAdminAddress) {
		t.Fatal("非本地环境空白名单不能允许钱包登录")
	}
}

func TestAdminAllowlistStillUsesConfiguredWalletsInLocal(t *testing.T) {
	allowlist := NewAdminAllowlist([]string{testAdminAddress}, "local")

	if !allowlist.IsConfigured() {
		t.Fatal("配置管理员钱包后应视为已配置")
	}
	if !allowlist.IsAdmin(testAdminAddress) {
		t.Fatal("配置的钱包应允许登录")
	}
	if allowlist.IsAdmin(otherAddress) {
		t.Fatal("本地环境只要配置了白名单，就不能再允许任意钱包")
	}
}
