package chain

import (
	"fmt"
	"math/big"
	"strings"
	"sync"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
)

var (
	orderTypeHash = crypto.Keccak256Hash([]byte(
		"SignedOrder(address maker,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 executorFee,uint256 triggerPriceX18,uint256 expiry,uint256 nonce,address recipient)",
	))
	invalidateNoncesTypeHash = crypto.Keccak256Hash([]byte(
		"InvalidateNonces(address maker,bytes32 noncesHash,uint256 deadline)",
	))
	domainTypeHash = crypto.Keccak256Hash([]byte(
		"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
	))
	nameHash    = crypto.Keccak256Hash([]byte("Flux Signed Order Settlement"))
	versionHash = crypto.Keccak256Hash([]byte("1"))

	orderABITypesOnce sync.Once
	orderABITypesErr  error
	bytes32Type       abi.Type
	addressType       abi.Type
	uint256Type       abi.Type
)

// ComputeOrderHash 按照结算合约的同一套 EIP-712 结构体编码规则计算订单哈希。
func ComputeOrderHash(order SettlementOrder) (common.Hash, error) {
	if err := loadOrderABITypes(); err != nil {
		return common.Hash{}, err
	}

	arguments := abi.Arguments{
		{Name: "typeHash", Type: bytes32Type},
		{Name: "maker", Type: addressType},
		{Name: "inputToken", Type: addressType},
		{Name: "outputToken", Type: addressType},
		{Name: "amountIn", Type: uint256Type},
		{Name: "minAmountOut", Type: uint256Type},
		{Name: "executorFee", Type: uint256Type},
		{Name: "triggerPriceX18", Type: uint256Type},
		{Name: "expiry", Type: uint256Type},
		{Name: "nonce", Type: uint256Type},
		{Name: "recipient", Type: addressType},
	}

	encoded, err := arguments.Pack(
		orderTypeHash,
		order.Maker,
		order.InputToken,
		order.OutputToken,
		zeroBigInt(order.AmountIn),
		zeroBigInt(order.MinAmountOut),
		zeroBigInt(order.ExecutorFee),
		zeroBigInt(order.TriggerPriceX18),
		zeroBigInt(order.Expiry),
		zeroBigInt(order.Nonce),
		order.Recipient,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("pack order payload: %w", err)
	}

	return crypto.Keccak256Hash(encoded), nil
}

// ComputeOrderDigest 计算与链上验签一致的 EIP-712 摘要。
func ComputeOrderDigest(chainID int64, settlementAddress string, order SettlementOrder) (common.Hash, error) {
	if chainID <= 0 {
		return common.Hash{}, fmt.Errorf("chain id must be greater than 0")
	}
	if !common.IsHexAddress(strings.TrimSpace(settlementAddress)) {
		return common.Hash{}, fmt.Errorf("settlement address must be a valid address")
	}
	if err := loadOrderABITypes(); err != nil {
		return common.Hash{}, err
	}

	orderHash, err := ComputeOrderHash(order)
	if err != nil {
		return common.Hash{}, err
	}

	domainArguments := abi.Arguments{
		{Name: "domainTypeHash", Type: bytes32Type},
		{Name: "nameHash", Type: bytes32Type},
		{Name: "versionHash", Type: bytes32Type},
		{Name: "chainId", Type: uint256Type},
		{Name: "verifyingContract", Type: addressType},
	}

	encodedDomain, err := domainArguments.Pack(
		domainTypeHash,
		nameHash,
		versionHash,
		big.NewInt(chainID),
		common.HexToAddress(strings.TrimSpace(settlementAddress)),
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("pack domain separator: %w", err)
	}

	domainSeparator := crypto.Keccak256Hash(encodedDomain)
	return crypto.Keccak256Hash(
		[]byte{0x19, 0x01},
		domainSeparator.Bytes(),
		orderHash.Bytes(),
	), nil
}

