package logic

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"testing"
	"time"

	"fluxswap-backend/internal/chain"
	"fluxswap-backend/internal/config"
	"fluxswap-backend/internal/repo"
	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type stubRPCChainClient struct {
	currentBlockTime uint64
	currentBlockErr  error
	requiredFee      *big.Int
	gasPrice         *big.Int
	suggestFeeErr    error
}

func (s *stubRPCChainClient) Close() {}

func (s *stubRPCChainClient) SettlementAddress() string {
	return ""
}

func (s *stubRPCChainClient) SuggestExecutorFee(context.Context, common.Address, uint64, int64) (*big.Int, *big.Int, error) {
	if s.suggestFeeErr != nil {
		return nil, nil, s.suggestFeeErr
	}

	requiredFee := big.NewInt(0)
	if s.requiredFee != nil {
		requiredFee = new(big.Int).Set(s.requiredFee)
	}
	gasPrice := big.NewInt(0)
	if s.gasPrice != nil {
		gasPrice = new(big.Int).Set(s.gasPrice)
	}
	return requiredFee, gasPrice, nil
}

func (s *stubRPCChainClient) CurrentBlockTimestamp(context.Context) (uint64, error) {
	return s.currentBlockTime, s.currentBlockErr
}

func (s *stubRPCChainClient) ValidateCancelTransaction(context.Context, string, string, *big.Int) (*chain.CancelTxValidationResult, error) {
	return nil, fmt.Errorf("unexpected call")
}

// 瑕嗙洊鍧忕鍚嶅湪寤哄崟闃舵鍗宠鎷︽埅锛岄伩鍏嶈繘鍏ュ悗缁墽琛屽惊鐜寔缁秷鑰楁墽琛屽櫒 gas銆
func TestCreateOrderRejectsInvalidSignature(t *testing.T) {
	db := openCreateOrderTestDB(t)
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)
	otherPrivateKey, err := crypto.GenerateKey()
	require.NoError(t, err)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(7),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, "0x1111111111111111111111111111111111111111", order)
	require.NoError(t, err)
	invalidSignature, err := crypto.Sign(digest.Bytes(), otherPrivateKey)
	require.NoError(t, err)
	invalidSignature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(invalidSignature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "INVALID_SIGNATURE", resp.Notice.Code)
	require.False(t, resp.Notice.Success)

	var count int64
	require.NoError(t, db.Table("orders").Count(&count).Error)
	require.Equal(t, int64(0), count)
}

// 瑕嗙洊 orderHash 涓庤鍗曞瓧娈典笉涓€鑷寸殑鑴忚姹傦紝閬垮厤閿欒璁㈠崟琚啓鍏ユ暟鎹簱銆
func TestCreateOrderRejectsOrderHashMismatch(t *testing.T) {
	db := openCreateOrderTestDB(t)
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(8),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, "0x1111111111111111111111111111111111111111", order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_HASH_MISMATCH", resp.Notice.Code)
	require.False(t, resp.Notice.Success)
}

// 瑕嗙洊閾惧鎴风缂哄け鏃朵粛鍙惤搴擄紝骞惰褰曢摼涓婃鏌ラ檷绾у師鍥犮€
func TestCreateOrderStoresOrderWhenChainClientUnavailable(t *testing.T) {
	db := openCreateOrderTestDB(t)
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(9),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, "0x1111111111111111111111111111111111111111", order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Order)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CHECK_DEGRADED", resp.Notice.Code)
	require.True(t, resp.Notice.Success)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(
		context.Background(),
		31337,
		"0x1111111111111111111111111111111111111111",
		orderHash.Hex(),
	)
	require.NoError(t, queryErr)
	require.Equal(t, "open", stored.Status)
	require.Equal(t, "chain_client_unavailable_at_create", stored.LastBlockReason)
}

func TestCreateOrderStoresInitialFeeQuoteWithoutBlockingAtCreate(t *testing.T) {
	db := openCreateOrderTestDB(t)
	settlementAddress := "0x1111111111111111111111111111111111111111"
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{
			Worker: config.WorkerConfig{
				ExecutorEstimatedGasUsed: 400000,
				ExecutorFeeSafetyBps:     20000,
			},
		},
		DB: db,
		ChainClients: map[string]svc.ChainClient{
			fmt.Sprintf("%d:%s", 31337, strings.ToLower(settlementAddress)): &stubRPCChainClient{
				currentBlockTime: uint64(time.Now().UTC().Unix()),
				requiredFee:      big.NewInt(20),
				gasPrice:         big.NewInt(5),
			},
		},
	})

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(11),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, settlementAddress, order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    settlementAddress,
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Order)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_CREATED", resp.Notice.Code)
	require.True(t, resp.Notice.Success)

	stored, queryErr := repo.NewOrderRepository(db).GetByOrderHash(
		context.Background(),
		31337,
		settlementAddress,
		orderHash.Hex(),
	)
	require.NoError(t, queryErr)
	require.Equal(t, "", stored.LastBlockReason)
	require.Equal(t, "20", stored.LastRequiredExecutorFee)
}

