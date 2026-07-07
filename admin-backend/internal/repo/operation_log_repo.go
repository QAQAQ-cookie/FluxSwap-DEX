package repo

import (
	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
)

type OperationLogRepo struct {
	db *gorm.DB
}

func NewOperationLogRepo(db *gorm.DB) *OperationLogRepo {
	return &OperationLogRepo{db: db}
}

func (r *OperationLogRepo) Create(log *domain.AdminOperationLog) error {
	return r.db.Create(log).Error
}

func (r *OperationLogRepo) List(filter OperationLogFilter) ([]domain.AdminOperationLog, int64, error) {
	query := r.db.Model(&domain.AdminOperationLog{})
	if filter.ActorAddress != "" {
		query = query.Where("actor_address = ?", filter.ActorAddress)
	}
	if filter.ModuleCode != "" {
		query = query.Where("module_code = ?", filter.ModuleCode)
	}
	if filter.ActionCode != "" {
		query = query.Where("action_code = ?", filter.ActionCode)
	}
	if filter.ResultCode != "" {
		query = query.Where("result_code = ?", filter.ResultCode)
	}
	if filter.ChainID > 0 {
		query = query.Where("chain_id = ?", filter.ChainID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page, pageSize := normalizePage(filter.Page, filter.PageSize)
	var logs []domain.AdminOperationLog
	if err := query.
		Order("created_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&logs).Error; err != nil {
		return nil, 0, err
	}
	return logs, total, nil
}

type OperationLogFilter struct {
	ActorAddress string
	ModuleCode   string
	ActionCode   string
	ResultCode   string
	ChainID      int64
	Page         int
	PageSize     int
}