// ComputeInvalidateNoncesDigest 计算与合约 invalidateNoncesBySig 一致的 EIP-712 摘要。
func ComputeInvalidateNoncesDigest(
	chainID int64,
	settlementAddress string,
	maker common.Address,
	nonces []*big.Int,
	deadline *big.Int,
) (common.Hash, error) {
	if chainID <= 0 {
		return common.Hash{}, fmt.Errorf("chain id must be greater than 0")
	}
	if !common.IsHexAddress(strings.TrimSpace(settlementAddress)) {
		return common.Hash{}, fmt.Errorf("settlement address must be a valid address")
	}
	if maker == (common.Address{}) {
		return common.Hash{}, fmt.Errorf("maker must not be zero address")
	}
	if len(nonces) == 0 {
		return common.Hash{}, fmt.Errorf("nonces must not be empty")
	}
	if deadline == nil || deadline.Sign() <= 0 {
		return common.Hash{}, fmt.Errorf("deadline must be a positive integer")
	}
	if err := loadOrderABITypes(); err != nil {
		return common.Hash{}, err
	}

	noncesHash, err := computePackedNonceHash(nonces)
	if err != nil {
		return common.Hash{}, err
	}

	cancelArguments := abi.Arguments{
		{Name: "typeHash", Type: bytes32Type},
		{Name: "maker", Type: addressType},
		{Name: "noncesHash", Type: bytes32Type},
		{Name: "deadline", Type: uint256Type},
	}
	encodedCancel, err := cancelArguments.Pack(
		invalidateNoncesTypeHash,
		maker,
		noncesHash,
		deadline,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("pack invalidate nonces payload: %w", err)
	}

	domainArguments := abi.Arguments{
		{Name: "domainTypeHash", Type: bytes32Type},
		{Name: "nameHash", Type: bytes32Type},
		{Name: "versionHash", Type: bytes32Type},
		{Name: "chainId", Type: uint256Type},
		{Name: "verifyingContract", Type: addressType},
	}

	encodedDomain, err := domainArguments.Pack(
		domainTypeHash,
		nameHash,
		versionHash,
		big.NewInt(chainID),
		common.HexToAddress(strings.TrimSpace(settlementAddress)),
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("pack domain separator: %w", err)
	}

	domainSeparator := crypto.Keccak256Hash(encodedDomain)
	cancelHash := crypto.Keccak256Hash(encodedCancel)
	return crypto.Keccak256Hash(
		[]byte{0x19, 0x01},
		domainSeparator.Bytes(),
		cancelHash.Bytes(),
	), nil
}

// NormalizeHexSignature 把十六进制签名规范成 65 字节且 v 为 27/28 的形式，便于后续直接上链。
func NormalizeHexSignature(raw string) (string, error) {
	signatureBytes, err := hexutil.Decode(strings.TrimSpace(raw))
	if err != nil {
		return "", fmt.Errorf("decode signature: %w", err)
	}

	normalized, err := NormalizeSignatureBytes(signatureBytes)
	if err != nil {
		return "", err
	}

	return hexutil.Encode(normalized), nil
}

// VerifyOrderSignature 校验订单签名是否真实来自订单 maker。
func VerifyOrderSignature(chainID int64, settlementAddress string, order SettlementOrder, signatureHex string) error {
	digest, err := ComputeOrderDigest(chainID, settlementAddress, order)
	if err != nil {
		return err
	}

	signatureBytes, err := hexutil.Decode(strings.TrimSpace(signatureHex))
	if err != nil {
		return fmt.Errorf("decode signature: %w", err)
	}

	normalizedSignature, err := NormalizeSignatureBytes(signatureBytes)
	if err != nil {
		return err
	}
	recoverySignature := make([]byte, len(normalizedSignature))
	copy(recoverySignature, normalizedSignature)
	recoverySignature[64] -= 27

	recoveredKey, err := crypto.SigToPub(digest.Bytes(), recoverySignature)
	if err != nil {
		return fmt.Errorf("recover signer: %w", err)
	}

	recoveredAddress := crypto.PubkeyToAddress(*recoveredKey)
	if recoveredAddress != order.Maker {
		return fmt.Errorf("signature maker mismatch")
	}

	return nil
}

