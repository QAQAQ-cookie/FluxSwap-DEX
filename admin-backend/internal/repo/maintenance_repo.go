package repo

import (
	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
)

type MaintenanceRepo struct {
	db *gorm.DB
}

func NewMaintenanceRepo(db *gorm.DB) *MaintenanceRepo {
	return &MaintenanceRepo{db: db}
}

func (r *MaintenanceRepo) ClearAdminData() error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.AdminAuthNonce{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.AdminSession{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.TreasuryOperation{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.AdminOperationLog{}).Error; err != nil {
			return err
		}
		if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&domain.ChainSyncCursor{}).Error; err != nil {
			return err
		}
		return nil
	})
}
