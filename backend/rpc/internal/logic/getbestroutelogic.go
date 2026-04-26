package logic

import (
	"context"
	"fmt"
	"math/big"
	"sort"
	"strings"

	"fluxswap-backend/rpc/executor"
	"fluxswap-backend/rpc/internal/svc"

	"github.com/ethereum/go-ethereum/common"
	"github.com/zeromicro/go-zero/core/logx"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	baseRouteGasEstimate   uint64 = 140000
	perHopRouteGasEstimate uint64 = 50000
)

type GetBestRouteLogic struct {
	ctx    context.Context
	svcCtx *svc.ServiceContext
	logx.Logger
}

// routeRequestTokens keeps both request-side token semantics and
// execution-side token semantics. Native-token requests are preserved on
// the request side and mapped to WETH on the execution side.
type routeRequestTokens struct {
	requestedTokenIn  string
	requestedTokenOut string
	executionTokenIn  string
	executionTokenOut string
	nativeTokenIn     bool
	nativeTokenOut    bool
}

func NewGetBestRouteLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetBestRouteLogic {
	return &GetBestRouteLogic{
		ctx:    ctx,
		svcCtx: svcCtx,
		Logger: logx.WithContext(ctx),
	}
}

// GetBestRoute selects the best route from graph candidates, on-chain quotes,
// and gas-adjusted ranking.
func (l *GetBestRouteLogic) GetBestRoute(in *executor.GetBestRouteRequest) (*executor.GetBestRouteResponse, error) {
	if in.GetChainId() <= 0 {
		return nil, status.Error(codes.InvalidArgument, "chainId must be greater than 0")
	}
	if !isAddress(in.GetTokenIn()) {
		return nil, status.Error(codes.InvalidArgument, "tokenIn must be a valid address")
	}
	if !isAddress(in.GetTokenOut()) {
		return nil, status.Error(codes.InvalidArgument, "tokenOut must be a valid address")
	}
	if normalizeAddress(in.GetTokenIn()) == normalizeAddress(in.GetTokenOut()) {
		return nil, status.Error(codes.InvalidArgument, "tokenIn and tokenOut must be different")
	}
	if !isPositiveUint(in.GetAmount()) {
		return nil, status.Error(codes.InvalidArgument, "amount must be a positive integer string")
	}

	quoteType := in.GetQuoteType()
	if quoteType == executor.RouteQuoteType_ROUTE_QUOTE_TYPE_UNSPECIFIED {
		quoteType = executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT
	}
	if quoteType != executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT &&
		quoteType != executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT {
		return nil, status.Error(codes.InvalidArgument, "quoteType is not supported")
	}

	maxHops := in.GetMaxHops()
	if maxHops == 0 {
		maxHops = 1
	}
	if maxHops > 1 {
		return nil, status.Error(codes.InvalidArgument, "maxHops greater than 1 is not supported yet")
	}

	if l.svcCtx.RouterGraph == nil {
		return nil, status.Error(codes.FailedPrecondition, "router graph store is not initialized")
	}

	quoteClient := l.svcCtx.LookupRouteQuoteClient(in.GetChainId())
	if quoteClient == nil {
		return nil, status.Error(codes.NotFound, "route quote client not found")
	}

	requestTokens, err := resolveRouteRequestTokens(
		in.GetTokenIn(),
		in.GetTokenOut(),
		quoteClient.WETHAddress(),
	)
	if err != nil {
		return nil, status.Error(codes.FailedPrecondition, err.Error())
	}
	if requestTokens.executionTokenIn == requestTokens.executionTokenOut {
		return nil, status.Error(codes.InvalidArgument, "tokenIn and tokenOut resolve to the same executable token")
	}

	quotedAmount := mustBigInt(in.GetAmount())
	candidateTokens, err := l.buildCandidateTokens(
		in.GetChainId(),
		requestTokens.executionTokenIn,
		requestTokens.executionTokenOut,
		maxHops,
	)
	if err != nil {
		l.Errorf("build candidate routes failed: %v", err)
		return nil, status.Error(codes.Internal, "build candidate routes failed")
	}
	if len(candidateTokens) == 0 {
		return &executor.GetBestRouteResponse{
			Notice: failureNotice(
				"ROUTE_NOT_FOUND",
				"no route found",
				"add a direct pool or an intermediate pool between tokenIn and tokenOut",
				"route_search",
			),
		}, nil
	}

	candidates := make([]*executor.RoutePath, 0, len(candidateTokens))
	for _, pathTokens := range candidateTokens {
		routePath, quoteErr := quotePath(l.ctx, quoteClient, quoteType, quotedAmount, pathTokens)
		if quoteErr != nil {
			continue
		}
		candidates = append(candidates, routePath)
	}
	if len(candidates) == 0 {
		return &executor.GetBestRouteResponse{
			Notice: failureNotice(
				"ROUTE_QUOTE_FAILED",
				"all candidate routes failed to quote",
				"check whether each hop has enough liquidity for the requested amount",
				"route_quote",
			),
		}, nil
	}

	if err := applyGasAdjustedRanking(l.ctx, quoteClient, quoteType, candidates); err != nil {
		l.Errorf("apply gas-adjusted ranking failed: %v", err)
		return nil, status.Error(codes.Internal, "apply gas-adjusted ranking failed")
	}

	selected := candidates[0]
	return &executor.GetBestRouteResponse{
		SelectedRoute:          buildRouteView(selected, requestTokens, quoteType),
		AlternativeRoutes:      buildAlternativeRouteViews(candidates, requestTokens, quoteType),
		Execution:              buildExecution(selected),
		SelectionReason:        buildSelectionReason(selected, quoteType),
		UsedGasAdjustedRanking: true,
		Quote: &executor.RouteQuote{
			QuoteType: quoteType,
			AmountIn:  selected.GetAmountIn(),
			AmountOut: selected.GetAmountOut(),
		},
		Notice: successNotice(
			"BEST_ROUTE_SELECTED",
			"best route selected",
			"use execution.routerPath as the router path for execution",
			"route_selection",
		),
	}, nil
}

