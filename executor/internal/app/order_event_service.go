package app

import (
	"context"
	"errors"
	"strings"
	"time"

	"fluxswap-executor/internal/domain"
	"fluxswap-executor/internal/repo"

	"gorm.io/gorm"
)

var ErrDuplicateOrderEvent = errors.New("duplicate order event")

// ApplyOrderEventParams 是应用层统一消费的标准化事件参数。
type ApplyOrderEventParams struct {
	ChainID         int64
	ContractAddress string
	EventName       string
	TxHash          string
	LogIndex        int64
	BlockNumber     int64
	OrderHash       string
	Maker           string
	Nonce           string
	MinValidNonce   string
}

// OrderEventService 负责把结算合约事件应用到链下订单数据库。
type OrderEventService struct {
	orderRepo      *repo.OrderRepository
	orderEventRepo *repo.OrderEventRepository
}

// NewOrderEventService 基于订单仓储和事件仓储创建事件应用服务。
func NewOrderEventService(orderRepo *repo.OrderRepository, orderEventRepo *repo.OrderEventRepository) *OrderEventService {
	return &OrderEventService{
		orderRepo:      orderRepo,
		orderEventRepo: orderEventRepo,
	}
}

// Apply 记录订单级事件，并同步更新对应订单状态。
//
// 它处理带具体 orderHash 的事件，比如 OrderExecuted 和 OrderCancelled。
// 如果事件行重复写入，会返回 ErrDuplicateOrderEvent，调用方可以把重试视为幂等操作。
func (s *OrderEventService) Apply(ctx context.Context, params ApplyOrderEventParams) (*domain.Order, error) {
	if s == nil || s.orderRepo == nil || s.orderEventRepo == nil {
		return nil, errors.New("order event service unavailable")
	}

	if err := s.orderEventRepo.Create(ctx, &domain.OrderEvent{
		ChainID:         params.ChainID,
		ContractAddress: strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		EventName:       strings.TrimSpace(params.EventName),
		TxHash:          strings.ToLower(strings.TrimSpace(params.TxHash)),
		LogIndex:        params.LogIndex,
		BlockNumber:     params.BlockNumber,
		OrderHash:       strings.ToLower(strings.TrimSpace(params.OrderHash)),
		Maker:           strings.ToLower(strings.TrimSpace(params.Maker)),
		Nonce:           strings.TrimSpace(params.Nonce),
		MinValidNonce:   strings.TrimSpace(params.MinValidNonce),
		ObservedAt:      time.Now().UTC(),
	}); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrDuplicateOrderEvent
		}
		return nil, err
	}

	order, err := s.orderRepo.GetByOrderHash(
		ctx,
		params.ChainID,
		strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		strings.ToLower(strings.TrimSpace(params.OrderHash)),
	)
	if err != nil {
		return nil, err
	}

	switch strings.TrimSpace(params.EventName) {
	case "OrderExecuted":
		order.Status = "executed"
		order.StatusReason = "updated_by_order_executed_event"
		order.ExecutedTxHash = strings.ToLower(strings.TrimSpace(params.TxHash))
	case "OrderCancelled":
		order.Status = "cancelled"
		order.StatusReason = "updated_by_order_cancelled_event"
		order.CancelledTxHash = strings.ToLower(strings.TrimSpace(params.TxHash))
	default:
		return nil, gorm.ErrInvalidData
	}

	order.LastCheckedBlock = params.BlockNumber
	order.UpdatedAt = time.Now().UTC()

	if err := s.orderRepo.Update(ctx, order); err != nil {
		return nil, err
	}

	return order, nil
}

// ApplyNonceInvalidated 记录单个 nonce 作废事件，并取消所有受影响的活跃订单。
func (s *OrderEventService) ApplyNonceInvalidated(ctx context.Context, params ApplyOrderEventParams) ([]domain.Order, error) {
	if s == nil || s.orderRepo == nil || s.orderEventRepo == nil {
		return nil, errors.New("order event service unavailable")
	}

	if err := s.orderEventRepo.Create(ctx, &domain.OrderEvent{
		ChainID:         params.ChainID,
		ContractAddress: strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		EventName:       strings.TrimSpace(params.EventName),
		TxHash:          strings.ToLower(strings.TrimSpace(params.TxHash)),
		LogIndex:        params.LogIndex,
		BlockNumber:     params.BlockNumber,
		OrderHash:       strings.ToLower(strings.TrimSpace(params.OrderHash)),
		Maker:           strings.ToLower(strings.TrimSpace(params.Maker)),
		Nonce:           strings.TrimSpace(params.Nonce),
		MinValidNonce:   strings.TrimSpace(params.MinValidNonce),
		ObservedAt:      time.Now().UTC(),
	}); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrDuplicateOrderEvent
		}
		return nil, err
	}

	orders, err := s.orderRepo.ListOpenOrdersByMakerAndNonce(
		ctx,
		params.ChainID,
		strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		strings.ToLower(strings.TrimSpace(params.Maker)),
		strings.TrimSpace(params.Nonce),
	)
	if err != nil {
		return nil, err
	}

	for i := range orders {
		orders[i].Status = "cancelled"
		orders[i].StatusReason = "updated_by_nonce_invalidated_event"
		orders[i].CancelledTxHash = strings.ToLower(strings.TrimSpace(params.TxHash))
		orders[i].LastCheckedBlock = params.BlockNumber
		orders[i].UpdatedAt = time.Now().UTC()
		if err := s.orderRepo.Update(ctx, &orders[i]); err != nil {
			return nil, err
		}
	}

	return orders, nil
}

