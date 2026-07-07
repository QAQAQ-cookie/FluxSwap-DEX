package domain

import "time"

type AdminAuthNonce struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	WalletAddress string     `gorm:"size:42;not null;index:idx_admin_auth_nonces_wallet" json:"walletAddress"`
	Nonce         string     `gorm:"size:128;not null;uniqueIndex:idx_admin_auth_nonces_nonce" json:"nonce"`
	Message       string     `gorm:"type:text;not null" json:"message"`
	ExpiresAt     time.Time  `gorm:"not null;index:idx_admin_auth_nonces_expires_at" json:"expiresAt"`
	Used          bool       `gorm:"not null;default:false;index:idx_admin_auth_nonces_used" json:"used"`
	UsedAt        *time.Time `json:"usedAt,omitempty"`
	CreatedAt     time.Time  `gorm:"not null" json:"createdAt"`
	UpdatedAt     time.Time  `gorm:"not null" json:"updatedAt"`
}