// buildCandidateTokens builds direct and single-intermediate candidate paths
// from the router graph.
func (l *GetBestRouteLogic) buildCandidateTokens(chainID int64, tokenIn string, tokenOut string, maxHops uint32) ([][]string, error) {
	paths := make([][]string, 0)

	tokenInNeighbors, _, err := l.svcCtx.RouterGraph.GetTokenNeighbors(l.ctx, chainID, tokenIn)
	if err != nil {
		return nil, err
	}
	neighborSet := make(map[string]struct{}, len(tokenInNeighbors.Neighbors))
	for _, neighbor := range tokenInNeighbors.Neighbors {
		normalized := normalizeAddress(neighbor)
		neighborSet[normalized] = struct{}{}
	}

	if _, ok := neighborSet[tokenOut]; ok {
		paths = append(paths, []string{tokenIn, tokenOut})
	}

	if maxHops == 0 {
		return paths, nil
	}

	for _, mid := range tokenInNeighbors.Neighbors {
		mid = normalizeAddress(mid)
		if mid == "" || mid == tokenOut || mid == tokenIn {
			continue
		}

		midNeighbors, _, err := l.svcCtx.RouterGraph.GetTokenNeighbors(l.ctx, chainID, mid)
		if err != nil {
			return nil, err
		}
		if containsAddress(midNeighbors.Neighbors, tokenOut) {
			paths = append(paths, []string{tokenIn, mid, tokenOut})
		}
	}

	return dedupePaths(paths), nil
}

// resolveRouteRequestTokens maps native-token request semantics to executable
// WETH addresses while retaining the original request tokens for display.
func resolveRouteRequestTokens(tokenIn string, tokenOut string, wethAddress common.Address) (routeRequestTokens, error) {
	weth := normalizeAddress(wethAddress.Hex())
	if weth == "" || weth == normalizeAddress((common.Address{}).Hex()) {
		return routeRequestTokens{}, fmt.Errorf("weth address is not available")
	}

	requestedTokenIn := normalizeAddress(tokenIn)
	requestedTokenOut := normalizeAddress(tokenOut)
	nativeTokenIn := isNativeRouteToken(requestedTokenIn)
	nativeTokenOut := isNativeRouteToken(requestedTokenOut)

	executionTokenIn := requestedTokenIn
	if nativeTokenIn {
		executionTokenIn = weth
	}

	executionTokenOut := requestedTokenOut
	if nativeTokenOut {
		executionTokenOut = weth
	}

	return routeRequestTokens{
		requestedTokenIn:  requestedTokenIn,
		requestedTokenOut: requestedTokenOut,
		executionTokenIn:  executionTokenIn,
		executionTokenOut: executionTokenOut,
		nativeTokenIn:     nativeTokenIn,
		nativeTokenOut:    nativeTokenOut,
	}, nil
}

