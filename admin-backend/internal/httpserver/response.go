package httpserver

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type pageResponse struct {
	Items    any   `json:"items"`
	Total    int64 `json:"total"`
	Page     int   `json:"page"`
	PageSize int   `json:"pageSize"`
}

func ok(ctx *gin.Context, data any) {
	ctx.JSON(http.StatusOK, gin.H{"data": data})
}

func created(ctx *gin.Context, data any) {
	ctx.JSON(http.StatusCreated, gin.H{"data": data})
}

func fail(ctx *gin.Context, status int, message string) {
	ctx.JSON(status, gin.H{"error": message})
}
