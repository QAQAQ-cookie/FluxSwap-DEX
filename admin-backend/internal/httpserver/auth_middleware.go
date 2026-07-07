package httpserver

import (
	"net/http"
	"strings"
	"time"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const adminAddressContextKey = "adminAddress"

func requireAdmin(repos repo.Repositories, allowlist auth.AdminAllowlist) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if !allowlist.IsConfigured() {
			fail(ctx, http.StatusForbidden, "管理端管理员白名单未配置")
			ctx.Abort()
			return
		}

		token := bearerToken(ctx.GetHeader("Authorization"))
		if token == "" {
			fail(ctx, http.StatusUnauthorized, "缺少管理端登录令牌")
			ctx.Abort()
			return
		}

		session, err := repos.AdminSession.FindActiveByTokenHash(auth.TokenHash(token), time.Now().UTC())
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				fail(ctx, http.StatusUnauthorized, "管理端登录已过期或无效")
				ctx.Abort()
				return
			}
			fail(ctx, http.StatusInternalServerError, "校验管理端登录失败")
			ctx.Abort()
			return
		}

		if !allowlist.IsAdmin(session.WalletAddress) {
			fail(ctx, http.StatusForbidden, "当前钱包没有管理权限")
			ctx.Abort()
			return
		}

		ctx.Set(adminAddressContextKey, session.WalletAddress)
		ctx.Next()
	}
}

func adminAddress(ctx *gin.Context) string {
	value, ok := ctx.Get(adminAddressContextKey)
	if !ok {
		return ""
	}
	address, _ := value.(string)
	return address
}

func bearerToken(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return ""
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}
