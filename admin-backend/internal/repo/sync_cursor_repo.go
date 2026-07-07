package repo

import (
	"fluxswap-admin-backend/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SyncCursorRepo struct {
	db *gorm.DB
}

func NewSyncCursorRepo(db *gorm.DB) *SyncCursorRepo {
	return &SyncCursorRepo{db: db}
}

func (r *SyncCursorRepo) Upsert(cursor *domain.ChainSyncCursor) error {
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "chain_id"},
			{Name: "contract_address"},
			{Name: "event_code"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"event_label",
			"last_block_number",
			"last_block_hash",
			"updated_at",
		}),
	}).Create(cursor).Error
}

func (r *SyncCursorRepo) List() ([]domain.ChainSyncCursor, error) {
	var cursors []domain.ChainSyncCursor
	if err := r.db.Order("updated_at DESC").Find(&cursors).Error; err != nil {
		return nil, err
	}
	return cursors, nil
}
