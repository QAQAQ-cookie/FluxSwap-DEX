package logic

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func TestCancelOrderByRequestRejectsMakerMismatch(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "7",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	_, err := cancelOrderByRequest(context.Background(), repo.NewOrderRepository(db), &executor.CancelOrderItem{
		ChainId:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
		Maker:             "0x9999999999999999999999999999999999999999",
	})
	require.Error(t, err)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestCancelOrdersRegistersUserSubmittedTxHash(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "8",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(1), resp.CancelledCount)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "CANCEL_TX_REGISTERED", resp.Notice.Code)
	require.True(t, resp.Results[0].Cancelled)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "cancel_tx_submitted_by_user", stored.StatusReason)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
}

func TestCancelOrdersRejectsInvalidCancelTxHash(t *testing.T) {
	db := openLogicTestDB(t)
	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	_, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           31337,
				SettlementAddress: "0x1111111111111111111111111111111111111111",
				OrderHash:         "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				Maker:             "0x2222222222222222222222222222222222222222",
			},
		},
		CancelTxHash: "not-a-hash",
	})
	require.Error(t, err)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestCancelOrdersRejectsMismatchedCancelTx(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "9",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClientReject{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Equal(t, "CANCEL_ORDERS_REJECTED", resp.Notice.Code)
	require.Equal(t, "CANCEL_TX_MISMATCH", resp.Results[0].Code)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "open", stored.Status)
}

func TestCancelOrdersReturnsRetryableNoticeWhenCancelTxNotIndexedYet(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xcececececececececececececececececececececececececececececececece",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "19",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClientNotIndexed{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xedededededededededededededededededededededededededededededededed",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Equal(t, "CANCEL_ORDERS_REJECTED", resp.Notice.Code)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "CANCEL_TX_NOT_INDEXED_YET", resp.Results[0].Code)
	require.Equal(t, "verify_cancel_tx", resp.Results[0].Stage)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.CancelledTxHash)
}

func TestCancelOrdersUsesBatchKeyWhenUpdatingPerOrderResult(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	settlementA := "0x1111111111111111111111111111111111111111"
	settlementB := "0x2222222222222222222222222222222222222222"
	sharedHash := "0x9898989898989898989898989898989898989898989898989898989898989898"
	maker := "0x3333333333333333333333333333333333333333"

	orderA := &domain.Order{
		ChainID:           31337,
		SettlementAddress: settlementA,
		OrderHash:         sharedHash,
		Maker:             maker,
		InputToken:        "0x4444444444444444444444444444444444444444",
		OutputToken:       "0x5555555555555555555555555555555555555555",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x5555555555555555555555555555555555555555",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "31",
		Recipient:         "0x6666666666666666666666666666666666666666",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	orderB := &domain.Order{
		ChainID:           31337,
		SettlementAddress: settlementB,
		OrderHash:         sharedHash,
		Maker:             maker,
		InputToken:        "0x4444444444444444444444444444444444444444",
		OutputToken:       "0x5555555555555555555555555555555555555555",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x5555555555555555555555555555555555555555",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "32",
		Recipient:         "0x6666666666666666666666666666666666666666",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), orderA))
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), orderB))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClientNotIndexed{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           orderA.ChainID,
				SettlementAddress: orderA.SettlementAddress,
				OrderHash:         orderA.OrderHash,
				Maker:             orderA.Maker,
			},
			{
				ChainId:           orderB.ChainID,
				SettlementAddress: orderB.SettlementAddress,
				OrderHash:         orderB.OrderHash,
				Maker:             orderB.Maker,
			},
		},
		CancelTxHash: "0xabababababababababababababababababababababababababababababababab",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Len(t, resp.Results, 2)
	require.Equal(t, "CANCEL_TX_NOT_INDEXED_YET", resp.Results[0].Code)
	require.Equal(t, "SETTLEMENT_MISMATCH_IN_BATCH", resp.Results[1].Code)
}

func TestCancelOrdersRejectsMixedChainBatch(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	orderA := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xabababababababababababababababababababababababababababababababab",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "10",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	orderB := &domain.Order{
		ChainID:           11155111,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "11",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), orderA))
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), orderB))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           orderA.ChainID,
				SettlementAddress: orderA.SettlementAddress,
				OrderHash:         orderA.OrderHash,
				Maker:             orderA.Maker,
			},
			{
				ChainId:           orderB.ChainID,
				SettlementAddress: orderB.SettlementAddress,
				OrderHash:         orderB.OrderHash,
				Maker:             orderB.Maker,
			},
		},
		CancelTxHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(1), resp.CancelledCount)
	require.Len(t, resp.Results, 2)
	require.Equal(t, "CANCEL_TX_REGISTERED", resp.Results[0].Code)
	require.True(t, resp.Results[0].Cancelled)
	require.Equal(t, "CHAIN_MISMATCH_IN_BATCH", resp.Results[1].Code)
}

