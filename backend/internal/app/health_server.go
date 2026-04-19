package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// HealthServer 提供一个可更新运行状态的轻量级健康检查服务。
type HealthServer struct {
	server *http.Server
	state  *HealthState
}

// HealthState 记录最近一次成功、错误和当前服务状态。
type HealthState struct {
	mu            sync.RWMutex
	service       string
	status        string
	message       string
	lastSuccessAt time.Time
	lastErrorAt   time.Time
	components    map[string]componentHealthState
}

type componentHealthState struct {
	status        string
	message       string
	lastSuccessAt time.Time
	lastErrorAt   time.Time
}

// healthResponse 是 /healthz 返回给外部探针的最小 JSON 结构。
type healthResponse struct {
	Status        string `json:"status"`
	Service       string `json:"service"`
	Message       string `json:"message,omitempty"`
	Timestamp     string `json:"timestamp"`
	LastSuccessAt string `json:"lastSuccessAt,omitempty"`
	LastErrorAt   string `json:"lastErrorAt,omitempty"`
}

// NewHealthState 创建一个带初始状态的健康状态容器。
func NewHealthState(serviceName string) *HealthState {
	return &HealthState{
		service:    strings.TrimSpace(serviceName),
		status:     "starting",
		message:    "service is starting",
		components: make(map[string]componentHealthState),
	}
}

// MarkHealthy 标记最近一次循环成功。
func (s *HealthState) MarkHealthy(message string) {
	s.MarkHealthyComponent("default", message)
}

// MarkHealthyComponent 标记某个子组件当前健康。
func (s *HealthState) MarkHealthyComponent(componentKey string, message string) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.TrimSpace(componentKey)
	if key == "" {
		key = "default"
	}

	current := s.components[key]
	current.status = "ok"
	current.message = strings.TrimSpace(message)
	current.lastSuccessAt = time.Now().UTC()
	s.components[key] = current
}

// MarkDegraded 标记最近一次循环失败。
func (s *HealthState) MarkDegraded(message string) {
	s.MarkDegradedComponent("default", message)
}

// MarkDegradedComponent 标记某个子组件当前降级。
func (s *HealthState) MarkDegradedComponent(componentKey string, message string) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.TrimSpace(componentKey)
	if key == "" {
		key = "default"
	}

	current := s.components[key]
	current.status = "degraded"
	current.message = strings.TrimSpace(message)
	current.lastErrorAt = time.Now().UTC()
	s.components[key] = current
}

// MarkStartingComponent 标记某个子组件处于启动中。
func (s *HealthState) MarkStartingComponent(componentKey string, message string) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.TrimSpace(componentKey)
	if key == "" {
		key = "default"
	}

	current := s.components[key]
	current.status = "starting"
	current.message = strings.TrimSpace(message)
	s.components[key] = current
}

// snapshot 读取当前聚合后的健康状态快照，供 HTTP 层直接编码输出。
func (s *HealthState) snapshot() healthResponse {
	if s == nil {
		return healthResponse{
			Status:    "unknown",
			Service:   "",
			Message:   "health state unavailable",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.components) > 0 {
		return s.snapshotComponentsLocked()
	}

	return healthResponse{
		Status:        s.status,
		Service:       s.service,
		Message:       s.message,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		LastSuccessAt: formatHealthTime(s.lastSuccessAt),
		LastErrorAt:   formatHealthTime(s.lastErrorAt),
	}
}

// snapshotComponentsLocked 在持有读锁的前提下，把多组件状态合成为一个对外状态。
func (s *HealthState) snapshotComponentsLocked() healthResponse {
	keys := make([]string, 0, len(s.components))
	for key := range s.components {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	status := "ok"
	var messages []string
	var lastSuccessAt time.Time
	var lastErrorAt time.Time

	for _, key := range keys {
		component := s.components[key]
		switch component.status {
		case "degraded":
			status = "degraded"
		case "starting":
			if status != "degraded" {
				status = "starting"
			}
		case "ok":
		default:
			if status == "ok" {
				status = "starting"
			}
		}

		if component.message != "" {
			if key == "default" {
				messages = append(messages, component.message)
			} else {
				messages = append(messages, fmt.Sprintf("%s: %s", key, component.message))
			}
		}
		if component.lastSuccessAt.After(lastSuccessAt) {
			lastSuccessAt = component.lastSuccessAt
		}
		if component.lastErrorAt.After(lastErrorAt) {
			lastErrorAt = component.lastErrorAt
		}
	}

	message := ""
	if len(messages) > 0 {
		message = strings.Join(messages, "; ")
	}
	if message == "" {
		switch status {
		case "ok":
			message = "all components healthy"
		case "starting":
			message = "components are starting"
		default:
			message = "one or more components are degraded"
		}
	}

	return healthResponse{
		Status:        status,
		Service:       s.service,
		Message:       message,
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		LastSuccessAt: formatHealthTime(lastSuccessAt),
		LastErrorAt:   formatHealthTime(lastErrorAt),
	}
}

// StartHealthServer 在 listenOn 非空时启动 GET /healthz 检查端点。
func StartHealthServer(listenOn string, serviceName string) (*HealthServer, error) {
	address := strings.TrimSpace(listenOn)
	if address == "" {
		return nil, nil
	}

	state := NewHealthState(serviceName)

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		serveHealth(state, w, r)
	})

	server := &http.Server{
		Addr:              address,
		Handler:           mux,
		ReadHeaderTimeout: 3 * time.Second,
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, fmt.Errorf("listen health server: %w", err)
	}

	go func() {
		err := server.Serve(listener)
		if err != nil && err != http.ErrServerClosed {
			fmt.Printf("health server stopped unexpectedly on %s: %v\n", address, err)
		}
	}()

	return &HealthServer{
		server: server,
		state:  state,
	}, nil
}

// State 返回底层健康状态对象，供 worker supervisor 更新。
func (h *HealthServer) State() *HealthState {
	if h == nil {
		return nil
	}
	return h.state
}

// Close 优雅关闭健康检查 HTTP 服务。
func (h *HealthServer) Close(ctx context.Context) error {
	if h == nil || h.server == nil {
		return nil
	}

	return h.server.Shutdown(ctx)
}

// formatHealthTime 把零值时间安全转换为空字符串，避免健康响应里出现无意义时间。
func formatHealthTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

// serveHealth 处理健康检查请求，并把 starting / degraded 映射为 503。
func serveHealth(state *HealthState, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	payload := state.snapshot()
	statusCode := http.StatusOK
	if payload.Status != "ok" {
		statusCode = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
