package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

type AdminAllowlist struct {
	addresses map[string]struct{}
}

func NewAdminAllowlist(addresses []string) AdminAllowlist {
	allowlist := AdminAllowlist{addresses: make(map[string]struct{}, len(addresses))}
	for _, address := range addresses {
		normalized := NormalizeAddress(address)
		if common.IsHexAddress(normalized) {
			allowlist.addresses[normalized] = struct{}{}
		}
	}
	return allowlist
}

func (a AdminAllowlist) IsConfigured() bool {
	return len(a.addresses) > 0
}

func (a AdminAllowlist) IsAdmin(address string) bool {
	_, ok := a.addresses[NormalizeAddress(address)]
	return ok
}

func NormalizeAddress(address string) string {
	return strings.ToLower(strings.TrimSpace(address))
}

func IsAddress(address string) bool {
	return common.IsHexAddress(NormalizeAddress(address))
}

func TokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func RecoverPersonalSignAddress(message string, signatureHex string) (string, error) {
	signatureBytes, err := hex.DecodeString(strings.TrimPrefix(signatureHex, "0x"))
	if err != nil {
		return "", fmt.Errorf("decode signature: %w", err)
	}
	if len(signatureBytes) != 65 {
		return "", fmt.Errorf("invalid signature length %d", len(signatureBytes))
	}

	if signatureBytes[64] >= 27 {
		signatureBytes[64] -= 27
	}

	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(message))
	hash := crypto.Keccak256Hash([]byte(prefix), []byte(message))
	publicKey, err := crypto.SigToPub(hash.Bytes(), signatureBytes)
	if err != nil {
		return "", fmt.Errorf("recover public key: %w", err)
	}

	return NormalizeAddress(crypto.PubkeyToAddress(*publicKey).Hex()), nil
}
