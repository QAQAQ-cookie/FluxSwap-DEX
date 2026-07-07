package httpserver

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/config"
	"fluxswap-admin-backend/internal/domain"
	"fluxswap-admin-backend/internal/labels"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type authHandlers struct {
	repos     repo.Repositories
	cfg       config.Config
	allowlist auth.AdminAllowlist
}

type createNonceRequest struct {
	WalletAddress string `json:"walletAddress" binding:"required"`
}

type verifyNonceRequest struct {
	WalletAddress string `json:"walletAddress" binding:"required"`
	Nonce         string `json:"nonce" binding:"required"`
	Signature     string `json:"signature" binding:"required"`
}

func (h authHandlers) createNonce(ctx *gin.Context) {
	var req createNonceRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, "请求参数无效")
		return
	}

	if !h.allowlist.IsConfigured() {
		fail(ctx, http.StatusForbidden, "管理端管理员白名单未配置")
		return
	}

	// 登录分两步：先生成一次性 nonce 和待签名消息，后续再用钱包签名证明地址所有权。
	now := time.Now().UTC()
	nonce, err := randomHex(16)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, "生成登录随机数失败")
		return
	}

	wallet := auth.NormalizeAddress(req.WalletAddress)
	if !auth.IsAddress(wallet) {
		fail(ctx, http.StatusBadRequest, "钱包地址格式无效")
		return
	}
	if !h.allowlist.IsAdmin(wallet) {
		fail(ctx, http.StatusForbidden, "当前钱包没有管理权限")
		return
	}
	message := fmt.Sprintf("FluxSwap 管理端登录\n钱包: %s\n随机数: %s\n时间: %s", wallet, nonce, now.Format(time.RFC3339))
	record := &domain.AdminAuthNonce{
		WalletAddress: wallet,
		Nonce:         nonce,
		Message:       message,
		ExpiresAt:     now.Add(10 * time.Minute),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := h.repos.AuthNonce.Create(record); err != nil {
		fail(ctx, http.StatusInternalServerError, "保存登录随机数失败")
		return
	}

	// 生成 nonce 也写入审计日志，方便后面排查管理端登录链路。
	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress: wallet,
		ModuleCode:   "auth",
		ModuleLabel:  labels.Module("auth"),
		ActionCode:   "auth_nonce",
		ActionLabel:  labels.Action("auth_nonce"),
		ResultCode:   "success",
		ResultLabel:  labels.Result("success"),
		RequestData:  domain.JSONMap{"nonce": nonce},
		CreatedAt:    now,
	})

	ok(ctx, gin.H{
		"walletAddress": wallet,
		"nonce":         nonce,
		"message":       message,
		"expiresAt":     record.ExpiresAt,
	})
}

func (h authHandlers) verifyNonce(ctx *gin.Context) {
	var req verifyNonceRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		fail(ctx, http.StatusBadRequest, "请求参数无效")
		return
	}

	if !h.allowlist.IsConfigured() {
		fail(ctx, http.StatusForbidden, "管理端管理员白名单未配置")
		return
	}

	record, err := h.repos.AuthNonce.FindUnusedByNonce(req.Nonce)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			fail(ctx, http.StatusBadRequest, "登录随机数不存在或已使用")
			return
		}
		fail(ctx, http.StatusInternalServerError, "查询登录随机数失败")
		return
	}

	wallet := auth.NormalizeAddress(req.WalletAddress)
	if !auth.IsAddress(wallet) {
		fail(ctx, http.StatusBadRequest, "钱包地址格式无效")
		return
	}
	if record.WalletAddress != wallet {
		fail(ctx, http.StatusBadRequest, "钱包地址和登录随机数不匹配")
		return
	}
	if time.Now().UTC().After(record.ExpiresAt) {
		fail(ctx, http.StatusBadRequest, "登录随机数已过期")
		return
	}

	recoveredAddress, err := auth.RecoverPersonalSignAddress(record.Message, req.Signature)
	if err != nil || recoveredAddress != wallet {
		fail(ctx, http.StatusUnauthorized, "钱包签名校验失败")
		return
	}
	if !h.allowlist.IsAdmin(wallet) {
		fail(ctx, http.StatusForbidden, "当前钱包没有管理权限")
		return
	}

	// nonce 一旦验证通过就立刻置为已使用，避免重复提交同一份签名。
	now := time.Now().UTC()
	record.Used = true
	record.UsedAt = &now
	record.UpdatedAt = now
	if err := h.repos.AuthNonce.Save(record); err != nil {
		fail(ctx, http.StatusInternalServerError, "更新登录随机数失败")
		return
	}

	token, err := randomHex(32)
	if err != nil {
		fail(ctx, http.StatusInternalServerError, "生成登录令牌失败")
		return
	}
	expiresAt := now.Add(time.Duration(h.cfg.SessionTTLHours) * time.Hour)
	if err := h.repos.AdminSession.Create(&domain.AdminSession{
		TokenHash:     auth.TokenHash(token),
		WalletAddress: wallet,
		RoleCode:      "admin",
		RoleLabel:     "管理员",
		ExpiresAt:     expiresAt,
		CreatedAt:     now,
		UpdatedAt:     now,
	}); err != nil {
		fail(ctx, http.StatusInternalServerError, "创建登录会话失败")
		return
	}

	_ = h.repos.OperationLog.Create(&domain.AdminOperationLog{
		ActorAddress: wallet,
		ModuleCode:   "auth",
		ModuleLabel:  labels.Module("auth"),
		ActionCode:   "auth_verify",
		ActionLabel:  labels.Action("auth_verify"),
		ResultCode:   "success",
		ResultLabel:  labels.Result("success"),
		RequestData:  domain.JSONMap{"nonce": req.Nonce, "signature": req.Signature},
		CreatedAt:    now,
	})

	ok(ctx, gin.H{
		"walletAddress": wallet,
		"verified":      true,
		"token":         token,
		"expiresAt":     expiresAt,
	})
}

func randomHex(byteLen int) (string, error) {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "0x" + hex.EncodeToString(buf), nil
}
