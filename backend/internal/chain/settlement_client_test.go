package chain

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/stretchr/testify/require"
)

func TestDecodeHexSignatureRejectsInvalidLength(t *testing.T) {
	_, err := DecodeHexSignature("0x1234")
	require.Error(t, err)
	require.Contains(t, err.Error(), "65 bytes")
}

func TestDecodeHexSignatureNormalizesRecoveryID(t *testing.T) {
	signature := "0x" +
		"1111111111111111111111111111111111111111111111111111111111111111" +
		"2222222222222222222222222222222222222222222222222222222222222222" +
		"1b"

	decoded, err := DecodeHexSignature(signature)
	require.NoError(t, err)
	require.Len(t, decoded, 65)
	require.Equal(t, byte(27), decoded[64])
}

func TestComputeOrderHashLoadsABITypesWithoutPanic(t *testing.T) {
	order := SettlementOrder{
		Maker:                common.HexToAddress("0x1111111111111111111111111111111111111111"),
		InputToken:           common.HexToAddress("0x2222222222222222222222222222222222222222"),
		OutputToken:          common.HexToAddress("0x3333333333333333333333333333333333333333"),
		AmountIn:             big.NewInt(100),
		MinAmountOut:         big.NewInt(90),
		MaxExecutorRewardBps: big.NewInt(1),
		TriggerPriceX18:      big.NewInt(1),
		Expiry:               big.NewInt(9999999999),
		Nonce:                big.NewInt(7),
		Recipient:            common.HexToAddress("0x4444444444444444444444444444444444444444"),
	}

	hash, err := ComputeOrderHash(order)
	require.NoError(t, err)
	require.NotEqual(t, common.Hash{}, hash)
}

func TestVerifyInvalidateNoncesSignatureAcceptsMakerSignature(t *testing.T) {
	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)
	nonces := []*big.Int{big.NewInt(7), big.NewInt(9)}
	deadline := big.NewInt(9999999999)

	digest, err := ComputeInvalidateNoncesDigest(31337, "0x1111111111111111111111111111111111111111", maker, nonces, deadline)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), privateKey)
	require.NoError(t, err)
	signature[64] += 27

	err = VerifyInvalidateNoncesSignature(31337, "0x1111111111111111111111111111111111111111", maker, nonces, deadline, signature)
	require.NoError(t, err)
}

func TestVerifyInvalidateNoncesSignatureRejectsWrongMaker(t *testing.T) {
	privateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	maker := crypto.PubkeyToAddress(privateKey.PublicKey)
	otherPrivateKey, err := crypto.GenerateKey()
	require.NoError(t, err)
	nonces := []*big.Int{big.NewInt(7), big.NewInt(9)}
	deadline := big.NewInt(9999999999)

	digest, err := ComputeInvalidateNoncesDigest(31337, "0x1111111111111111111111111111111111111111", maker, nonces, deadline)
	require.NoError(t, err)
	signature, err := crypto.Sign(digest.Bytes(), otherPrivateKey)
	require.NoError(t, err)
	signature[64] += 27

	err = VerifyInvalidateNoncesSignature(31337, "0x1111111111111111111111111111111111111111", maker, nonces, deadline, signature)
	require.Error(t, err)
	require.Contains(t, err.Error(), "signature maker mismatch")
}

func TestLoadERC20MetadataABI(t *testing.T) {
	require.NoError(t, loadERC20MetadataABI())
}
