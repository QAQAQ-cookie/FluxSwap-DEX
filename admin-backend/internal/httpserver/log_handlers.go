package httpserver

import (
	"net/http"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
)

type logHandlers struct {
	repos repo.Repositories
}

func (h logHandlers) listLogs(ctx *gin.Context) {
	// 日志接口用于管理端审计页，支持按操作者、模块、动作、结果和链 ID 过滤。
	page := queryInt(ctx, "page", 1)
	pageSize := queryInt(ctx, "pageSize", 20)
	logs, total, err := h.repos.OperationLog.List(repo.OperationLogFilter{
		ActorAddress: auth.NormalizeAddress(ctx.Query("actorAddress")),
		ModuleCode:   ctx.Query("moduleCode"),
		ActionCode:   ctx.Query("actionCode"),
		ResultCode:   ctx.Query("resultCode"),
		ChainID:      queryInt64(ctx, "chainId"),
		Page:         page,
		PageSize:     pageSize,
	})
	if err != nil {
		fail(ctx, http.StatusInternalServerError, "查询管理操作日志失败")
		return
	}

	ok(ctx, pageResponse{
		Items:    logs,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}
