package httpserver

import (
	"net/http"
	"time"

	"fluxswap-admin-backend/internal/domain"
	"fluxswap-admin-backend/internal/labels"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
)

type maintenanceHandlers struct {
	repos repo.Repositories
}

func (h maintenanceHandlers) cleanup(ctx *gin.Context) {
	now := time.Now().UTC()
	if err := h.repos.AuthNonce.DeleteExpired(now); err != nil {
		fail(ctx, http.StatusInternalServerError, "清理过期登录随机数失败")
		return
	}
	if err := h.repos.AdminSession.DeleteExpired(now); err != nil {
		fail(ctx, http.StatusInternalServerError, "清理过期登录会话失败")
		return
	}

	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress: adminAddress(ctx),
		ModuleCode:   "maintenance",
		ModuleLabel:  labels.Module("maintenance"),
		ActionCode:   "cleanup_expired",
		ActionLabel:  labels.Action("cleanup_expired"),
		ResultCode:   "success",
		ResultLabel:  labels.Result("success"),
		RequestData:  domain.JSONMap{},
		CreatedAt:    now,
	})

	ok(ctx, gin.H{"cleaned": true})
}

func (h maintenanceHandlers) resetLocalData(ctx *gin.Context) {
	actor := adminAddress(ctx)
	if err := h.repos.Maintenance.ClearAdminData(); err != nil {
		fail(ctx, http.StatusInternalServerError, "清空管理端数据失败")
		return
	}

	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress: actor,
		ModuleCode:   "maintenance",
		ModuleLabel:  labels.Module("maintenance"),
		ActionCode:   "reset_local_data",
		ActionLabel:  labels.Action("reset_local_data"),
		ResultCode:   "success",
		ResultLabel:  labels.Result("success"),
		RequestData:  domain.JSONMap{},
		CreatedAt:    time.Now().UTC(),
	})
	ok(ctx, gin.H{"reset": true})
}
