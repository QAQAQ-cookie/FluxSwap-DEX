package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// HealthServer 封装一个轻量级 HTTP 服务，用于暴露 worker 的健康检查接口。
type HealthServer struct {
	server *http.Server
}

type healthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Timestamp string `json:"timestamp"`
}

// StartHealthServer 在 listenOn 非空时启动一个 GET /healthz 健康检查端点。
func StartHealthServer(listenOn string, serviceName string) (*HealthServer, error) {
	address := strings.TrimSpace(listenOn)
	if address == "" {
		return nil, nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(healthResponse{
			Status:    "ok",
			Service:   serviceName,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	server := &http.Server{
		Addr:              address,
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}

	go func() {
		err := server.ListenAndServe()
		if err != nil && err != http.ErrServerClosed {
			fmt.Printf("health server stopped unexpectedly on %s: %v\n", address, err)
		}
	}()

	return &HealthServer{server: server}, nil
}

// Close 优雅关闭健康检查 HTTP 服务。
func (h *HealthServer) Close(ctx context.Context) error {
	if h == nil || h.server == nil {
		return nil
	}

	return h.server.Shutdown(ctx)
}
