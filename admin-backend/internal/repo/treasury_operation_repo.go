package repo

import (
	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TreasuryOperationRepo struct {
	db *gorm.DB
}

func NewTreasuryOperationRepo(db *gorm.DB) *TreasuryOperationRepo {
	return &TreasuryOperationRepo{db: db}
}

func (r *TreasuryOperationRepo) Upsert(operation *domain.TreasuryOperation) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "operation_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"chain_id",
			"treasury_address",
			"operation_type_code",
			"operation_type_label",
			"status_code",
			"status_label",
			"proposer_address",
			"executor_address",
			"canceller_address",
			"schedule_tx_hash",
			"execute_tx_hash",
			"cancel_tx_hash",
			"ready_at",
			"executed_at",
			"cancelled_at",
			"params",
			"summary",
			"updated_at",
		}),
	}).Create(operation).Error
}

func (r *TreasuryOperationRepo) List(filter TreasuryOperationFilter) ([]domain.TreasuryOperation, int64, error) {
	query := r.db.Model(&domain.TreasuryOperation{})
	query = applyTreasuryOperationFilter(query, filter)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var operations []domain.TreasuryOperation
	page, pageSize := normalizePage(filter.Page, filter.PageSize)
	if err := query.
		Order("created_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&operations).Error; err != nil {
		return nil, 0, err
	}

	return operations, total, nil
}

func (r *TreasuryOperationRepo) FindByOperationID(operationID string) (*domain.TreasuryOperation, error) {
	var operation domain.TreasuryOperation
	if err := r.db.Where("operation_id = ?", operationID).First(&operation).Error; err != nil {
		return nil, err
	}
	return &operation, nil
}

func (r *TreasuryOperationRepo) Save(operation *domain.TreasuryOperation) error {
	return r.db.Save(operation).Error
}

type TreasuryOperationFilter struct {
	ChainID         int64
	TreasuryAddress string
	StatusCode      string
	TypeCode        string
	ProposerAddress string
	Page            int
	PageSize        int
}

func applyTreasuryOperationFilter(query *gorm.DB, filter TreasuryOperationFilter) *gorm.DB {
	if filter.ChainID > 0 {
		query = query.Where("chain_id = ?", filter.ChainID)
	}
	if filter.TreasuryAddress != "" {
		query = query.Where("treasury_address = ?", filter.TreasuryAddress)
	}
	if filter.StatusCode != "" {
		query = query.Where("status_code = ?", filter.StatusCode)
	}
	if filter.TypeCode != "" {
		query = query.Where("operation_type_code = ?", filter.TypeCode)
	}
	if filter.ProposerAddress != "" {
		query = query.Where("proposer_address = ?", filter.ProposerAddress)
	}
	return query
}

func normalizePage(page int, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}
