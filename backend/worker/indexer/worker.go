package indexer

import (
	"context"
	"fmt"

	"fluxswap-backend/internal/app"
	"fluxswap-backend/internal/domain"

	"gorm.io/gorm"
)

// Worker 负责把标准化后的链上事件写回数据库。
type Worker struct {
	db *gorm.DB
}

// OrderSnapshot 表示 indexer 回写后对外暴露的订单最小快照。
type OrderSnapshot struct {
	ID                      uint64
	ChainID                 int64
	SettlementAddress       string
	OrderHash               string
	Maker                   string
	InputToken              string
	OutputToken             string
	AmountIn                string
	MinAmountOut            string
	ExecutorFee             string
	ExecutorFeeToken        string
	TriggerPriceX18         string
	Expiry                  string
	Nonce                   string
	Recipient               string
	Source                  string
	Status                  string
	StatusReason            string
	EstimatedGasUsed        string
	GasPriceAtQuote         string
	FeeQuoteAt              string
	LastRequiredExecutorFee string
	LastFeeCheckAt          string
	LastExecutionCheckAt    string
	LastBlockReason         string
	SettledAmountOut        string
	SettledExecutorFee      string
	SubmittedTxHash         string
	ExecutedTxHash          string
	CancelledTxHash         string
	LastCheckedBlock        int64
	CreatedAt               string
	UpdatedAt               string
}

// ApplyResult 表示 indexer 一次事件回写后返回的最小结果。
type ApplyResult struct {
	Orders        []*OrderSnapshot
	AffectedCount int
}

// NewWorker 基于共享数据库连接创建索引器 worker。
func NewWorker(db *gorm.DB) *Worker {
	return &Worker{db: db}
}

// ApplyEvent 将一条标准化事件路由到共享的事件应用服务中处理。
func (w *Worker) ApplyEvent(ctx context.Context, event OrderEvent) (*ApplyResult, error) {
	service := app.NewOrderEventService(w.db)

	params := app.ApplyOrderEventParams{
		ChainID:            event.ChainID,
		ContractAddress:    event.ContractAddress,
		EventName:          event.EventName,
		TxHash:             event.TxHash,
		LogIndex:           event.LogIndex,
		BlockNumber:        event.BlockNumber,
		OrderHash:          event.OrderHash,
		Maker:              event.Maker,
		Nonce:              event.Nonce,
		GrossAmountOut:     event.GrossAmountOut,
		RecipientAmountOut: event.RecipientAmountOut,
		ExecutorFeeAmount:  event.ExecutorFeeAmount,
	}

	if event.Removed {
		if err := service.Revert(ctx, params); err != nil {
			return nil, err
		}
		return &ApplyResult{}, nil
	}

	switch event.EventName {
	case EventOrderExecuted:
		order, err := service.Apply(ctx, params)
		if err != nil {
			if err == app.ErrDuplicateOrderEvent {
				return &ApplyResult{}, nil
			}
			return nil, err
		}

		snapshot := toOrderSnapshot(order)
		if snapshot == nil {
			return &ApplyResult{}, nil
		}

		return &ApplyResult{
			Orders:        []*OrderSnapshot{snapshot},
			AffectedCount: 1,
		}, nil
	case EventNonceInvalidated:
		orders, err := service.ApplyNonceInvalidated(ctx, params)
		if err != nil {
			if err == app.ErrDuplicateOrderEvent {
				return &ApplyResult{}, nil
			}
			return nil, err
		}

		snapshots := make([]*OrderSnapshot, 0, len(orders))
		for i := range orders {
			snapshot := toOrderSnapshot(&orders[i])
			if snapshot != nil {
				snapshots = append(snapshots, snapshot)
			}
		}

		return &ApplyResult{
			Orders:        snapshots,
			AffectedCount: len(snapshots),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported event name: %s", event.EventName)
	}
}

func toOrderSnapshot(order *domain.Order) *OrderSnapshot {
	payload := app.OrderToResponse(order)
	if payload == nil {
		return nil
	}

	return &OrderSnapshot{
		ID:                      payload.ID,
		ChainID:                 payload.ChainID,
		SettlementAddress:       payload.SettlementAddress,
		OrderHash:               payload.OrderHash,
		Maker:                   payload.Maker,
		InputToken:              payload.InputToken,
		OutputToken:             payload.OutputToken,
		AmountIn:                payload.AmountIn,
		MinAmountOut:            payload.MinAmountOut,
		ExecutorFee:             payload.ExecutorFee,
		ExecutorFeeToken:        payload.ExecutorFeeToken,
		TriggerPriceX18:         payload.TriggerPriceX18,
		Expiry:                  payload.Expiry,
		Nonce:                   payload.Nonce,
		Recipient:               payload.Recipient,
		Source:                  payload.Source,
		Status:                  payload.Status,
		StatusReason:            payload.StatusReason,
		EstimatedGasUsed:        payload.EstimatedGasUsed,
		GasPriceAtQuote:         payload.GasPriceAtQuote,
		FeeQuoteAt:              payload.FeeQuoteAt,
		LastRequiredExecutorFee: payload.LastRequiredExecutorFee,
		LastFeeCheckAt:          payload.LastFeeCheckAt,
		LastExecutionCheckAt:    payload.LastExecutionCheckAt,
		LastBlockReason:         payload.LastBlockReason,
		SettledAmountOut:        payload.SettledAmountOut,
		SettledExecutorFee:      payload.SettledExecutorFee,
		SubmittedTxHash:         payload.SubmittedTxHash,
		ExecutedTxHash:          payload.ExecutedTxHash,
		CancelledTxHash:         payload.CancelledTxHash,
		LastCheckedBlock:        payload.LastCheckedBlock,
		CreatedAt:               payload.CreatedAt,
		UpdatedAt:               payload.UpdatedAt,
	}
}