func TestCreateOrderRejectsExpiredByChainTime(t *testing.T) {
	db := openCreateOrderTestDB(t)
	settlementAddress := "0x1111111111111111111111111111111111111111"
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
		ChainClients: map[string]svc.ChainClient{
			fmt.Sprintf("%d:%s", 31337, strings.ToLower(settlementAddress)): &stubRPCChainClient{
				currentBlockTime: 3600,
			},
		},
	})

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(3500),
		Nonce:                big.NewInt(10),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, settlementAddress, order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    settlementAddress,
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Notice)
	require.Equal(t, "ORDER_ALREADY_EXPIRED", resp.Notice.Code)
	require.False(t, resp.Notice.Success)

	var count int64
	require.NoError(t, db.Table("orders").Count(&count).Error)
	require.Equal(t, int64(0), count)
}

func TestCreateOrderRejectsMaxExecutorRewardBpsAboveLimit(t *testing.T) {
	db := openCreateOrderTestDB(t)
	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    "0x1111111111111111111111111111111111111111",
		OrderHash:            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Maker:                "0x2222222222222222222222222222222222222222",
		InputToken:           "0x3333333333333333333333333333333333333333",
		OutputToken:          "0x4444444444444444444444444444444444444444",
		AmountIn:             "100",
		MinAmountOut:         "90",
		MaxExecutorRewardBps: "10001",
		TriggerPriceX18:      "1000000000000000000",
		Expiry:               "9999999999",
		Nonce:                "1",
		Recipient:            "0x5555555555555555555555555555555555555555",
		Signature:            "0x" + strings.Repeat("11", 65),
		Source:               "test",
	})
	require.Error(t, err)
	require.Nil(t, resp)
	require.Contains(t, err.Error(), "maxExecutorRewardBps must be less than or equal to 10000")
}

// 鍒涘缓璁㈠崟闃舵涓嶅啀鏍规嵁鍘嗗彶鍙栨秷浜嬩欢鍥炲～鐘舵€侊紝鏃т簨浠跺簲琚拷鐣ワ紝鏂板崟浠嶄繚鎸?open銆
func TestCreateOrderIgnoresHistoricalCancelledEventWhenCreatingOrder(t *testing.T) {
	db := openCreateOrderTestDB(t)
	settlementAddress := "0x1111111111111111111111111111111111111111"

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(17),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, settlementAddress, order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    settlementAddress,
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Order)
	require.Equal(t, "open", resp.Order.Status)
	require.Equal(t, "", resp.Order.StatusReason)
	require.Equal(t, "", resp.Order.CancelledTxHash)
}

// 鍒涘缓璁㈠崟闃舵涓嶅啀鏍规嵁鍘嗗彶鎴愪氦浜嬩欢鍥炲～鐘舵€侊紝鏃т簨浠跺簲琚拷鐣ワ紝鏂板崟浠嶄繚鎸?open銆
func TestCreateOrderIgnoresHistoricalExecutedEventWhenCreatingOrder(t *testing.T) {
	db := openCreateOrderTestDB(t)
	settlementAddress := "0x1111111111111111111111111111111111111111"

	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)

	order := chain.SettlementOrder{
		Maker:                maker,
		InputToken:           common.HexToAddress("0x0000000000000000000000000000000000000001"),
		OutputToken:          common.HexToAddress("0x0000000000000000000000000000000000000002"),
		AmountIn:             big.NewInt(1000),
		MinAmountOut:         big.NewInt(900),
		MaxExecutorRewardBps: big.NewInt(10),
		TriggerPriceX18:      big.NewInt(1_000_000_000_000_000_000),
		Expiry:               big.NewInt(time.Now().Add(time.Hour).Unix()),
		Nonce:                big.NewInt(18),
		Recipient:            maker,
	}

	digest, err := chain.ComputeOrderDigest(31337, settlementAddress, order)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	orderHash, err := chain.ComputeOrderHash(order)
	require.NoError(t, err)

	logic := NewCreateOrderLogic(context.Background(), &svc.ServiceContext{
		Config: config.Config{},
		DB:     db,
	})

	resp, err := logic.CreateOrder(&executor.CreateOrderRequest{
		ChainId:              31337,
		SettlementAddress:    settlementAddress,
		OrderHash:            orderHash.Hex(),
		Maker:                maker.Hex(),
		InputToken:           order.InputToken.Hex(),
		OutputToken:          order.OutputToken.Hex(),
		AmountIn:             order.AmountIn.String(),
		MinAmountOut:         order.MinAmountOut.String(),
		MaxExecutorRewardBps: order.MaxExecutorRewardBps.String(),
		TriggerPriceX18:      order.TriggerPriceX18.String(),
		Expiry:               order.Expiry.String(),
		Nonce:                order.Nonce.String(),
		Recipient:            maker.Hex(),
		Signature:            hexutil.Encode(signature),
		Source:               "test",
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Order)
	require.Equal(t, "open", resp.Order.Status)
	require.Equal(t, "", resp.Order.StatusReason)
	require.Equal(t, "", resp.Order.ExecutedTxHash)
	require.Equal(t, "0", resp.Order.SettledAmountOut)
	require.Equal(t, "0", resp.Order.SettledExecutorReward)
}

func openCreateOrderTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := fmt.Sprintf("file:create_order_%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, repo.AutoMigrate(db))
	return db
}
