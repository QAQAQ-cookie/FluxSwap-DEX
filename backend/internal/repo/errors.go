package repo

import (
	"errors"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

// IsDuplicateKeyError 判断错误是否属于数据库唯一键冲突。
func IsDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}

	normalized := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(normalized, "duplicate key") ||
		strings.Contains(normalized, "duplicate entry") ||
		strings.Contains(normalized, "unique constraint failed") ||
		strings.Contains(normalized, "constraint failed")
}