func TestCancelOrdersReturnsWriteFailurePerResult(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0xefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "12",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))
	require.NoError(t, db.Callback().Update().Before("gorm:update").Register("test:force_update_error", func(tx *gorm.DB) {
		tx.AddError(fmt.Errorf("forced update failure"))
	}))
	defer func() {
		db.Callback().Update().Remove("test:force_update_error")
	}()
	db = db.Session(&gorm.Session{})
	db = db.Clauses(clause.Returning{})

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Equal(t, "CANCEL_ORDERS_REJECTED", resp.Notice.Code)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "UPDATE_ORDER_FAILED", resp.Results[0].Code)
	require.True(t, strings.TrimSpace(resp.Results[0].Error) != "")
	require.Equal(t, "write", resp.Results[0].Stage)
}

func TestCancelOrdersRejectsDuplicateOrderInBatch(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x7777777777777777777777777777777777777777777777777777777777777777",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "13",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
			{
				ChainId:           order.ChainID,
				SettlementAddress: strings.ToUpper(order.SettlementAddress),
				OrderHash:         strings.ToUpper(order.OrderHash),
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(1), resp.CancelledCount)
	require.Len(t, resp.Results, 2)
	require.Equal(t, "CANCEL_TX_REGISTERED", resp.Results[0].Code)
	require.True(t, resp.Results[0].Cancelled)
	require.Equal(t, "DUPLICATE_ORDER_IN_BATCH", resp.Results[1].Code)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", stored.CancelledTxHash)
}

func TestCancelOrdersAllowsIdempotentPendingCancelRegistration(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x6666666666666666666666666666666666666666666666666666666666666666",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "14",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: order.CancelledTxHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(1), resp.CancelledCount)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "CANCEL_TX_ALREADY_REGISTERED", resp.Results[0].Code)
	require.True(t, resp.Results[0].Cancelled)
	require.Equal(t, "register_cancel_tx", resp.Results[0].Stage)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "CANCEL_TX_ALREADY_REGISTERED", resp.Notice.Code)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, order.CancelledTxHash, stored.CancelledTxHash)
}

func TestCancelOrdersCountsIdempotentAndNewRegistrationsTogether(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()
	cancelTxHash := "0xabababababababababababababababababababababababababababababababab"
	maker := "0x2222222222222222222222222222222222222222"
	settlementAddress := "0x1111111111111111111111111111111111111111"

	idempotentOrder := &domain.Order{
		ChainID:           31337,
		SettlementAddress: settlementAddress,
		OrderHash:         "0x6969696969696969696969696969696969696969696969696969696969696969",
		Maker:             maker,
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "20",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   cancelTxHash,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	newOrder := &domain.Order{
		ChainID:           31337,
		SettlementAddress: settlementAddress,
		OrderHash:         "0x7070707070707070707070707070707070707070707070707070707070707070",
		Maker:             maker,
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "21",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), idempotentOrder))
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), newOrder))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           idempotentOrder.ChainID,
				SettlementAddress: idempotentOrder.SettlementAddress,
				OrderHash:         idempotentOrder.OrderHash,
				Maker:             idempotentOrder.Maker,
			},
			{
				ChainId:           newOrder.ChainID,
				SettlementAddress: newOrder.SettlementAddress,
				OrderHash:         newOrder.OrderHash,
				Maker:             newOrder.Maker,
			},
		},
		CancelTxHash: cancelTxHash,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(2), resp.CancelledCount)
	require.Len(t, resp.Results, 2)
	require.True(t, resp.Results[0].Cancelled)
	require.True(t, resp.Results[1].Cancelled)
	require.Equal(t, "CANCEL_TX_ALREADY_REGISTERED", resp.Results[0].Code)
	require.Equal(t, "CANCEL_TX_REGISTERED", resp.Results[1].Code)
}

func TestCancelOrdersRejectsReplacingPendingCancelTxHash(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x5555555555555555555555555555555555555555555555555555555555555555",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "15",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "pending_cancel",
		StatusReason:      "cancel_tx_submitted_by_user",
		CancelledTxHash:   "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "ORDER_CANCELLATION_PENDING", resp.Results[0].Code)
	require.Equal(t, "business_validation", resp.Results[0].Stage)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_cancel", stored.Status)
	require.Equal(t, "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", stored.CancelledTxHash)
}

func TestCancelOrdersRejectsSubmittingExecuteOrder(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x4444444444444444444444444444444444444444444444444444444444444444",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "16",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "submitting_execute",
		StatusReason:      "claimed_for_submission",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "ORDER_SUBMISSION_IN_PROGRESS", resp.Results[0].Code)
	require.Equal(t, "business_validation", resp.Results[0].Stage)
}

func TestCancelOrdersRejectsPendingExecuteOrder(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x3434343434343434343434343434343434343434343434343434343434343434",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "17",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "pending_execute",
		StatusReason:      "submitted_to_chain",
		SubmittedTxHash:   "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "ORDER_EXECUTION_PENDING", resp.Results[0].Code)
	require.Equal(t, "business_validation", resp.Results[0].Stage)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "pending_execute", stored.Status)
	require.Equal(t, "submitted_to_chain", stored.StatusReason)
}

