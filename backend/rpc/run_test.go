package rpc

import (
	"testing"

	"fluxswap-backend/internal/config"

	"github.com/stretchr/testify/require"
)

func TestRunReturnsErrorForInvalidRPCConfig(t *testing.T) {
	err := Run(config.Config{})
	require.Error(t, err)
}

