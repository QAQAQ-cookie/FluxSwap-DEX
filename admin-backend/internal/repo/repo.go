package repo

import "gorm.io/gorm"

type Repositories struct {
	AuthNonce         *AuthNonceRepo
	AdminSession      *AdminSessionRepo
	TreasuryOperation *TreasuryOperationRepo
	OperationLog      *OperationLogRepo
	SyncCursor        *SyncCursorRepo
	Maintenance       *MaintenanceRepo
}

func New(db *gorm.DB) Repositories {
	return Repositories{
		AuthNonce:         NewAuthNonceRepo(db),
		AdminSession:      NewAdminSessionRepo(db),
		TreasuryOperation: NewTreasuryOperationRepo(db),
		OperationLog:      NewOperationLogRepo(db),
		SyncCursor:        NewSyncCursorRepo(db),
		Maintenance:       NewMaintenanceRepo(db),
	}
}
