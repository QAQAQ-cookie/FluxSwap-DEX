package app

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestHealthStateStartsAsStarting(t *testing.T) {
	state := NewHealthState("executor-worker")
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	serveHealth(state, recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)

	var payload healthResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "starting", payload.Status)
	require.Equal(t, "executor-worker", payload.Service)
	require.Equal(t, "service is starting", payload.Message)
	require.Empty(t, payload.LastSuccessAt)
	require.Empty(t, payload.LastErrorAt)
}

func TestHealthStateMarkHealthyReturnsOK(t *testing.T) {
	state := NewHealthState("executor-worker")
	state.MarkHealthy("executor loop running")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	serveHealth(state, recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)

	var payload healthResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "ok", payload.Status)
	require.Equal(t, "executor-worker", payload.Service)
	require.Equal(t, "executor loop running", payload.Message)
	require.NotEmpty(t, payload.LastSuccessAt)
	require.Empty(t, payload.LastErrorAt)
}

func TestHealthStateMarkDegradedReturnsServiceUnavailable(t *testing.T) {
	state := NewHealthState("indexer-worker")
	state.MarkDegraded("websocket disconnected")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	serveHealth(state, recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)

	var payload healthResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "degraded", payload.Status)
	require.Equal(t, "indexer-worker", payload.Service)
	require.Equal(t, "websocket disconnected", payload.Message)
	require.Empty(t, payload.LastSuccessAt)
	require.NotEmpty(t, payload.LastErrorAt)
}

func TestHealthStateComponentAggregationPrefersDegraded(t *testing.T) {
	state := NewHealthState("executor-worker")
	state.MarkHealthyComponent("executor-chain-31337", "chain 31337 healthy")
	state.MarkDegradedComponent("executor-chain-11155111", "chain 11155111 disconnected")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	serveHealth(state, recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)

	var payload healthResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "degraded", payload.Status)
	require.Contains(t, payload.Message, "executor-chain-31337: chain 31337 healthy")
	require.Contains(t, payload.Message, "executor-chain-11155111: chain 11155111 disconnected")
	require.NotEmpty(t, payload.LastSuccessAt)
	require.NotEmpty(t, payload.LastErrorAt)
}

func TestHealthStateComponentAggregationReturnsStartingWithoutDegraded(t *testing.T) {
	state := NewHealthState("indexer-worker")
	state.MarkHealthyComponent("indexer-chain-31337", "chain 31337 healthy")
	state.MarkStartingComponent("indexer-chain-11155111", "chain 11155111 starting")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	serveHealth(state, recorder, request)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)

	var payload healthResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "starting", payload.Status)
	require.Contains(t, payload.Message, "indexer-chain-31337: chain 31337 healthy")
	require.Contains(t, payload.Message, "indexer-chain-11155111: chain 11155111 starting")
	require.NotEmpty(t, payload.LastSuccessAt)
}

func TestStartHealthServerReturnsErrorWhenPortAlreadyInUse(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer listener.Close()

	server, err := StartHealthServer(listener.Addr().String(), "occupied-health-server")
	require.Error(t, err)
	require.Nil(t, server)
}

func TestStartHealthServerStartsAndCloses(t *testing.T) {
	server, err := StartHealthServer("127.0.0.1:0", "test-health-server")
	require.NoError(t, err)
	require.NotNil(t, server)

	time.Sleep(20 * time.Millisecond)

	require.NoError(t, server.Close(t.Context()))
}
