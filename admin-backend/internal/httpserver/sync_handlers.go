package httpserver

import (
	"net/http"
	"time"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/domain"
	"fluxswap-admin-backend/internal/labels"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
)

type syncHandlers struct {
	repos repo.Repositories
}

type upsertSyncCursorRequest struct {
	ChainID         int64  `json:"chainId" binding:"required"`
	ContractAddress string `json:"contractAddress" binding:"required"`
	EventCode       string `json:"eventCode" binding:"required"`
	EventLabel      string `json:"eventLabel"`
	LastBlockNumber uint64 `json:"lastBlockNumber"`
	LastBlockHash   string `json:"lastBlockHash"`
}

func (h syncHandlers) upsertCursor(ctx *gin.Context) {
	var req upsertSyncCursorRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, "请求参数无效")
		return
	}

	// 游标记录每类链上事件同步到哪里，避免同步器每次从头扫描历史区块。
	now := time.Now().UTC()
	eventLabel := req.EventLabel
	if eventLabel == "" {
		eventLabel = req.EventCode
	}
	cursor := &domain.ChainSyncCursor{
		ChainID:         req.ChainID,
		ContractAddress: auth.NormalizeAddress(req.ContractAddress),
		EventCode:       req.EventCode,
		EventLabel:      eventLabel,
		LastBlockNumber: req.LastBlockNumber,
		LastBlockHash:   req.LastBlockHash,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := h.repos.SyncCursor.Upsert(cursor); err != nil {
		fail(ctx, http.StatusInternalServerError, "保存链上同步游标失败")
		return
	}

	// 游标推进也写审计日志，后续排查同步延迟时可以看到最后推进记录。
	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress:    "system",
		ModuleCode:      "sync",
		ModuleLabel:     labels.Module("sync"),
		ActionCode:      "sync_chain_state",
		ActionLabel:     labels.Action("sync_chain_state"),
		TargetID:        req.EventCode,
		ChainID:         req.ChainID,
		ContractAddress: cursor.ContractAddress,
		ResultCode:      "success",
		ResultLabel:     labels.Result("success"),
		RequestData: domain.JSONMap{
			"lastBlockNumber": req.LastBlockNumber,
			"lastBlockHash":   req.LastBlockHash,
		},
		CreatedAt: now,
	})

	ok(ctx, cursor)
}

func (h syncHandlers) listCursors(ctx *gin.Context) {
	cursors, err := h.repos.SyncCursor.List()
	if err != nil {
		fail(ctx, http.StatusInternalServerError, "查询链上同步游标失败")
		return
	}
	ok(ctx, cursors)
}