// VerifyInvalidateNoncesSignature 校验批量撤单签名是否真实来自 maker。
func VerifyInvalidateNoncesSignature(
	chainID int64,
	settlementAddress string,
	maker common.Address,
	nonces []*big.Int,
	deadline *big.Int,
	signature []byte,
) error {
	digest, err := ComputeInvalidateNoncesDigest(chainID, settlementAddress, maker, nonces, deadline)
	if err != nil {
		return err
	}

	normalizedSignature, err := NormalizeSignatureBytes(signature)
	if err != nil {
		return err
	}
	recoverySignature := make([]byte, len(normalizedSignature))
	copy(recoverySignature, normalizedSignature)
	recoverySignature[64] -= 27

	recoveredKey, err := crypto.SigToPub(digest.Bytes(), recoverySignature)
	if err != nil {
		return fmt.Errorf("recover signer: %w", err)
	}

	recoveredAddress := crypto.PubkeyToAddress(*recoveredKey)
	if recoveredAddress != maker {
		return fmt.Errorf("invalidate nonces signature maker mismatch")
	}

	return nil
}

// NormalizeSignatureBytes 统一签名长度与 recovery id 表达，输出链上可直接使用的 27/28 形式。
func NormalizeSignatureBytes(signature []byte) ([]byte, error) {
	if len(signature) != crypto.SignatureLength {
		return nil, fmt.Errorf("signature must be 65 bytes")
	}

	normalized := make([]byte, len(signature))
	copy(normalized, signature)

	switch normalized[64] {
	case 27, 28:
		normalized[64] -= 27
	case 0, 1:
	default:
		return nil, fmt.Errorf("signature recovery id must be 0, 1, 27 or 28")
	}

	if !crypto.ValidateSignatureValues(
		normalized[64],
		new(big.Int).SetBytes(normalized[:32]),
		new(big.Int).SetBytes(normalized[32:64]),
		true,
	) {
		return nil, fmt.Errorf("signature values are invalid")
	}

	normalized[64] += 27
	return normalized, nil
}

// loadOrderABITypes 懒加载 EIP-712 编码时需要的 ABI 基础类型，避免包初始化阶段直接 panic。
func loadOrderABITypes() error {
	orderABITypesOnce.Do(func() {
		bytes32Type, orderABITypesErr = abi.NewType("bytes32", "", nil)
		if orderABITypesErr != nil {
			orderABITypesErr = fmt.Errorf("load bytes32 abi type: %w", orderABITypesErr)
			return
		}

		addressType, orderABITypesErr = abi.NewType("address", "", nil)
		if orderABITypesErr != nil {
			orderABITypesErr = fmt.Errorf("load address abi type: %w", orderABITypesErr)
			return
		}

		uint256Type, orderABITypesErr = abi.NewType("uint256", "", nil)
		if orderABITypesErr != nil {
			orderABITypesErr = fmt.Errorf("load uint256 abi type: %w", orderABITypesErr)
		}
	})

	return orderABITypesErr
}

// zeroBigInt 把 nil 大整数安全映射为 0，避免 ABI 打包阶段出现空指针。
func zeroBigInt(value *big.Int) *big.Int {
	if value == nil {
		return big.NewInt(0)
	}
	return value
}

// computePackedNonceHash 复刻 Solidity 里的 keccak256(abi.encodePacked(nonces))。
func computePackedNonceHash(nonces []*big.Int) (common.Hash, error) {
	packed := make([]byte, 0, len(nonces)*32)
	for _, nonce := range nonces {
		if nonce == nil || nonce.Sign() < 0 {
			return common.Hash{}, fmt.Errorf("nonce must be a non-negative integer")
		}
		if nonce.BitLen() > 256 {
			return common.Hash{}, fmt.Errorf("nonce exceeds uint256")
		}
		packed = append(packed, common.LeftPadBytes(nonce.Bytes(), 32)...)
	}
	return crypto.Keccak256Hash(packed), nil
}
