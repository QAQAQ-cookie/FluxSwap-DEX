package app

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"fluxswap-backend/internal/domain"
	"fluxswap-backend/internal/repo"

	"gorm.io/gorm"
)

const maxOrderActivityDedupeKeyLength = 191

// RecordOrderActivityParams 描述一条待写入的订单活动。
type RecordOrderActivityParams struct {
	Order        *domain.Order
	ActivityType string
	FromStatus   string
	ToStatus     string
	ReasonCode   string
	ReasonDetail string
	Source       string
	ActorAddress string
	TxHash       string
	BlockNumber  int64
	LogIndex     int64
	DedupeKey    string
	Payload      interface{}
	OccurredAt   time.Time
}

// RecordOrderActivity 写入一条订单活动，重复写入由唯一键去重。
func RecordOrderActivity(ctx context.Context, db *gorm.DB, params RecordOrderActivityParams) error {
	if db == nil || params.Order == nil {
		return nil
	}
	if strings.TrimSpace(params.ActivityType) == "" {
		return nil
	}

	occurredAt := params.OccurredAt.UTC()
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}

	payloadJSON := ""
	if params.Payload != nil {
		encoded, err := json.Marshal(params.Payload)
		if err != nil {
			return err
		}
		payloadJSON = string(encoded)
	}

	dedupeKey := strings.TrimSpace(params.DedupeKey)
	if dedupeKey == "" {
		dedupeKey = defaultActivityDedupeKey(params, occurredAt)
	}
	dedupeKey = normalizeActivityDedupeKey(dedupeKey)

	activity := &domain.OrderActivity{
		OrderID:           params.Order.ID,
		ChainID:           params.Order.ChainID,
		SettlementAddress: normalizeLower(params.Order.SettlementAddress),
		OrderHash:         normalizeLower(params.Order.OrderHash),
		ActivityType:      strings.TrimSpace(params.ActivityType),
		FromStatus:        strings.TrimSpace(params.FromStatus),
		ToStatus:          strings.TrimSpace(params.ToStatus),
		ReasonCode:        strings.TrimSpace(params.ReasonCode),
		ReasonDetail:      strings.TrimSpace(params.ReasonDetail),
		Source:            strings.TrimSpace(params.Source),
		ActorAddress:      normalizeOptionalAddress(params.ActorAddress),
		TxHash:            normalizeLower(params.TxHash),
		BlockNumber:       params.BlockNumber,
		LogIndex:          params.LogIndex,
		DedupeKey:         dedupeKey,
		PayloadJSON:       payloadJSON,
		OccurredAt:        occurredAt,
		CreatedAt:         time.Now().UTC(),
	}

	err := repo.NewOrderActivityRepository(db).Create(ctx, activity)
	if err != nil && repo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}

func defaultActivityDedupeKey(params RecordOrderActivityParams, occurredAt time.Time) string {
	txHash := normalizeLower(params.TxHash)
	if txHash != "" {
		return fmt.Sprintf(
			"%s:%d:%s:%s:%d",
			strings.TrimSpace(params.ActivityType),
			params.Order.ChainID,
			normalizeLower(params.Order.OrderHash),
			txHash,
			params.LogIndex,
		)
	}

	return fmt.Sprintf(
		"%s:%d:%s:%s:%d",
		strings.TrimSpace(params.ActivityType),
		params.Order.ChainID,
		normalizeLower(params.Order.OrderHash),
		strings.TrimSpace(params.ReasonCode),
		occurredAt.UnixNano(),
	)
}

func normalizeOptionalAddress(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return normalizeLower(trimmed)
}

func normalizeActivityDedupeKey(value string) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= maxOrderActivityDedupeKeyLength {
		return trimmed
	}

	sum := sha256.Sum256([]byte(trimmed))
	return fmt.Sprintf("sha256:%x", sum)
}