func TestCancelOrdersRejectsStoredInvalidNonceBeforeChainValidation(t *testing.T) {
	db := openLogicTestDB(t)
	now := time.Now().UTC()

	order := &domain.Order{
		ChainID:           31337,
		SettlementAddress: "0x1111111111111111111111111111111111111111",
		OrderHash:         "0x1212121212121212121212121212121212121212121212121212121212121212",
		Maker:             "0x2222222222222222222222222222222222222222",
		InputToken:        "0x3333333333333333333333333333333333333333",
		OutputToken:       "0x4444444444444444444444444444444444444444",
		AmountIn:          "100",
		MinAmountOut:      "90",
		ExecutorFee:       "1",
		ExecutorFeeToken:  "0x4444444444444444444444444444444444444444",
		TriggerPriceX18:   "1",
		Expiry:            "9999999999",
		Nonce:             "bad-nonce",
		Recipient:         "0x5555555555555555555555555555555555555555",
		Signature:         "0x" + logicRepeatHex("11", 65),
		Source:            "test",
		Status:            "open",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	require.NoError(t, repo.NewOrderRepository(db).Create(context.Background(), order))

	logic := NewCancelOrdersLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			"31337:0x1111111111111111111111111111111111111111": &stubCancelChainClient{},
		},
	})

	resp, err := logic.CancelOrders(&executor.CancelOrdersRequest{
		Orders: []*executor.CancelOrderItem{
			{
				ChainId:           order.ChainID,
				SettlementAddress: order.SettlementAddress,
				OrderHash:         order.OrderHash,
				Maker:             order.Maker,
			},
		},
		CancelTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Equal(t, uint32(0), resp.CancelledCount)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "ORDER_NONCE_INVALID_IN_RECORD", resp.Results[0].Code)
	require.Equal(t, "verify_cancel_tx", resp.Results[0].Stage)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(context.Background(), order.ChainID, order.SettlementAddress, order.OrderHash)
	require.NoError(t, queryErr)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "", stored.CancelledTxHash)
}

type stubCancelChainClientReject struct{}

func (s *stubCancelChainClientReject) Close() {}
func (s *stubCancelChainClientReject) SettlementAddress() string {
	return "0x1111111111111111111111111111111111111111"
}
func (s *stubCancelChainClientReject) SuggestExecutorFee(context.Context, common.Address, uint64, int64) (*big.Int, *big.Int, error) {
	return nil, nil, fmt.Errorf("unexpected call")
}
func (s *stubCancelChainClientReject) CurrentBlockTimestamp(context.Context) (uint64, error) {
	return 0, nil
}
func (s *stubCancelChainClientReject) ValidateCancelTransaction(context.Context, string, string, *big.Int) (*chain.CancelTxValidationResult, error) {
	return nil, fmt.Errorf("cancel transaction does not cover target nonce")
}

type stubCancelChainClientNotIndexed struct{}

func (s *stubCancelChainClientNotIndexed) Close() {}
func (s *stubCancelChainClientNotIndexed) SettlementAddress() string {
	return "0x1111111111111111111111111111111111111111"
}
func (s *stubCancelChainClientNotIndexed) SuggestExecutorFee(context.Context, common.Address, uint64, int64) (*big.Int, *big.Int, error) {
	return nil, nil, fmt.Errorf("unexpected call")
}
func (s *stubCancelChainClientNotIndexed) CurrentBlockTimestamp(context.Context) (uint64, error) {
	return 0, nil
}
func (s *stubCancelChainClientNotIndexed) ValidateCancelTransaction(context.Context, string, string, *big.Int) (*chain.CancelTxValidationResult, error) {
	return nil, fmt.Errorf("%w: rpc pending", chain.ErrCancelTransactionNotFound)
}

func TestCancelTransactionNotFoundErrorIsStructured(t *testing.T) {
	err := fmt.Errorf("%w: rpc pending", chain.ErrCancelTransactionNotFound)
	require.True(t, errors.Is(err, chain.ErrCancelTransactionNotFound))
}

type stubCancelChainClient struct{}

func (s *stubCancelChainClient) Close() {}

func (s *stubCancelChainClient) SettlementAddress() string {
	return "0x1111111111111111111111111111111111111111"
}

func (s *stubCancelChainClient) SuggestExecutorFee(context.Context, common.Address, uint64, int64) (*big.Int, *big.Int, error) {
	return nil, nil, fmt.Errorf("unexpected call")
}

func (s *stubCancelChainClient) CurrentBlockTimestamp(context.Context) (uint64, error) {
	return 0, nil
}

func (s *stubCancelChainClient) ValidateCancelTransaction(context.Context, string, string, *big.Int) (*chain.CancelTxValidationResult, error) {
	return &chain.CancelTxValidationResult{
		TargetsRequestedNonce: true,
	}, nil
}

func openLogicTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:logic_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}

func logicRepeatHex(pair string, count int) string {
	result := ""
	for range count {
		result += pair
	}
	return result
}