// quotePath requests a router quote for one candidate path and normalizes the
// result into a single route structure.
func quotePath(
	ctx context.Context,
	quoteClient svc.RouterQuoteClient,
	quoteType executor.RouteQuoteType,
	amount *big.Int,
	pathTokens []string,
) (*executor.RoutePath, error) {
	path := make([]common.Address, 0, len(pathTokens))
	for _, token := range pathTokens {
		path = append(path, common.HexToAddress(token))
	}

	switch quoteType {
	case executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_INPUT:
		amounts, err := quoteClient.GetAmountsOut(ctx, amount, path)
		if err != nil {
			return nil, err
		}
		if len(amounts) != len(path) || len(amounts) == 0 {
			return nil, fmt.Errorf("unexpected quoted amounts length")
		}
		if amounts[0] == nil || amounts[len(amounts)-1] == nil || amounts[len(amounts)-1].Sign() <= 0 {
			return nil, fmt.Errorf("quoted output is not positive")
		}

		return &executor.RoutePath{
			Tokens:    pathTokens,
			Hops:      uint32(len(pathTokens) - 2),
			AmountIn:  amounts[0].String(),
			AmountOut: amounts[len(amounts)-1].String(),
		}, nil
	case executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT:
		amounts, err := quoteClient.GetAmountsIn(ctx, amount, path)
		if err != nil {
			return nil, err
		}
		if len(amounts) != len(path) || len(amounts) == 0 {
			return nil, fmt.Errorf("unexpected reverse quoted amounts length")
		}
		if amounts[0] == nil || amounts[0].Sign() <= 0 || amounts[len(amounts)-1] == nil {
			return nil, fmt.Errorf("quoted input is not positive")
		}

		return &executor.RoutePath{
			Tokens:    pathTokens,
			Hops:      uint32(len(pathTokens) - 2),
			AmountIn:  amounts[0].String(),
			AmountOut: amounts[len(amounts)-1].String(),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported quote type")
	}
}

// applyGasAdjustedRanking enriches candidates with gas costs and sorts them by
// the gas-adjusted metric that matches the quote direction.
func applyGasAdjustedRanking(
	ctx context.Context,
	quoteClient svc.RouterQuoteClient,
	quoteType executor.RouteQuoteType,
	candidates []*executor.RoutePath,
) error {
	if len(candidates) == 0 {
		return nil
	}

	gasPrice, err := quoteClient.SuggestGasPrice(ctx)
	if err != nil {
		return err
	}
	if gasPrice == nil || gasPrice.Sign() <= 0 {
		return fmt.Errorf("gas price must be positive")
	}

	wethAddress := normalizeAddress(quoteClient.WETHAddress().Hex())
	if wethAddress == "" {
		return fmt.Errorf("weth address is not available")
	}

	for _, candidate := range candidates {
		if candidate == nil {
			continue
		}

		gasEstimate := estimateRouteGas(candidate)
		candidate.GasEstimate = gasEstimate

		gasCostInNative := new(big.Int).Mul(gasPrice, new(big.Int).SetUint64(gasEstimate))
		gasCostInInputToken, err := quoteGasCostInInputToken(ctx, quoteClient, gasCostInNative, candidate, wethAddress)
		if err != nil {
			return err
		}
		gasCostInOutputToken, err := quoteGasCostInOutputToken(ctx, quoteClient, gasCostInNative, candidate, wethAddress)
		if err != nil {
			return err
		}
		candidate.GasCostInInputToken = gasCostInInputToken.String()
		candidate.GasCostInOutputToken = gasCostInOutputToken.String()

		amountIn := mustBigInt(candidate.GetAmountIn())
		amountOut := mustBigInt(candidate.GetAmountOut())

		adjustedIn := new(big.Int).Add(amountIn, gasCostInInputToken)
		candidate.GasAdjustedAmountIn = adjustedIn.String()

		adjustedOut := new(big.Int).Sub(amountOut, gasCostInOutputToken)
		if adjustedOut.Sign() < 0 {
			adjustedOut = big.NewInt(0)
		}
		candidate.GasAdjustedAmountOut = adjustedOut.String()
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		switch quoteType {
		case executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT:
			leftAdjusted := mustBigInt(candidates[i].GetGasAdjustedAmountIn())
			rightAdjusted := mustBigInt(candidates[j].GetGasAdjustedAmountIn())
			if cmp := leftAdjusted.Cmp(rightAdjusted); cmp != 0 {
				return cmp < 0
			}

			leftIn := mustBigInt(candidates[i].GetAmountIn())
			rightIn := mustBigInt(candidates[j].GetAmountIn())
			if cmp := leftIn.Cmp(rightIn); cmp != 0 {
				return cmp < 0
			}

			return candidates[i].GetHops() < candidates[j].GetHops()
		default:
			leftAdjusted := mustBigInt(candidates[i].GetGasAdjustedAmountOut())
			rightAdjusted := mustBigInt(candidates[j].GetGasAdjustedAmountOut())
			if cmp := leftAdjusted.Cmp(rightAdjusted); cmp != 0 {
				return cmp > 0
			}

			leftOut := mustBigInt(candidates[i].GetAmountOut())
			rightOut := mustBigInt(candidates[j].GetAmountOut())
			if cmp := leftOut.Cmp(rightOut); cmp != 0 {
				return cmp > 0
			}

			return candidates[i].GetHops() < candidates[j].GetHops()
		}
	})

	return nil
}

