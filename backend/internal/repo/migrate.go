package repo

import (
	"fmt"

	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

// AutoMigrate 初始化执行器后端所需的最小数据库结构。
func AutoMigrate(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database is required")
	}

	return db.AutoMigrate(
		&domain.Order{},
		&domain.OrderEvent{},
		&domain.SyncCursor{},
	)
}

