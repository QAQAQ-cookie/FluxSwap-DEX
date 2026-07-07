package domain

import "time"

type AdminSession struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	TokenHash     string     `gorm:"size:64;not null;uniqueIndex:idx_admin_sessions_token_hash" json:"tokenHash"`
	WalletAddress string     `gorm:"size:42;not null;index:idx_admin_sessions_wallet" json:"walletAddress"`
	RoleCode      string     `gorm:"size:32;not null" json:"roleCode"`
	RoleLabel     string     `gorm:"size:32;not null" json:"roleLabel"`
	ExpiresAt     time.Time  `gorm:"not null;index:idx_admin_sessions_expires_at" json:"expiresAt"`
	RevokedAt     *time.Time `json:"revokedAt,omitempty"`
	CreatedAt     time.Time  `gorm:"not null" json:"createdAt"`
	UpdatedAt     time.Time  `gorm:"not null" json:"updatedAt"`
}
