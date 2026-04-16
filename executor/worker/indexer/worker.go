package indexer

import (
	"context"
	"fmt"

	"fluxswap-executor/internal/app"
	"fluxswap-executor/internal/repo"
	"fluxswap-executor/rpc/executor"

	"gorm.io/gorm"
)

// Worker 负责把标准化后的链上事件写回数据库。
type Worker struct {
	db *gorm.DB
}

// NewWorker 基于共享数据库连接创建索引器 worker。
func NewWorker(db *gorm.DB) *Worker {
	return &Worker{db: db}
}

// ApplyEvent 将一条标准化事件路由到共享的事件应用服务中处理。
func (w *Worker) ApplyEvent(ctx context.Context, event OrderEvent) (*executor.ApplyOrderEventResponse, error) {
	orderRepo := repo.NewOrderRepository(w.db)
	orderEventRepo := repo.NewOrderEventRepository(w.db)
	service := app.NewOrderEventService(orderRepo, orderEventRepo)

	params := app.ApplyOrderEventParams{
		ChainID:         event.ChainID,
		ContractAddress: event.ContractAddress,
		EventName:       event.EventName,
		TxHash:          event.TxHash,
		LogIndex:        event.LogIndex,
		BlockNumber:     event.BlockNumber,
		OrderHash:       event.OrderHash,
		Maker:           event.Maker,
		Nonce:           event.Nonce,
		GrossAmountOut:  event.GrossAmountOut,
		RecipientAmountOut: event.RecipientAmountOut,
		ExecutorFeeAmount: event.ExecutorFeeAmount,
	}

	switch event.EventName {
	case EventOrderExecuted:
		order, err := service.Apply(ctx, params)
		if err != nil {
			if err == app.ErrDuplicateOrderEvent {
				return &executor.ApplyOrderEventResponse{}, nil
			}
			return nil, err
		}

		payload := app.OrderToResponse(order)
		return &executor.ApplyOrderEventResponse{
			Order: &executor.GetOrderResponse{
				Id:                payload.ID,
				ChainId:           payload.ChainID,
				SettlementAddress: payload.SettlementAddress,
				OrderHash:         payload.OrderHash,
				Maker:             payload.Maker,
				InputToken:        payload.InputToken,
				OutputToken:       payload.OutputToken,
				AmountIn:          payload.AmountIn,
				MinAmountOut:      payload.MinAmountOut,
				TriggerPriceX18:   payload.TriggerPriceX18,
				Expiry:            payload.Expiry,
				Nonce:             payload.Nonce,
				Recipient:         payload.Recipient,
				Source:            payload.Source,
				Status:            payload.Status,
				StatusReason:      payload.StatusReason,
				SubmittedTxHash:   payload.SubmittedTxHash,
				ExecutedTxHash:    payload.ExecutedTxHash,
				CancelledTxHash:   payload.CancelledTxHash,
				LastCheckedBlock:  payload.LastCheckedBlock,
				CreatedAt:         payload.CreatedAt,
				UpdatedAt:         payload.UpdatedAt,
			},
		}, nil
	case EventNonceInvalidated:
		orders, err := service.ApplyNonceInvalidated(ctx, params)
		if err != nil {
			if err == app.ErrDuplicateOrderEvent {
				return &executor.ApplyOrderEventResponse{}, nil
			}
			return nil, err
		}
		if len(orders) == 0 {
			return &executor.ApplyOrderEventResponse{}, nil
		}
		payload := app.OrderToResponse(&orders[0])
		return &executor.ApplyOrderEventResponse{
			Order: &executor.GetOrderResponse{
				Id:                payload.ID,
				ChainId:           payload.ChainID,
				SettlementAddress: payload.SettlementAddress,
				OrderHash:         payload.OrderHash,
				Maker:             payload.Maker,
				InputToken:        payload.InputToken,
				OutputToken:       payload.OutputToken,
				AmountIn:          payload.AmountIn,
				MinAmountOut:      payload.MinAmountOut,
				TriggerPriceX18:   payload.TriggerPriceX18,
				Expiry:            payload.Expiry,
				Nonce:             payload.Nonce,
				Recipient:         payload.Recipient,
				Source:            payload.Source,
				Status:            payload.Status,
				StatusReason:      payload.StatusReason,
				SubmittedTxHash:   payload.SubmittedTxHash,
				ExecutedTxHash:    payload.ExecutedTxHash,
				CancelledTxHash:   payload.CancelledTxHash,
				LastCheckedBlock:  payload.LastCheckedBlock,
				CreatedAt:         payload.CreatedAt,
				UpdatedAt:         payload.UpdatedAt,
			},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported event name: %s", event.EventName)
	}
}
