package httpserver

import (
	"context"
	"math/big"
	"net/http"
	"time"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/chain"
	"fluxswap-admin-backend/internal/config"
	"fluxswap-admin-backend/internal/domain"
	"fluxswap-admin-backend/internal/labels"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type treasuryHandlers struct {
	repos repo.Repositories
	cfg   config.Config
}

type upsertTreasuryOperationRequest struct {
	OperationID        string         `json:"operationId" binding:"required"`
	ChainID            int64          `json:"chainId" binding:"required"`
	TreasuryAddress    string         `json:"treasuryAddress" binding:"required"`
	OperationTypeCode  string         `json:"operationTypeCode" binding:"required"`
	OperationTypeLabel string         `json:"operationTypeLabel"`
	StatusCode         string         `json:"statusCode"`
	StatusLabel        string         `json:"statusLabel"`
	ProposerAddress    string         `json:"proposerAddress" binding:"required"`
	ScheduleTxHash     string         `json:"scheduleTxHash"`
	ReadyAt            *time.Time     `json:"readyAt"`
	Params             domain.JSONMap `json:"params"`
	Summary            string         `json:"summary"`
}

type updateTreasuryOperationStatusRequest struct {
	StatusCode    string         `json:"statusCode" binding:"required"`
	StatusLabel   string         `json:"statusLabel"`
	ActorAddress  string         `json:"actorAddress"`
	ExecuteTxHash string         `json:"executeTxHash"`
	CancelTxHash  string         `json:"cancelTxHash"`
	FailureTxHash string         `json:"failureTxHash"`
	RequestData   domain.JSONMap `json:"requestData"`
}

func (h treasuryHandlers) upsertOperation(ctx *gin.Context) {
	var req upsertTreasuryOperationRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, "请求参数无效")
		return
	}

	// 前端在链上排队交易成功后提交详情；后端保存业务参数，链上仍然负责最终状态。
	now := time.Now().UTC()
	statusCode := req.StatusCode
	if statusCode == "" {
		statusCode = "queued"
	}
	typeLabel := req.OperationTypeLabel
	if typeLabel == "" {
		typeLabel = labels.OperationType(req.OperationTypeCode)
	}
	statusLabel := req.StatusLabel
	if statusLabel == "" {
		statusLabel = labels.Status(statusCode)
	}
	params := req.Params
	if params == nil {
		params = domain.JSONMap{}
	}

	chainConfig, ok := h.cfg.FindChainConfig(req.ChainID)
	if !ok {
		fail(ctx, http.StatusBadRequest, "当前链未在管理后端启用")
		return
	}
	if auth.NormalizeAddress(req.TreasuryAddress) != chainConfig.TreasuryAddress {
		fail(ctx, http.StatusBadRequest, "金库地址和管理后端配置不匹配")
		return
	}
	admin := adminAddress(ctx)
	if auth.NormalizeAddress(req.ProposerAddress) != admin {
		fail(ctx, http.StatusForbidden, "发起人地址必须和当前登录管理员一致")
		return
	}
	if readyAt, err := h.operationReadyAt(ctx.Request.Context(), chainConfig, req.OperationID); err != nil {
		fail(ctx, http.StatusBadRequest, "链上治理操作校验失败")
		return
	} else if readyAt != nil {
		if readyAt.Sign() <= 0 {
			fail(ctx, http.StatusBadRequest, "链上不存在待处理的治理操作")
			return
		}
		chainReadyAt := time.Unix(readyAt.Int64(), 0).UTC()
		req.ReadyAt = &chainReadyAt
	}

	// code 给程序判断，label 给数据库和页面直接查看，避免中文文案影响状态机逻辑。
	operation := &domain.TreasuryOperation{
		OperationID:        req.OperationID,
		ChainID:            req.ChainID,
		TreasuryAddress:    auth.NormalizeAddress(req.TreasuryAddress),
		OperationTypeCode:  req.OperationTypeCode,
		OperationTypeLabel: typeLabel,
		StatusCode:         statusCode,
		StatusLabel:        statusLabel,
		ProposerAddress:    auth.NormalizeAddress(req.ProposerAddress),
		ScheduleTxHash:     req.ScheduleTxHash,
		ReadyAt:            req.ReadyAt,
		Params:             params,
		Summary:            req.Summary,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := h.repos.TreasuryOperation.Upsert(operation); err != nil {
		fail(ctx, http.StatusInternalServerError, "保存金库治理操作失败")
		return
	}

	// 金库治理操作每次保存都写审计日志，方便管理端日志页复盘是谁提交了哪笔操作。
	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress:    operation.ProposerAddress,
		ModuleCode:      "treasury",
		ModuleLabel:     labels.Module("treasury"),
		ActionCode:      "schedule_operation",
		ActionLabel:     labels.Action("schedule_operation"),
		TargetID:        operation.OperationID,
		ChainID:         operation.ChainID,
		ContractAddress: operation.TreasuryAddress,
		TxHash:          operation.ScheduleTxHash,
		ResultCode:      "success",
		ResultLabel:     labels.Result("success"),
		RequestData:     params,
		CreatedAt:       now,
	})

	created(ctx, operation)
}