// ApplyMinValidNonceUpdated 记录 cancelUpTo 事件，并取消所有早于最小有效 nonce 的活跃订单。
func (s *OrderEventService) ApplyMinValidNonceUpdated(ctx context.Context, params ApplyOrderEventParams) ([]domain.Order, error) {
	if s == nil || s.orderRepo == nil || s.orderEventRepo == nil {
		return nil, errors.New("order event service unavailable")
	}

	if err := s.orderEventRepo.Create(ctx, &domain.OrderEvent{
		ChainID:         params.ChainID,
		ContractAddress: strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		EventName:       strings.TrimSpace(params.EventName),
		TxHash:          strings.ToLower(strings.TrimSpace(params.TxHash)),
		LogIndex:        params.LogIndex,
		BlockNumber:     params.BlockNumber,
		OrderHash:       strings.ToLower(strings.TrimSpace(params.OrderHash)),
		Maker:           strings.ToLower(strings.TrimSpace(params.Maker)),
		Nonce:           strings.TrimSpace(params.Nonce),
		MinValidNonce:   strings.TrimSpace(params.MinValidNonce),
		ObservedAt:      time.Now().UTC(),
	}); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
			return nil, ErrDuplicateOrderEvent
		}
		return nil, err
	}

	orders, err := s.orderRepo.ListOpenOrdersByMakerAndNonceBelow(
		ctx,
		params.ChainID,
		strings.ToLower(strings.TrimSpace(params.ContractAddress)),
		strings.ToLower(strings.TrimSpace(params.Maker)),
		strings.TrimSpace(params.MinValidNonce),
	)
	if err != nil {
		return nil, err
	}

	for i := range orders {
		orders[i].Status = "cancelled"
		orders[i].StatusReason = "updated_by_min_valid_nonce_event"
		orders[i].CancelledTxHash = strings.ToLower(strings.TrimSpace(params.TxHash))
		orders[i].LastCheckedBlock = params.BlockNumber
		orders[i].UpdatedAt = time.Now().UTC()
		if err := s.orderRepo.Update(ctx, &orders[i]); err != nil {
			return nil, err
		}
	}

	return orders, nil
}

// OrderToResponse 把领域模型转换成 RPC 和 worker 共用的响应结构。
func OrderToResponse(order *domain.Order) *struct {
	ID                uint64
	ChainID           int64
	SettlementAddress string
	OrderHash         string
	Maker             string
	InputToken        string
	OutputToken       string
	AmountIn          string
	MinAmountOut      string
	TriggerPriceX18   string
	Expiry            string
	Nonce             string
	Recipient         string
	Source            string
	Status            string
	StatusReason      string
	SubmittedTxHash   string
	ExecutedTxHash    string
	CancelledTxHash   string
	LastCheckedBlock  int64
	CreatedAt         string
	UpdatedAt         string
} {
	if order == nil {
		return nil
	}

	return &struct {
		ID                uint64
		ChainID           int64
		SettlementAddress string
		OrderHash         string
		Maker             string
		InputToken        string
		OutputToken       string
		AmountIn          string
		MinAmountOut      string
		TriggerPriceX18   string
		Expiry            string
		Nonce             string
		Recipient         string
		Source            string
		Status            string
		StatusReason      string
		SubmittedTxHash   string
		ExecutedTxHash    string
		CancelledTxHash   string
		LastCheckedBlock  int64
		CreatedAt         string
		UpdatedAt         string
	}{
		ID:                order.ID,
		ChainID:           order.ChainID,
		SettlementAddress: order.SettlementAddress,
		OrderHash:         order.OrderHash,
		Maker:             order.Maker,
		InputToken:        order.InputToken,
		OutputToken:       order.OutputToken,
		AmountIn:          order.AmountIn,
		MinAmountOut:      order.MinAmountOut,
		TriggerPriceX18:   order.TriggerPriceX18,
		Expiry:            order.Expiry,
		Nonce:             order.Nonce,
		Recipient:         order.Recipient,
		Source:            order.Source,
		Status:            order.Status,
		StatusReason:      order.StatusReason,
		SubmittedTxHash:   order.SubmittedTxHash,
		ExecutedTxHash:    order.ExecutedTxHash,
		CancelledTxHash:   order.CancelledTxHash,
		LastCheckedBlock:  order.LastCheckedBlock,
		CreatedAt:         formatTime(order.CreatedAt),
		UpdatedAt:         formatTime(order.UpdatedAt),
	}
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}

	return value.UTC().Format("2006-01-02T15:04:05Z07:00")
}