// estimateRouteGas returns the simplified gas estimate used for ranking.
func estimateRouteGas(candidate *executor.RoutePath) uint64 {
	if candidate == nil {
		return baseRouteGasEstimate
	}
	return baseRouteGasEstimate + uint64(candidate.GetHops())*perHopRouteGasEstimate
}

// quoteGasCostInInputToken converts native-token gas cost into the input-token
// denomination.
func quoteGasCostInInputToken(
	ctx context.Context,
	quoteClient svc.RouterQuoteClient,
	gasCostInNative *big.Int,
	candidate *executor.RoutePath,
	wethAddress string,
) (*big.Int, error) {
	if gasCostInNative == nil || gasCostInNative.Sign() <= 0 {
		return nil, fmt.Errorf("gas cost in native token must be positive")
	}
	if candidate == nil || len(candidate.GetTokens()) < 2 {
		return nil, fmt.Errorf("candidate path must contain at least two tokens")
	}

	inputToken := normalizeAddress(candidate.GetTokens()[0])
	if inputToken == wethAddress {
		return new(big.Int).Set(gasCostInNative), nil
	}

	path := []common.Address{
		common.HexToAddress(inputToken),
		common.HexToAddress(wethAddress),
	}
	amountsIn, err := quoteClient.GetAmountsIn(ctx, gasCostInNative, path)
	if err != nil {
		return nil, err
	}
	if len(amountsIn) != len(path) || amountsIn[0] == nil {
		return nil, fmt.Errorf("unexpected input gas cost quote length")
	}

	return amountsIn[0], nil
}

// quoteGasCostInOutputToken converts native-token gas cost into the
// output-token denomination.
func quoteGasCostInOutputToken(
	ctx context.Context,
	quoteClient svc.RouterQuoteClient,
	gasCostInNative *big.Int,
	candidate *executor.RoutePath,
	wethAddress string,
) (*big.Int, error) {
	if gasCostInNative == nil || gasCostInNative.Sign() <= 0 {
		return nil, fmt.Errorf("gas cost in native token must be positive")
	}
	if candidate == nil || len(candidate.GetTokens()) < 2 {
		return nil, fmt.Errorf("candidate path must contain at least two tokens")
	}

	outputToken := normalizeAddress(candidate.GetTokens()[len(candidate.GetTokens())-1])
	if outputToken == wethAddress {
		return new(big.Int).Set(gasCostInNative), nil
	}

	path := []common.Address{
		common.HexToAddress(outputToken),
		common.HexToAddress(wethAddress),
	}
	amountsIn, err := quoteClient.GetAmountsIn(ctx, gasCostInNative, path)
	if err != nil {
		return nil, err
	}
	if len(amountsIn) != len(path) || amountsIn[0] == nil {
		return nil, fmt.Errorf("unexpected output gas cost quote length")
	}

	return amountsIn[0], nil
}

func containsAddress(items []string, target string) bool {
	for _, item := range items {
		if normalizeAddress(item) == target {
			return true
		}
	}
	return false
}

func dedupePaths(paths [][]string) [][]string {
	result := make([][]string, 0, len(paths))
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		key := strings.Join(path, "->")
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, path)
	}
	return result
}