func (h treasuryHandlers) listOperations(ctx *gin.Context) {
	// 列表接口面向管理端弹窗和表格，默认按创建时间倒序分页返回。
	page := queryInt(ctx, "page", 1)
	pageSize := queryInt(ctx, "pageSize", 20)
	operations, total, err := h.repos.TreasuryOperation.List(repo.TreasuryOperationFilter{
		ChainID:         queryInt64(ctx, "chainId"),
		TreasuryAddress: auth.NormalizeAddress(ctx.Query("treasuryAddress")),
		StatusCode:      ctx.Query("statusCode"),
		TypeCode:        ctx.Query("operationTypeCode"),
		ProposerAddress: auth.NormalizeAddress(ctx.Query("proposerAddress")),
		Page:            page,
		PageSize:        pageSize,
	})
	if err != nil {
		fail(ctx, http.StatusInternalServerError, "查询金库治理操作失败")
		return
	}

	ok(ctx, pageResponse{
		Items:    operations,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

func (h treasuryHandlers) getOperation(ctx *gin.Context) {
	operation, err := h.repos.TreasuryOperation.FindByOperationID(ctx.Param("operationId"))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			fail(ctx, http.StatusNotFound, "金库治理操作不存在")
			return
		}
		fail(ctx, http.StatusInternalServerError, "查询金库治理操作失败")
		return
	}
	ok(ctx, operation)
}

func (h treasuryHandlers) updateOperationStatus(ctx *gin.Context) {
	var req updateTreasuryOperationStatusRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, "请求参数无效")
		return
	}

	operation, err := h.repos.TreasuryOperation.FindByOperationID(ctx.Param("operationId"))
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			fail(ctx, http.StatusNotFound, "金库治理操作不存在")
			return
		}
		fail(ctx, http.StatusInternalServerError, "查询金库治理操作失败")
		return
	}

	now := time.Now().UTC()
	operation.StatusCode = req.StatusCode
	operation.StatusLabel = req.StatusLabel
	if operation.StatusLabel == "" {
		operation.StatusLabel = labels.Status(req.StatusCode)
	}
	operation.UpdatedAt = now

	chainConfig, found := h.cfg.FindChainConfig(operation.ChainID)
	if !found {
		fail(ctx, http.StatusBadRequest, "当前链未在管理后端启用")
		return
	}
	if auth.NormalizeAddress(operation.TreasuryAddress) != chainConfig.TreasuryAddress {
		fail(ctx, http.StatusBadRequest, "数据库中的金库地址和链配置不匹配")
		return
	}

	if readyAt, err := h.operationReadyAt(ctx.Request.Context(), chainConfig, operation.OperationID); err == nil && readyAt != nil {
		if (req.StatusCode == "executed" || req.StatusCode == "cancelled") && readyAt.Sign() > 0 {
			fail(ctx, http.StatusBadRequest, "链上治理操作仍处于待处理状态，请稍后再同步")
			return
		}
	} else if err != nil {
		fail(ctx, http.StatusBadRequest, "链上治理操作状态校验失败")
		return
	}

	// 状态更新目前由前端根据钱包交易结果上报；后续链上同步器会继续做对账修正。
	actionCode := "update_operation"
	txHash := req.FailureTxHash
	actor := adminAddress(ctx)
	requestActor := auth.NormalizeAddress(req.ActorAddress)
	if requestActor != "" && requestActor != actor {
		fail(ctx, http.StatusForbidden, "操作人地址必须和当前登录管理员一致")
		return
	}
	switch req.StatusCode {
	case "executed":
		operation.ExecutorAddress = actor
		operation.ExecuteTxHash = req.ExecuteTxHash
		operation.ExecutedAt = &now
		actionCode = "execute_operation"
		txHash = req.ExecuteTxHash
	case "cancelled":
		operation.CancellerAddress = actor
		operation.CancelTxHash = req.CancelTxHash
		operation.CancelledAt = &now
		actionCode = "cancel_operation"
		txHash = req.CancelTxHash
	}

	if err := h.repos.TreasuryOperation.Save(operation); err != nil {
		fail(ctx, http.StatusInternalServerError, "更新金库治理操作状态失败")
		return
	}

	requestData := req.RequestData
	if requestData == nil {
		requestData = domain.JSONMap{"statusCode": req.StatusCode}
	}
	// 状态变更同样写审计日志，执行和取消会分别记录对应交易哈希。
	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress:    actor,
		ModuleCode:      "treasury",
		ModuleLabel:     labels.Module("treasury"),
		ActionCode:      actionCode,
		ActionLabel:     labels.Action(actionCode),
		TargetID:        operation.OperationID,
		ChainID:         operation.ChainID,
		ContractAddress: operation.TreasuryAddress,
		TxHash:          txHash,
		ResultCode:      "success",
		ResultLabel:     labels.Result("success"),
		RequestData:     requestData,
		CreatedAt:       now,
	})

	ok(ctx, operation)
}

func (h treasuryHandlers) operationReadyAt(ctx context.Context, chainConfig config.ChainConfig, operationID string) (*big.Int, error) {
	client, err := chain.NewTreasuryClient(chainConfig.RPCURL, chainConfig.TreasuryAddress)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, nil
	}
	return client.OperationReadyAt(ctx, operationID)
}
