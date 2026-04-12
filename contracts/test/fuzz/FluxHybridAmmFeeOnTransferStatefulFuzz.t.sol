// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockFeeOnTransferERC20.sol";

contract FluxHybridAmmFeeOnTransferStatefulFuzzTest is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockFeeOnTransferERC20 private feeToken;
    MockERC20 private quoteToken;
    MockERC20 private baseToken;
    FluxSwapPair private feeQuotePair;
    FluxSwapPair private baseQuotePair;

    address private lpA;
    address private lpB;
    address private lpC;
    address private traderFeeA;
    address private traderFeeB;
    address private traderPlainA;
    address private traderPlainB;
    address private recipientQuoteA;
    address private recipientQuoteB;
    address private recipientBaseA;
    address private recipientBaseB;
    address private recipientFeeA;
    address private recipientFeeB;
    address private treasury;

    uint256 private expectedTreasuryFeeToken;
    uint256 private expectedTreasuryQuoteToken;
    uint256 private expectedTreasuryBaseToken;
    uint256 private expectedRecipientQuote;
    uint256 private expectedRecipientBase;
    uint256 private expectedRecipientFee;
    uint256 private expectedFeeQuoteLpA;
    uint256 private expectedFeeQuoteLpB;
    uint256 private expectedFeeQuoteLpC;
    uint256 private expectedBaseQuoteLpA;
    uint256 private expectedBaseQuoteLpB;
    uint256 private expectedBaseQuoteLpC;
    uint256 private expectedLpAFeeTokenBalance;
    uint256 private expectedLpAQuoteTokenBalance;
    uint256 private expectedLpABaseTokenBalance;
    uint256 private expectedLpBFeeTokenBalance;
    uint256 private expectedLpBQuoteTokenBalance;
    uint256 private expectedLpBBaseTokenBalance;
    uint256 private expectedLpCFeeTokenBalance;
    uint256 private expectedLpCQuoteTokenBalance;
    uint256 private expectedLpCBaseTokenBalance;
    uint256[3] private initialLpFeeTokenBalances;
    uint256[3] private initialLpQuoteTokenBalances;
    uint256[3] private initialLpBaseTokenBalances;
    uint256[3] private feeQuoteModeledFeeTokenBalances;
    uint256[3] private feeQuoteModeledQuoteTokenBalances;
    uint256[3] private baseQuoteModeledQuoteTokenBalances;
    uint256[3] private baseQuoteModeledBaseTokenBalances;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        lpC = makeAddr("lpC");
        traderFeeA = makeAddr("traderFeeA");
        traderFeeB = makeAddr("traderFeeB");
        traderPlainA = makeAddr("traderPlainA");
        traderPlainB = makeAddr("traderPlainB");
        recipientQuoteA = makeAddr("recipientQuoteA");
        recipientQuoteB = makeAddr("recipientQuoteB");
        recipientBaseA = makeAddr("recipientBaseA");
        recipientBaseB = makeAddr("recipientBaseB");
        recipientFeeA = makeAddr("recipientFeeA");
        recipientFeeB = makeAddr("recipientFeeB");
        treasury = makeAddr("treasury");

        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), makeAddr("unusedWeth"));

        feeToken = new MockFeeOnTransferERC20("Hybrid Fee Token", "HFEE", 18, 300);
        quoteToken = new MockERC20("Hybrid Quote Token", "HQUOTE", 18);
        baseToken = new MockERC20("Hybrid Base Token", "HBASE", 18);

        factory.createPair(address(feeToken), address(quoteToken));
        feeQuotePair = FluxSwapPair(factory.getPair(address(feeToken), address(quoteToken)));
        factory.createPair(address(baseToken), address(quoteToken));
        baseQuotePair = FluxSwapPair(factory.getPair(address(baseToken), address(quoteToken)));

        _seedGenericPair(feeToken, quoteToken, 5e18, 9e18, lpA);
        _seedGenericPair(feeToken, quoteToken, 3e18, 5e18, lpB);
        _seedGenericPair(feeToken, quoteToken, 2e18, 4e18, lpC);
        _seedGenericPair(baseToken, quoteToken, 7e18, 11e18, lpA);
        _seedGenericPair(baseToken, quoteToken, 4e18, 6e18, lpB);
        _seedGenericPair(baseToken, quoteToken, 2e18, 3e18, lpC);

        expectedFeeQuoteLpA = feeQuotePair.balanceOf(lpA);
        expectedFeeQuoteLpB = feeQuotePair.balanceOf(lpB);
        expectedFeeQuoteLpC = feeQuotePair.balanceOf(lpC);
        expectedBaseQuoteLpA = baseQuotePair.balanceOf(lpA);
        expectedBaseQuoteLpB = baseQuotePair.balanceOf(lpB);
        expectedBaseQuoteLpC = baseQuotePair.balanceOf(lpC);

        _syncLpUnderlyingSnapshots(lpA);
        _syncLpUnderlyingSnapshots(lpB);
        _syncLpUnderlyingSnapshots(lpC);
        _recordInitialLpUnderlyingBalances();
    }

    // 这组 stateful fuzz 把“普通 AMM + fee-on-transfer + 多轮加减仓 + 多跳换路”压进有限长序列里，
    // 每一步都校验协议费、净到账、储备同步、LP 份额、底层余额和跨 Pair 资金隔离。
    function testFuzz_hybridSequence_preservesAccountingAcrossInterleavedLiquidityAndSwaps(
        uint8[8] memory actionSeeds,
        uint8[8] memory actorSeeds,
        uint96[8] memory amountOneSeeds,
        uint96[8] memory amountTwoSeeds,
        uint16[8] memory shareBpsSeeds
    ) public {
        for (uint256 i = 0; i < actionSeeds.length; i++) {
            _executeHybridStep(actionSeeds[i], actorSeeds[i], amountOneSeeds[i], amountTwoSeeds[i], shareBpsSeeds[i]);
            _assertHybridState();
        }
    }

    // 这组 fuzz 专门把高频 liquidity churn 和 amountOutMin 边界揉在一起，
    // 确认多轮 add/remove 后，base -> quote -> fee 仍然只能按最终净到账放行。
    function testFuzz_hybridBoundaryAfterLiquidityChurn_keepsNetOutputAndIsolation(
        uint8[6] memory actorSeeds,
        uint96[6] memory amountOneSeeds,
        uint96[6] memory amountTwoSeeds,
        uint16[4] memory shareBpsSeeds
    ) public {
        _addLiquidityFeeQuote(actorSeeds[0], amountOneSeeds[0], amountTwoSeeds[0]);
        _assertHybridState();

        _addLiquidityBaseQuote(actorSeeds[1], amountOneSeeds[1], amountTwoSeeds[1]);
        _assertHybridState();

        _removeLiquidityFeeQuote(actorSeeds[2], shareBpsSeeds[0]);
        _assertHybridState();

        _addLiquidityFeeQuote(actorSeeds[3], amountOneSeeds[2], amountTwoSeeds[2]);
        _assertHybridState();

        _removeLiquidityBaseQuote(actorSeeds[4], shareBpsSeeds[1]);
        _assertHybridState();

        _swapFeeToBaseMultiHop(actorSeeds[5], amountOneSeeds[3]);
        _assertHybridState();

        _swapBaseToFeeMultiHopAmountOutBoundary(actorSeeds[0], amountOneSeeds[4]);
        _assertHybridState();

        _removeLiquidityFeeQuote(actorSeeds[1], shareBpsSeeds[2]);
        _assertHybridState();

        _removeLiquidityBaseQuote(actorSeeds[2], shareBpsSeeds[3]);
        _assertHybridState();

        _swapQuoteToFee(actorSeeds[3], amountTwoSeeds[5]);
        _assertHybridState();
    }

    function _executeHybridStep(
        uint8 actionSeed,
        uint8 actorSeed,
        uint96 amountOneSeed,
        uint96 amountTwoSeed,
        uint16 shareBpsSeed
    ) private {
        uint8 action = actionSeed % 8;
        if (action == 0) {
            _addLiquidityFeeQuote(actorSeed, amountOneSeed, amountTwoSeed);
            return;
        }
        if (action == 1) {
            _addLiquidityBaseQuote(actorSeed, amountOneSeed, amountTwoSeed);
            return;
        }
        if (action == 2) {
            _removeLiquidityFeeQuote(actorSeed, shareBpsSeed);
            return;
        }
        if (action == 3) {
            _removeLiquidityBaseQuote(actorSeed, shareBpsSeed);
            return;
        }
        if (action == 4) {
            _swapFeeToQuote(actorSeed, amountOneSeed);
            return;
        }
        if (action == 5) {
            _swapQuoteToFee(actorSeed, amountOneSeed);
            return;
        }
        if (action == 6) {
            _swapFeeToBaseMultiHop(actorSeed, amountOneSeed);
            return;
        }
        _swapBaseToFeeMultiHopAmountOutBoundary(actorSeed, amountOneSeed);
    }

    function _addLiquidityFeeQuote(uint8 actorSeed, uint256 rawFeeAmount, uint256 rawQuoteAmount) private {
        (uint256 feeReserve, uint256 quoteReserve) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);

        uint256 amountFee = bound(rawFeeAmount, 2_000, (feeReserve / 10) + 2_000);
        uint256 amountQuote = bound(rawQuoteAmount, 2_000, (quoteReserve / 10) + 2_000);
        address actor = _selectLp(actorSeed);
        (uint256 expectedUsedFee, uint256 expectedUsedQuote) =
            _computeExistingPairAddAmounts(amountFee, amountQuote, feeReserve, quoteReserve);
        uint256 expectedNetFee = _applyTransferFee(expectedUsedFee);
        if (_estimateLiquidityMinted(expectedNetFee, expectedUsedQuote, feeReserve, quoteReserve, feeQuotePair.totalSupply()) == 0)
        {
            return;
        }
        uint256 usedFee;
        uint256 usedQuote;
        uint256 liquidity;

        feeToken.mint(actor, amountFee);
        quoteToken.mint(actor, amountQuote);

        vm.startPrank(actor);
        feeToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        (usedFee, usedQuote, liquidity) =
            router.addLiquidity(address(feeToken), address(quoteToken), amountFee, amountQuote, 0, 0, actor, _deadline());
        vm.stopPrank();

        _increaseLpExpectation(actor, true, liquidity);
        _increaseLpUnderlyingExpectation(actor, amountFee - usedFee, amountQuote - usedQuote, 0);
        _increaseFeeQuotePairUnderlyingExpectation(actor, amountFee - usedFee, amountQuote - usedQuote);
    }

    function _addLiquidityBaseQuote(uint8 actorSeed, uint256 rawBaseAmount, uint256 rawQuoteAmount) private {
        (uint256 baseReserve, uint256 quoteReserve) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);

        uint256 amountBase = bound(rawBaseAmount, 1, (baseReserve / 10) + 1);
        uint256 amountQuote = bound(rawQuoteAmount, 1, (quoteReserve / 10) + 1);
        address actor = _selectLp(actorSeed);
        (uint256 expectedUsedBase, uint256 expectedUsedQuote) =
            _computeExistingPairAddAmounts(amountBase, amountQuote, baseReserve, quoteReserve);
        if (_estimateLiquidityMinted(expectedUsedBase, expectedUsedQuote, baseReserve, quoteReserve, baseQuotePair.totalSupply()) == 0)
        {
            return;
        }
        uint256 usedBase;
        uint256 usedQuote;
        uint256 liquidity;

        baseToken.mint(actor, amountBase);
        quoteToken.mint(actor, amountQuote);

        vm.startPrank(actor);
        baseToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        (usedBase, usedQuote, liquidity) =
            router.addLiquidity(address(baseToken), address(quoteToken), amountBase, amountQuote, 0, 0, actor, _deadline());
        vm.stopPrank();

        _increaseLpExpectation(actor, false, liquidity);
        _increaseLpUnderlyingExpectation(actor, 0, amountQuote - usedQuote, amountBase - usedBase);
        _increaseBaseQuotePairUnderlyingExpectation(actor, amountQuote - usedQuote, amountBase - usedBase);
    }

    function _removeLiquidityFeeQuote(uint8 actorSeed, uint16 rawShareBps) private {
        _removeLiquidity(feeQuotePair, address(feeToken), address(quoteToken), _selectLp(actorSeed), rawShareBps);
    }

    function _removeLiquidityBaseQuote(uint8 actorSeed, uint16 rawShareBps) private {
        _removeLiquidity(baseQuotePair, address(baseToken), address(quoteToken), _selectLp(actorSeed), rawShareBps);
    }

    function _swapFeeToQuote(uint8 actorSeed, uint256 rawAmountIn) private {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn);
        if (netInput == 0) {
            return;
        }

        uint256 amountOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        if (amountOut == 0) {
            return;
        }

        address trader = _selectFeeTrader(actorSeed);
        address recipient = _selectQuoteRecipient(actorSeed);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(feeToken), address(quoteToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / BPS_BASE);
        expectedRecipientQuote += amountOut;
    }

    function _swapQuoteToFee(uint8 actorSeed, uint256 rawAmountIn) private {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(quoteToken), address(feeToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 grossAmountOut = router.getAmountOut(amountIn, reserveInput, reserveOutput);
        uint256 netRecipientOut = _applyTransferFee(grossAmountOut);
        if (grossAmountOut == 0 || netRecipientOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        quoteToken.mint(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryQuoteToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += netRecipientOut;
    }

    function _swapFeeToBaseMultiHop(uint8 actorSeed, uint256 rawAmountIn) private {
        (uint256 feeReserveIn, uint256 quoteReserveOut) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        (uint256 quoteReserveIn, uint256 baseReserveOut) =
            _reservesFor(address(quoteToken), address(baseToken), baseQuotePair);

        uint256 amountIn = bound(rawAmountIn, 2_000, (feeReserveIn / 20) + 2_000);
        uint256 netFirstHopInput = _applyTransferFee(amountIn);
        if (netFirstHopInput == 0) {
            return;
        }

        uint256 firstHopQuoteOut = router.getAmountOut(netFirstHopInput, feeReserveIn, quoteReserveOut);
        if (firstHopQuoteOut == 0) {
            return;
        }

        uint256 finalBaseOut = router.getAmountOut(firstHopQuoteOut, quoteReserveIn, baseReserveOut);
        if (finalBaseOut == 0) {
            return;
        }

        address trader = _selectFeeTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _threeHopPath(address(feeToken), address(quoteToken), address(baseToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netFirstHopInput * PROTOCOL_FEE_BPS) / BPS_BASE);
        expectedTreasuryQuoteToken += (firstHopQuoteOut * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientBase += finalBaseOut;
    }

    function _swapBaseToFeeMultiHopAmountOutBoundary(uint8 actorSeed, uint256 rawAmountIn) private {
        (uint256 baseReserveIn, uint256 quoteReserveOut) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);
        (uint256 quoteReserveIn, uint256 feeReserveOut) =
            _reservesFor(address(quoteToken), address(feeToken), feeQuotePair);

        uint256 amountIn = bound(rawAmountIn, 2_000, (baseReserveIn / 20) + 2_000);
        uint256 firstHopQuoteOut = router.getAmountOut(amountIn, baseReserveIn, quoteReserveOut);
        if (firstHopQuoteOut == 0) {
            return;
        }

        uint256 secondHopGrossFeeOut = router.getAmountOut(firstHopQuoteOut, quoteReserveIn, feeReserveOut);
        uint256 finalNetFeeOut = _applyTransferFee(secondHopGrossFeeOut);
        if (secondHopGrossFeeOut == 0 || finalNetFeeOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        baseToken.mint(trader, amountIn);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            finalNetFeeOut + 1,
            _threeHopPath(address(baseToken), address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            finalNetFeeOut,
            _threeHopPath(address(baseToken), address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryBaseToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedTreasuryQuoteToken += (firstHopQuoteOut * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += finalNetFeeOut;
    }

    function _removeLiquidity(FluxSwapPair pair, address tokenA, address tokenB, address actor, uint16 rawShareBps)
        private
    {
        uint256 lpBalance = pair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }
        if (!_hasNonZeroBurnOutputs(pair, liquidityToRemove)) {
            return;
        }

        vm.prank(actor);
        pair.approve(address(router), type(uint256).max);

        uint256 amountA;
        uint256 amountB;
        vm.prank(actor);
        (amountA, amountB) = router.removeLiquidity(tokenA, tokenB, liquidityToRemove, 0, 0, actor, _deadline());

        if (address(pair) == address(feeQuotePair)) {
            _decreaseLpExpectation(actor, true, liquidityToRemove);
            _increaseLpUnderlyingExpectation(actor, _applyTransferFee(amountA), amountB, 0);
            _increaseFeeQuotePairUnderlyingExpectation(actor, _applyTransferFee(amountA), amountB);
            return;
        }

        _decreaseLpExpectation(actor, false, liquidityToRemove);
        _increaseLpUnderlyingExpectation(actor, 0, amountB, amountA);
        _increaseBaseQuotePairUnderlyingExpectation(actor, amountB, amountA);
    }

    function _assertHybridState() private view {
        _assertPairReservesMatchBalances(feeQuotePair);
        _assertPairReservesMatchBalances(baseQuotePair);

        assertEq(feeToken.balanceOf(treasury), expectedTreasuryFeeToken);
        assertEq(quoteToken.balanceOf(treasury), expectedTreasuryQuoteToken);
        assertEq(baseToken.balanceOf(treasury), expectedTreasuryBaseToken);

        assertEq(_recipientQuoteBalanceSum(), expectedRecipientQuote);
        assertEq(_recipientBaseBalanceSum(), expectedRecipientBase);
        assertEq(_recipientFeeBalanceSum(), expectedRecipientFee);

        assertEq(feeToken.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
        assertEq(baseToken.balanceOf(address(router)), 0);
        assertEq(feeQuotePair.balanceOf(address(router)), 0);
        assertEq(baseQuotePair.balanceOf(address(router)), 0);

        assertEq(feeToken.totalSupply(), _trackedTokenSum(feeToken));
        assertEq(quoteToken.totalSupply(), _trackedTokenSum(quoteToken));
        assertEq(baseToken.totalSupply(), _trackedTokenSum(baseToken));

        assertEq(feeQuotePair.totalSupply(), _trackedFeeQuoteLpSupply());
        assertEq(baseQuotePair.totalSupply(), _trackedBaseQuoteLpSupply());

        assertEq(feeQuotePair.balanceOf(lpA), expectedFeeQuoteLpA);
        assertEq(feeQuotePair.balanceOf(lpB), expectedFeeQuoteLpB);
        assertEq(feeQuotePair.balanceOf(lpC), expectedFeeQuoteLpC);
        assertEq(baseQuotePair.balanceOf(lpA), expectedBaseQuoteLpA);
        assertEq(baseQuotePair.balanceOf(lpB), expectedBaseQuoteLpB);
        assertEq(baseQuotePair.balanceOf(lpC), expectedBaseQuoteLpC);

        assertEq(feeToken.balanceOf(lpA), expectedLpAFeeTokenBalance);
        assertEq(quoteToken.balanceOf(lpA), expectedLpAQuoteTokenBalance);
        assertEq(baseToken.balanceOf(lpA), expectedLpABaseTokenBalance);
        assertEq(feeToken.balanceOf(lpB), expectedLpBFeeTokenBalance);
        assertEq(quoteToken.balanceOf(lpB), expectedLpBQuoteTokenBalance);
        assertEq(baseToken.balanceOf(lpB), expectedLpBBaseTokenBalance);
        assertEq(feeToken.balanceOf(lpC), expectedLpCFeeTokenBalance);
        assertEq(quoteToken.balanceOf(lpC), expectedLpCQuoteTokenBalance);
        assertEq(baseToken.balanceOf(lpC), expectedLpCBaseTokenBalance);

        assertTrue(_pairIsolatedUnderlyingExpectationsMatch());
    }

    function _pairIsolatedUnderlyingExpectationsMatch() private view returns (bool) {
        for (uint256 i = 0; i < 3; i++) {
            address actor = _lpByIndex(i);
            if (feeToken.balanceOf(actor) != initialLpFeeTokenBalances[i] + feeQuoteModeledFeeTokenBalances[i]) {
                return false;
            }
            if (baseToken.balanceOf(actor) != initialLpBaseTokenBalances[i] + baseQuoteModeledBaseTokenBalances[i]) {
                return false;
            }
            if (
                quoteToken.balanceOf(actor)
                    != initialLpQuoteTokenBalances[i] + feeQuoteModeledQuoteTokenBalances[i]
                        + baseQuoteModeledQuoteTokenBalances[i]
            ) {
                return false;
            }
        }

        return true;
    }

    function _recordInitialLpUnderlyingBalances() private {
        initialLpFeeTokenBalances[0] = feeToken.balanceOf(lpA);
        initialLpQuoteTokenBalances[0] = quoteToken.balanceOf(lpA);
        initialLpBaseTokenBalances[0] = baseToken.balanceOf(lpA);

        initialLpFeeTokenBalances[1] = feeToken.balanceOf(lpB);
        initialLpQuoteTokenBalances[1] = quoteToken.balanceOf(lpB);
        initialLpBaseTokenBalances[1] = baseToken.balanceOf(lpB);

        initialLpFeeTokenBalances[2] = feeToken.balanceOf(lpC);
        initialLpQuoteTokenBalances[2] = quoteToken.balanceOf(lpC);
        initialLpBaseTokenBalances[2] = baseToken.balanceOf(lpC);
    }

    function _increaseLpExpectation(address actor, bool isFeeQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        if (isFeeQuotePair) {
            if (actor == lpA) {
                expectedFeeQuoteLpA += liquidityDelta;
                return;
            }
            if (actor == lpB) {
                expectedFeeQuoteLpB += liquidityDelta;
                return;
            }
            expectedFeeQuoteLpC += liquidityDelta;
            return;
        }

        if (actor == lpA) {
            expectedBaseQuoteLpA += liquidityDelta;
            return;
        }
        if (actor == lpB) {
            expectedBaseQuoteLpB += liquidityDelta;
            return;
        }
        expectedBaseQuoteLpC += liquidityDelta;
    }

    function _decreaseLpExpectation(address actor, bool isFeeQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        if (isFeeQuotePair) {
            if (actor == lpA) {
                expectedFeeQuoteLpA -= liquidityDelta;
                return;
            }
            if (actor == lpB) {
                expectedFeeQuoteLpB -= liquidityDelta;
                return;
            }
            expectedFeeQuoteLpC -= liquidityDelta;
            return;
        }

        if (actor == lpA) {
            expectedBaseQuoteLpA -= liquidityDelta;
            return;
        }
        if (actor == lpB) {
            expectedBaseQuoteLpB -= liquidityDelta;
            return;
        }
        expectedBaseQuoteLpC -= liquidityDelta;
    }

    function _increaseLpUnderlyingExpectation(address actor, uint256 feeDelta, uint256 quoteDelta, uint256 baseDelta)
        private
    {
        if (actor == lpA) {
            expectedLpAFeeTokenBalance += feeDelta;
            expectedLpAQuoteTokenBalance += quoteDelta;
            expectedLpABaseTokenBalance += baseDelta;
            return;
        }
        if (actor == lpB) {
            expectedLpBFeeTokenBalance += feeDelta;
            expectedLpBQuoteTokenBalance += quoteDelta;
            expectedLpBBaseTokenBalance += baseDelta;
            return;
        }

        expectedLpCFeeTokenBalance += feeDelta;
        expectedLpCQuoteTokenBalance += quoteDelta;
        expectedLpCBaseTokenBalance += baseDelta;
    }

    function _increaseFeeQuotePairUnderlyingExpectation(address actor, uint256 feeDelta, uint256 quoteDelta) private {
        uint256 actorIndex = _lpIndex(actor);
        feeQuoteModeledFeeTokenBalances[actorIndex] += feeDelta;
        feeQuoteModeledQuoteTokenBalances[actorIndex] += quoteDelta;
    }

    function _increaseBaseQuotePairUnderlyingExpectation(address actor, uint256 quoteDelta, uint256 baseDelta) private {
        uint256 actorIndex = _lpIndex(actor);
        baseQuoteModeledQuoteTokenBalances[actorIndex] += quoteDelta;
        baseQuoteModeledBaseTokenBalances[actorIndex] += baseDelta;
    }

    function _syncLpUnderlyingSnapshots(address actor) private {
        if (actor == lpA) {
            expectedLpAFeeTokenBalance = feeToken.balanceOf(actor);
            expectedLpAQuoteTokenBalance = quoteToken.balanceOf(actor);
            expectedLpABaseTokenBalance = baseToken.balanceOf(actor);
            return;
        }
        if (actor == lpB) {
            expectedLpBFeeTokenBalance = feeToken.balanceOf(actor);
            expectedLpBQuoteTokenBalance = quoteToken.balanceOf(actor);
            expectedLpBBaseTokenBalance = baseToken.balanceOf(actor);
            return;
        }

        expectedLpCFeeTokenBalance = feeToken.balanceOf(actor);
        expectedLpCQuoteTokenBalance = quoteToken.balanceOf(actor);
        expectedLpCBaseTokenBalance = baseToken.balanceOf(actor);
    }

    function _seedGenericPair(MockERC20 tokenA, MockERC20 tokenB, uint256 amountA, uint256 amountB, address lpAddr)
        private
    {
        address pairAddress = factory.getPair(address(tokenA), address(tokenB));

        tokenA.mint(lpAddr, amountA);
        tokenB.mint(lpAddr, amountB);

        vm.startPrank(lpAddr);
        tokenA.transfer(pairAddress, amountA);
        tokenB.transfer(pairAddress, amountB);
        FluxSwapPair(pairAddress).mint(lpAddr);
        vm.stopPrank();
    }

    function _assertPairReservesMatchBalances(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, _assetBalance(pair.token0(), address(pair)));
        assertEq(reserve1, _assetBalance(pair.token1(), address(pair)));
    }

    function _trackedTokenSum(MockERC20 token) private view returns (uint256) {
        return _trackedTokenUserSum(token) + _trackedTokenRecipientSum(token) + _trackedTokenSystemSum(token);
    }

    function _trackedTokenUserSum(MockERC20 token) private view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(lpC)
            + token.balanceOf(traderFeeA)
            + token.balanceOf(traderFeeB)
            + token.balanceOf(traderPlainA)
            + token.balanceOf(traderPlainB);
    }

    function _trackedTokenRecipientSum(MockERC20 token) private view returns (uint256) {
        return token.balanceOf(recipientQuoteA)
            + token.balanceOf(recipientQuoteB)
            + token.balanceOf(recipientBaseA)
            + token.balanceOf(recipientBaseB)
            + token.balanceOf(recipientFeeA)
            + token.balanceOf(recipientFeeB);
    }

    function _trackedTokenSystemSum(MockERC20 token) private view returns (uint256) {
        return token.balanceOf(address(feeQuotePair))
            + token.balanceOf(address(baseQuotePair))
            + token.balanceOf(treasury)
            + token.balanceOf(address(router));
    }

    function _trackedFeeQuoteLpSupply() private view returns (uint256) {
        return feeQuotePair.balanceOf(lpA) + feeQuotePair.balanceOf(lpB) + feeQuotePair.balanceOf(lpC)
            + feeQuotePair.balanceOf(address(0)) + feeQuotePair.balanceOf(address(router));
    }

    function _trackedBaseQuoteLpSupply() private view returns (uint256) {
        return baseQuotePair.balanceOf(lpA) + baseQuotePair.balanceOf(lpB) + baseQuotePair.balanceOf(lpC)
            + baseQuotePair.balanceOf(address(0)) + baseQuotePair.balanceOf(address(router));
    }

    function _recipientQuoteBalanceSum() private view returns (uint256) {
        return quoteToken.balanceOf(recipientQuoteA) + quoteToken.balanceOf(recipientQuoteB);
    }

    function _recipientBaseBalanceSum() private view returns (uint256) {
        return baseToken.balanceOf(recipientBaseA) + baseToken.balanceOf(recipientBaseB);
    }

    function _recipientFeeBalanceSum() private view returns (uint256) {
        return feeToken.balanceOf(recipientFeeA) + feeToken.balanceOf(recipientFeeB);
    }

    function _selectLp(uint8 actorSeed) private view returns (address) {
        uint8 slot = actorSeed % 3;
        if (slot == 0) {
            return lpA;
        }
        if (slot == 1) {
            return lpB;
        }
        return lpC;
    }

    function _selectFeeTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderFeeA : traderFeeB;
    }

    function _selectPlainTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderPlainA : traderPlainB;
    }

    function _selectQuoteRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientQuoteA : recipientQuoteB;
    }

    function _selectBaseRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientBaseA : recipientBaseB;
    }

    function _selectFeeRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientFeeA : recipientFeeB;
    }

    function _applyTransferFee(uint256 amount) private view returns (uint256) {
        return amount - ((amount * feeToken.feeBps()) / BPS_BASE);
    }

    function _lpIndex(address actor) private view returns (uint256) {
        if (actor == lpA) {
            return 0;
        }
        if (actor == lpB) {
            return 1;
        }
        require(actor == lpC, "UNKNOWN_LP");
        return 2;
    }

    function _lpByIndex(uint256 index) private view returns (address) {
        if (index == 0) {
            return lpA;
        }
        if (index == 1) {
            return lpB;
        }
        require(index == 2, "INVALID_LP_INDEX");
        return lpC;
    }

    function _twoHopPath(address tokenIn, address tokenOut) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
    }

    function _threeHopPath(address tokenIn, address tokenMid, address tokenOut)
        private
        pure
        returns (address[] memory path)
    {
        path = new address[](3);
        path[0] = tokenIn;
        path[1] = tokenMid;
        path[2] = tokenOut;
    }

    function _reservesFor(address input, address output, FluxSwapPair pair)
        private
        view
        returns (uint256 reserveInput, uint256 reserveOutput)
    {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        if (pair.token0() == input) {
            reserveInput = reserve0;
            reserveOutput = reserve1;
            return (reserveInput, reserveOutput);
        }

        require(pair.token1() == input, "INVALID_INPUT");
        require(pair.token0() == output || pair.token1() == output, "INVALID_OUTPUT");
        reserveInput = reserve1;
        reserveOutput = reserve0;
    }

    function _computeExistingPairAddAmounts(
        uint256 desiredAmountA,
        uint256 desiredAmountB,
        uint256 reserveA,
        uint256 reserveB
    ) private pure returns (uint256 usedAmountA, uint256 usedAmountB) {
        uint256 amountBOptimal = (desiredAmountA * reserveB) / reserveA;
        if (amountBOptimal <= desiredAmountB) {
            return (desiredAmountA, amountBOptimal);
        }

        uint256 amountAOptimal = (desiredAmountB * reserveA) / reserveB;
        return (amountAOptimal, desiredAmountB);
    }

    function _estimateLiquidityMinted(
        uint256 usedAmountA,
        uint256 usedAmountB,
        uint256 reserveA,
        uint256 reserveB,
        uint256 totalSupply
    ) private pure returns (uint256) {
        uint256 liquidityFromA = (usedAmountA * totalSupply) / reserveA;
        uint256 liquidityFromB = (usedAmountB * totalSupply) / reserveB;
        return liquidityFromA < liquidityFromB ? liquidityFromA : liquidityFromB;
    }

    function _hasNonZeroBurnOutputs(FluxSwapPair pair, uint256 liquidityToRemove) private view returns (bool) {
        uint256 totalSupply = pair.totalSupply();
        if (totalSupply == 0) {
            return false;
        }

        uint256 amount0 = (liquidityToRemove * _assetBalance(pair.token0(), address(pair))) / totalSupply;
        uint256 amount1 = (liquidityToRemove * _assetBalance(pair.token1(), address(pair))) / totalSupply;
        return amount0 > 0 && amount1 > 0;
    }

    function _assetBalance(address asset, address owner) private view returns (uint256) {
        if (asset == address(feeToken)) {
            return feeToken.balanceOf(owner);
        }
        if (asset == address(quoteToken)) {
            return quoteToken.balanceOf(owner);
        }
        return baseToken.balanceOf(owner);
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