// isNativeRouteToken treats only the zero address as native-token request
// semantics. The graph and execution layers store executable token addresses.
func isNativeRouteToken(token string) bool {
	return common.HexToAddress(normalizeAddress(token)) == (common.Address{})
}

// buildDisplayPath derives the user-facing route path from the executable path.
// Only the request-side start or end token is converted back from WETH to the
// native-token zero-address semantic when needed. Intermediate hops remain the
// real on-chain token addresses.
func buildDisplayPath(candidate *executor.RoutePath, requestTokens routeRequestTokens) []string {
	if candidate == nil {
		return nil
	}

	displayPath := append([]string(nil), candidate.GetTokens()...)
	if len(displayPath) == 0 {
		return displayPath
	}

	if requestTokens.nativeTokenIn && normalizeAddress(displayPath[0]) == requestTokens.executionTokenIn {
		displayPath[0] = requestTokens.requestedTokenIn
	}
	lastIndex := len(displayPath) - 1
	if requestTokens.nativeTokenOut && normalizeAddress(displayPath[lastIndex]) == requestTokens.executionTokenOut {
		displayPath[lastIndex] = requestTokens.requestedTokenOut
	}

	return displayPath
}

// buildRouteView assembles the route payload returned to the caller and keeps
// display path and execution path separated.
func buildRouteView(
	candidate *executor.RoutePath,
	requestTokens routeRequestTokens,
	quoteType executor.RouteQuoteType,
) *executor.RouteView {
	if candidate == nil {
		return nil
	}

	rankingMetric := candidate.GetGasAdjustedAmountOut()
	if quoteType == executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT {
		rankingMetric = candidate.GetGasAdjustedAmountIn()
	}

	return &executor.RouteView{
		PathTokens:           buildDisplayPath(candidate, requestTokens),
		ExecutionPath:        append([]string(nil), candidate.GetTokens()...),
		Hops:                 candidate.GetHops(),
		IsDirect:             candidate.GetHops() == 0,
		IsMultiHop:           candidate.GetHops() > 0,
		AmountIn:             candidate.GetAmountIn(),
		AmountOut:            candidate.GetAmountOut(),
		GasEstimate:          candidate.GetGasEstimate(),
		GasCostInInputToken:  candidate.GetGasCostInInputToken(),
		GasCostInOutputToken: candidate.GetGasCostInOutputToken(),
		GasAdjustedAmountIn:  candidate.GetGasAdjustedAmountIn(),
		GasAdjustedAmountOut: candidate.GetGasAdjustedAmountOut(),
		RankingMetric:        rankingMetric,
	}
}

// buildAlternativeRouteViews converts non-selected candidates into alternative
// route views.
func buildAlternativeRouteViews(
	candidates []*executor.RoutePath,
	requestTokens routeRequestTokens,
	quoteType executor.RouteQuoteType,
) []*executor.RouteView {
	if len(candidates) <= 1 {
		return nil
	}

	alternatives := make([]*executor.RouteView, 0, len(candidates)-1)
	for _, candidate := range candidates[1:] {
		alternatives = append(alternatives, buildRouteView(candidate, requestTokens, quoteType))
	}
	return alternatives
}

func buildExecution(candidate *executor.RoutePath) *executor.RouteExecution {
	if candidate == nil {
		return nil
	}
	return &executor.RouteExecution{
		RouterPath: append([]string(nil), candidate.GetTokens()...),
		IsMultiHop: candidate.GetHops() > 0,
		Strategy:   buildExecutionStrategy(candidate),
	}
}

// buildExecutionStrategy returns the execution strategy label for the selected
// route.
func buildExecutionStrategy(candidate *executor.RoutePath) string {
	if candidate == nil {
		return ""
	}
	if candidate.GetHops() == 0 {
		return "direct_swap"
	}
	return "multihop_swap"
}

// buildSelectionReason returns the concise reason label for why the route was
// selected.
func buildSelectionReason(candidate *executor.RoutePath, quoteType executor.RouteQuoteType) string {
	if candidate == nil {
		return ""
	}
	if quoteType == executor.RouteQuoteType_ROUTE_QUOTE_TYPE_EXACT_OUTPUT {
		if candidate.GetHops() == 0 {
			return "lowest_direct_input_after_gas"
		}
		return "lowest_multihop_input_after_gas"
	}
	if candidate.GetHops() == 0 {
		return "best_direct_after_gas"
	}
	return "best_multihop_after_gas"
}
