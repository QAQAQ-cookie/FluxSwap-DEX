package httpserver

import (
	"time"

	"fluxswap-admin-backend/internal/auth"
	"fluxswap-admin-backend/internal/config"
	"fluxswap-admin-backend/internal/health"
	"fluxswap-admin-backend/internal/repo"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func NewRouter(cfg config.Config, repos repo.Repositories) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	if len(cfg.AllowedURLs) > 0 {
		router.Use(cors.New(cors.Config{
			AllowOrigins:     cfg.AllowedURLs,
			AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowHeaders:     []string{"Authorization", "Content-Type"},
			ExposeHeaders:    []string{"Content-Length"},
			AllowCredentials: true,
			MaxAge:           12 * time.Hour,
		}))
	}

	api := router.Group("/api")
	health.RegisterRoutes(api, time.Now())
	registerAdminRoutes(api.Group("/admin"), cfg, repos)

	return router
}

func registerAdminRoutes(group *gin.RouterGroup, cfg config.Config, repos repo.Repositories) {
	allowlist := auth.NewAdminAllowlist(cfg.AdminWallets)
	authHandlers := authHandlers{repos: repos, cfg: cfg, allowlist: allowlist}
	treasury := treasuryHandlers{repos: repos, cfg: cfg}
	logs := logHandlers{repos: repos}
	sync := syncHandlers{repos: repos}
	maintenance := maintenanceHandlers{repos: repos}

	// 生成钱包登录随机数和待签名消息，前端拿到后让管理员钱包签名。
	group.POST("/auth/nonce", authHandlers.createNonce)

	// 校验登录 nonce 是否存在、未过期、未使用，并把 nonce 标记为已使用。
	group.POST("/auth/verify", authHandlers.verifyNonce)

	protected := group.Group("")
	protected.Use(requireAdmin(repos, allowlist))

	// 保存或更新金库治理操作详情，通常在链上排队交易成功后由前端提交。
	protected.POST("/treasury/operations", treasury.upsertOperation)

	// 分页查询金库治理操作列表，支持按链、金库地址、状态、类型、发起人过滤。
	group.GET("/treasury/operations", treasury.listOperations)

	// 根据 operationId 查询单条金库治理操作详情，用于弹窗详情和状态对账。
	group.GET("/treasury/operations/:operationId", treasury.getOperation)

	// 更新金库治理操作状态，记录执行、取消、失败等结果和对应交易哈希。
	protected.PATCH("/treasury/operations/:operationId/status", treasury.updateOperationStatus)

	// 分页查询管理端审计日志，支持按操作者、模块、动作、结果和链过滤。
	group.GET("/logs", logs.listLogs)

	// 查询链上事件同步游标，查看每类事件已经同步到哪个区块。
	group.GET("/sync/cursors", sync.listCursors)

	// 新增或推进链上事件同步游标，供后续同步器记录处理进度。
	protected.POST("/sync/cursors", sync.upsertCursor)

	// 清理过期登录随机数和过期会话，保持管理端认证数据轻量。
	protected.POST("/maintenance/cleanup", maintenance.cleanup)

	// 清空管理端业务数据，主要用于本地链重启后的开发环境重置。
	protected.POST("/maintenance/reset-local-data", maintenance.resetLocalData)
}
