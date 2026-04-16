package repo

import (
	"fmt"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// OpenPostgres 创建供 RPC 和各个 worker 共享使用的 Gorm 数据库连接。
func OpenPostgres(dsn string) (*gorm.DB, error) {
	trimmedDSN := strings.TrimSpace(dsn)
	if trimmedDSN == "" {
		return nil, fmt.Errorf("database dsn is required")
	}

	db, err := gorm.Open(postgres.Open(trimmedDSN), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	return db, nil
}
