package repo

import (
	"time"

	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
)

type AdminSessionRepo struct {
	db *gorm.DB
}

func NewAdminSessionRepo(db *gorm.DB) *AdminSessionRepo {
	return &AdminSessionRepo{db: db}
}

func (r *AdminSessionRepo) Create(session *domain.AdminSession) error {
	return r.db.Create(session).Error
}

func (r *AdminSessionRepo) FindActiveByTokenHash(tokenHash string, now time.Time) (*domain.AdminSession, error) {
	var session domain.AdminSession
	if err := r.db.
		Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, now).
		First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *AdminSessionRepo) DeleteExpired(now time.Time) error {
	return r.db.Where("expires_at <= ?", now).Delete(&domain.AdminSession{}).Error
}
