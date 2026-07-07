package health

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(router gin.IRouter, startedAt time.Time) {
	router.GET("/health", func(ctx *gin.Context) {
		ctx.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"service":   "fluxswap-admin-backend",
			"startedAt": startedAt.UTC().Format(time.RFC3339),
		})
	})
}
