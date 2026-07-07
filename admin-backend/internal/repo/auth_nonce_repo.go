package repo

import (
	"time"

	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
)

type AuthNonceRepo struct {
	db *gorm.DB
}

func NewAuthNonceRepo(db *gorm.DB) *AuthNonceRepo {
	return &AuthNonceRepo{db: db}
}

func (r *AuthNonceRepo) Create(nonce *domain.AdminAuthNonce) error {
	return r.db.Create(nonce).Error
}

func (r *AuthNonceRepo) FindUnusedByNonce(nonce string) (*domain.AdminAuthNonce, error) {
	var record domain.AdminAuthNonce
	if err := r.db.Where("nonce = ? AND used = false", nonce).First(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func (r *AuthNonceRepo) Save(nonce *domain.AdminAuthNonce) error {
	return r.db.Save(nonce).Error
}

func (r *AuthNonceRepo) DeleteExpired(now time.Time) error {
	return r.db.Where("expires_at <= ?", now).Delete(&domain.AdminAuthNonce{}).Error
}
