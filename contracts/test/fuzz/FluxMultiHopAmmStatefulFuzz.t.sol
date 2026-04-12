// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxMultiHopAmmStatefulFuzzTest is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockERC20 private baseToken;
    MockERC20 private quoteToken;
    MockERC20 private outToken;
    FluxSwapPair private baseQuotePair;
    FluxSwapPair private quoteOutPair;

    address private lpA;
    address private lpB;
    address private lpC;
    address private traderBaseA;
    address private traderBaseB;
    address private traderQuoteA;
    address private traderQuoteB;
    address private traderOutA;
    address private traderOutB;
    address private recipientQuoteA;
    address private recipientQuoteB;
    address private recipientBaseA;
    address private recipientBaseB;
    address private recipientOutA;
    address private recipientOutB;
    address private treasury;

    uint256 private totalMintedBase;
    uint256 private totalMintedQuote;
    uint256 private totalMintedOut;

    uint256 private expectedTreasuryBase;
    uint256 private expectedTreasuryQuote;
    uint256 private expectedTreasuryOut;
    uint256 private expectedRecipientQuote;
    uint256 private expectedRecipientBase;
    uint256 private expectedRecipientOut;

    uint256[3] private expectedBaseQuoteLp;
    uint256[3] private expectedQuoteOutLp;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        lpC = makeAddr("lpC");
        traderBaseA = makeAddr("traderBaseA");
        traderBaseB = makeAddr("traderBaseB");
        traderQuoteA = makeAddr("traderQuoteA");
        traderQuoteB = makeAddr("traderQuoteB");
        traderOutA = makeAddr("traderOutA");
        traderOutB = makeAddr("traderOutB");
        recipientQuoteA = makeAddr("recipientQuoteA");
        recipientQuoteB = makeAddr("recipientQuoteB");
        recipientBaseA = makeAddr("recipientBaseA");
        recipientBaseB = makeAddr("recipientBaseB");
        recipientOutA = makeAddr("recipientOutA");
        recipientOutB = makeAddr("recipientOutB");
        treasury = makeAddr("treasury");

        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), makeAddr("unusedWeth"));

        baseToken = new MockERC20("Stateful Base Token", "SBASE", 18);
        quoteToken = new MockERC20("Stateful Quote Token", "SQUOTE", 18);
        outToken = new MockERC20("Stateful Out Token", "SOUT", 18);

        factory.createPair(address(baseToken), address(quoteToken));
        baseQuotePair = FluxSwapPair(factory.getPair(address(baseToken), address(quoteToken)));
        factory.createPair(address(quoteToken), address(outToken));
        quoteOutPair = FluxSwapPair(factory.getPair(address(quoteToken), address(outToken)));

        _seedBaseQuotePair(8e18, 12e18, lpA);
        _seedBaseQuotePair(4e18, 6e18, lpB);
        _seedBaseQuotePair(2e18, 3e18, lpC);

        _seedQuoteOutPair(12e18, 20e18, lpA);
        _seedQuoteOutPair(6e18, 10e18, lpB);
        _seedQuoteOutPair(3e18, 5e18, lpC);

        expectedBaseQuoteLp[0] = baseQuotePair.balanceOf(lpA);
        expectedBaseQuoteLp[1] = baseQuotePair.balanceOf(lpB);
        expectedBaseQuoteLp[2] = baseQuotePair.balanceOf(lpC);

        expectedQuoteOutLp[0] = quoteOutPair.balanceOf(lpA);
        expectedQuoteOutLp[1] = quoteOutPair.balanceOf(lpB);
        expectedQuoteOutLp[2] = quoteOutPair.balanceOf(lpC);
    }

    // 这组 stateful fuzz 把“纯 AMM 双 Pair 多跳”单独拉出来：
    // 在不掺 fee-on-transfer 的前提下，把连续 add/remove 与单跳、双跳 swap 交错起来，
    // 专门核对 treasury 协议费、recipient 到账、LP 份额、储备同步与三资产总账守恒。
    function testFuzz_multiHopSequence_preservesAccountingAcrossInterleavedChurnAndSwaps(
        uint8[10] memory actionSeeds,
        uint8[10] memory actorSeeds,
        uint96[10] memory amountOneSeeds,
        uint96[10] memory amountTwoSeeds,
        uint16[10] memory shareBpsSeeds
    ) public {
        for (uint256 i = 0; i < actionSeeds.length; i++) {
            _executeStep(actionSeeds[i], actorSeeds[i], amountOneSeeds[i], amountTwoSeeds[i], shareBpsSeeds[i]);
            _assertState();
        }
    }

    // 这组 fuzz 专门把高频 liquidity churn 和普通 AMM 多跳 amountOutMin 边界揉在一起，
    // 确认 quote 作为桥接资产时，连续换路后仍然只能按最终精确 quote 放行。
    function testFuzz_multiHopBoundaryAfterRepeatedChurn_keepsExactAmountOutMin(
        uint8[8] memory actorSeeds,
        uint96[9] memory amountSeeds,
        uint16[4] memory shareBpsSeeds
    ) public {
        _addBaseQuote(actorSeeds[0], amountSeeds[0], amountSeeds[1]);
        _assertState();

        _addQuoteOut(actorSeeds[1], amountSeeds[2], amountSeeds[3]);
        _assertState();

        _removeBaseQuote(actorSeeds[2], shareBpsSeeds[0]);
        _assertState();

        _swapBaseToOutMultiHop(actorSeeds[3], amountSeeds[4]);
        _assertState();

        _removeQuoteOut(actorSeeds[4], shareBpsSeeds[1]);
        _assertState();

        _addBaseQuote(actorSeeds[5], amountSeeds[5], amountSeeds[6]);
        _assertState();

        _addQuoteOut(actorSeeds[6], amountSeeds[7], amountSeeds[8]);
        _assertState();

        _swapOutToBaseMultiHopAmountOutBoundary(actorSeeds[7], amountSeeds[0]);
        _assertState();

        _removeBaseQuote(actorSeeds[0], shareBpsSeeds[2]);
        _assertState();

        _removeQuoteOut(actorSeeds[1], shareBpsSeeds[3]);
        _assertState();
    }

    // 这组 fuzz 把 churn 后的多跳 exact-output 边界单独拉出来：
    // 先穿插 add/remove 和 exact-input，随后验证 base -> quote -> out 在 amountInMax 少 1 时回退，
    // 等于 quote 输入上界时成功，并继续保持双 Pair 记账自洽。
    function testFuzz_multiHopExactOutputBoundaryAfterChurn_spendsQuotedInputExactly(
        uint8[7] memory actorSeeds,
        uint96[8] memory amountSeeds,
        uint16[4] memory shareBpsSeeds
    ) public {
        _addBaseQuote(actorSeeds[0], amountSeeds[0], amountSeeds[1]);
        _assertState();

        _addQuoteOut(actorSeeds[1], amountSeeds[2], amountSeeds[3]);
        _assertState();

        _removeBaseQuote(actorSeeds[2], shareBpsSeeds[0]);
        _assertState();

        _swapBaseToQuote(actorSeeds[3], amountSeeds[4]);
        _assertState();

        _removeQuoteOut(actorSeeds[4], shareBpsSeeds[1]);
        _assertState();

        _swapBaseToOutMultiHopExactOutputBoundary(actorSeeds[5], amountSeeds[5]);
        _assertState();

        _removeBaseQuote(actorSeeds[6], shareBpsSeeds[2]);
        _assertState();

        _removeQuoteOut(actorSeeds[0], shareBpsSeeds[3]);
        _assertState();
    }

    // 这组 fuzz 验证反向多跳 exact-output 在 churn 之后也不能“多给 1”：
    // out -> quote -> base 必须严格受 getAmountsIn 推导出的上界约束，失败回退后成功执行仍要维持总账守恒。
    function testFuzz_reverseMultiHopExactOutputBoundaryAfterChurn_preservesAccounting(
        uint8[7] memory actorSeeds,
        uint96[8] memory amountSeeds,
        uint16[4] memory shareBpsSeeds
    ) public {
        _addQuoteOut(actorSeeds[0], amountSeeds[0], amountSeeds[1]);
        _assertState();

        _addBaseQuote(actorSeeds[1], amountSeeds[2], amountSeeds[3]);
        _assertState();

        _removeQuoteOut(actorSeeds[2], shareBpsSeeds[0]);
        _assertState();

        _swapOutToQuote(actorSeeds[3], amountSeeds[4]);
        _assertState();

        _removeBaseQuote(actorSeeds[4], shareBpsSeeds[1]);
        _assertState();

        _swapOutToBaseMultiHopExactOutputBoundary(actorSeeds[5], amountSeeds[5]);
        _assertState();

        _removeQuoteOut(actorSeeds[6], shareBpsSeeds[2]);
        _assertState();

        _removeBaseQuote(actorSeeds[0], shareBpsSeeds[3]);
        _assertState();
    }

    function _executeStep(
        uint8 actionSeed,
        uint8 actorSeed,
        uint96 amountOneSeed,
        uint96 amountTwoSeed,
        uint16 shareBpsSeed
    ) private {
        uint8 action = actionSeed % 10;
        if (action == 0) {
            _addBaseQuote(actorSeed, amountOneSeed, amountTwoSeed);
            return;
        }
        if (action == 1) {
            _addQuoteOut(actorSeed, amountOneSeed, amountTwoSeed);
            return;
        }
        if (action == 2) {
            _removeBaseQuote(actorSeed, shareBpsSeed);
            return;
        }
        if (action == 3) {
            _removeQuoteOut(actorSeed, shareBpsSeed);
            return;
        }
        if (action == 4) {
            _swapBaseToQuote(actorSeed, amountOneSeed);
            return;
        }
        if (action == 5) {
            _swapOutToQuote(actorSeed, amountOneSeed);
            return;
        }
        if (action == 6) {
            _swapBaseToOutMultiHop(actorSeed, amountOneSeed);
            return;
        }
        if (action == 7) {
            _swapOutToBaseMultiHop(actorSeed, amountOneSeed);
            return;
        }
        if (action == 8) {
            _swapQuoteToBase(actorSeed, amountOneSeed);
            return;
        }
        _swapQuoteToOut(actorSeed, amountOneSeed);
    }

    function _seedBaseQuotePair(uint256 amountBase, uint256 amountQuote, address provider) private {
        _mintBase(provider, amountBase);
        _mintQuote(provider, amountQuote);

        vm.startPrank(provider);
        baseToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        router.addLiquidity(address(baseToken), address(quoteToken), amountBase, amountQuote, 0, 0, provider, _deadline());
        vm.stopPrank();
    }

    function _seedQuoteOutPair(uint256 amountQuote, uint256 amountOut, address provider) private {
        _mintQuote(provider, amountQuote);
        _mintOut(provider, amountOut);

        vm.startPrank(provider);
        quoteToken.approve(address(router), type(uint256).max);
        outToken.approve(address(router), type(uint256).max);
        router.addLiquidity(address(quoteToken), address(outToken), amountQuote, amountOut, 0, 0, provider, _deadline());
        vm.stopPrank();
    }

    function _addBaseQuote(uint8 actorSeed, uint256 rawBaseAmount, uint256 rawQuoteAmount) private {
        (uint256 baseReserve, uint256 quoteReserve) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);

        uint256 amountBase = bound(rawBaseAmount, 2_000, (baseReserve / 10) + 2_000);
        uint256 amountQuote = bound(rawQuoteAmount, 2_000, (quoteReserve / 10) + 2_000);
        (uint256 usedBase, uint256 usedQuote) =
            _computeExistingPairAddAmounts(amountBase, amountQuote, baseReserve, quoteReserve);

        if (_estimateLiquidityMinted(usedBase, usedQuote, baseReserve, quoteReserve, baseQuotePair.totalSupply()) == 0) {
            return;
        }

        address actor = _selectLp(actorSeed);
        _mintBase(actor, amountBase);
        _mintQuote(actor, amountQuote);

        vm.startPrank(actor);
        baseToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        (, , uint256 liquidity) =
            router.addLiquidity(address(baseToken), address(quoteToken), amountBase, amountQuote, 0, 0, actor, _deadline());
        vm.stopPrank();

        _increaseLpExpectation(actor, true, liquidity);
    }

    function _addQuoteOut(uint8 actorSeed, uint256 rawQuoteAmount, uint256 rawOutAmount) private {
        (uint256 quoteReserve, uint256 outReserve) = _reservesFor(address(quoteToken), address(outToken), quoteOutPair);

        uint256 amountQuote = bound(rawQuoteAmount, 2_000, (quoteReserve / 10) + 2_000);
        uint256 amountOut = bound(rawOutAmount, 2_000, (outReserve / 10) + 2_000);
        (uint256 usedQuote, uint256 usedOut) =
            _computeExistingPairAddAmounts(amountQuote, amountOut, quoteReserve, outReserve);

        if (_estimateLiquidityMinted(usedQuote, usedOut, quoteReserve, outReserve, quoteOutPair.totalSupply()) == 0) {
            return;
        }

        address actor = _selectLp(actorSeed);
        _mintQuote(actor, amountQuote);
        _mintOut(actor, amountOut);

        vm.startPrank(actor);
        quoteToken.approve(address(router), type(uint256).max);
        outToken.approve(address(router), type(uint256).max);
        (, , uint256 liquidity) =
            router.addLiquidity(address(quoteToken), address(outToken), amountQuote, amountOut, 0, 0, actor, _deadline());
        vm.stopPrank();

        _increaseLpExpectation(actor, false, liquidity);
    }

    function _removeBaseQuote(uint8 actorSeed, uint16 rawShareBps) private {
        address actor = _selectLp(actorSeed);
        uint256 actorLpBalance = baseQuotePair.balanceOf(actor);
        if (actorLpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (actorLpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        baseQuotePair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        router.removeLiquidity(address(baseToken), address(quoteToken), liquidityToRemove, 0, 0, actor, _deadline());

        _decreaseLpExpectation(actor, true, liquidityToRemove);
    }

    function _removeQuoteOut(uint8 actorSeed, uint16 rawShareBps) private {
        address actor = _selectLp(actorSeed);
        uint256 actorLpBalance = quoteOutPair.balanceOf(actor);
        if (actorLpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (actorLpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        quoteOutPair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        router.removeLiquidity(address(quoteToken), address(outToken), liquidityToRemove, 0, 0, actor, _deadline());

        _decreaseLpExpectation(actor, false, liquidityToRemove);
    }

    function _swapBaseToQuote(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectBaseTrader(actorSeed);
        address recipient = _selectQuoteRecipient(actorSeed);
        address[] memory path = _twoHopPath(address(baseToken), address(quoteToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(baseToken), address(quoteToken), baseQuotePair);

        _mintBase(trader, amountIn);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryBase += _protocolFee(amounts[0]);
        expectedRecipientQuote += amounts[1];
    }

    function _swapOutToQuote(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectOutTrader(actorSeed);
        address recipient = _selectQuoteRecipient(actorSeed);
        address[] memory path = _twoHopPath(address(outToken), address(quoteToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(outToken), address(quoteToken), quoteOutPair);

        _mintOut(trader, amountIn);
        vm.prank(trader);
        outToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryOut += _protocolFee(amounts[0]);
        expectedRecipientQuote += amounts[1];
    }

    function _swapQuoteToBase(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectQuoteTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);
        address[] memory path = _twoHopPath(address(quoteToken), address(baseToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(quoteToken), address(baseToken), baseQuotePair);

        _mintQuote(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryQuote += _protocolFee(amounts[0]);
        expectedRecipientBase += amounts[1];
    }

    function _swapQuoteToOut(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectQuoteTrader(actorSeed);
        address recipient = _selectOutRecipient(actorSeed);
        address[] memory path = _twoHopPath(address(quoteToken), address(outToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(quoteToken), address(outToken), quoteOutPair);

        _mintQuote(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryQuote += _protocolFee(amounts[0]);
        expectedRecipientOut += amounts[1];
    }

    function _swapBaseToOutMultiHop(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectBaseTrader(actorSeed);
        address recipient = _selectOutRecipient(actorSeed);
        address[] memory path = _threeHopPath(address(baseToken), address(quoteToken), address(outToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(baseToken), address(quoteToken), baseQuotePair);

        _mintBase(trader, amountIn);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[2] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[2], path, recipient, _deadline());

        expectedTreasuryBase += _protocolFee(amounts[0]);
        expectedTreasuryQuote += _protocolFee(amounts[1]);
        expectedRecipientOut += amounts[2];
    }

    function _swapOutToBaseMultiHop(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectOutTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);
        address[] memory path = _threeHopPath(address(outToken), address(quoteToken), address(baseToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(outToken), address(quoteToken), quoteOutPair);

        _mintOut(trader, amountIn);
        vm.prank(trader);
        outToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[2] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[2], path, recipient, _deadline());

        expectedTreasuryOut += _protocolFee(amounts[0]);
        expectedTreasuryQuote += _protocolFee(amounts[1]);
        expectedRecipientBase += amounts[2];
    }

    function _swapOutToBaseMultiHopAmountOutBoundary(uint8 actorSeed, uint256 rawAmountIn) private {
        address trader = _selectOutTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);
        address[] memory path = _threeHopPath(address(outToken), address(quoteToken), address(baseToken));
        uint256 amountIn = _boundedSwapIn(rawAmountIn, address(outToken), address(quoteToken), quoteOutPair);

        _mintOut(trader, amountIn);
        vm.prank(trader);
        outToken.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[2] > 0);

        vm.startPrank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(amountIn, amounts[2] + 1, path, recipient, _deadline());
        router.swapExactTokensForTokens(amountIn, amounts[2], path, recipient, _deadline());
        vm.stopPrank();

        expectedTreasuryOut += _protocolFee(amounts[0]);
        expectedTreasuryQuote += _protocolFee(amounts[1]);
        expectedRecipientBase += amounts[2];
    }

    function _swapBaseToOutMultiHopExactOutputBoundary(uint8 actorSeed, uint256 rawAmountOut) private {
        address trader = _selectBaseTrader(actorSeed);
        address recipient = _selectOutRecipient(actorSeed);
        address[] memory path = _threeHopPath(address(baseToken), address(quoteToken), address(outToken));
        uint256 amountOut = _boundedMultiHopAmountOut(rawAmountOut, address(quoteToken), address(outToken), quoteOutPair);
        uint256[] memory amounts = router.getAmountsIn(amountOut, path);

        _mintBase(trader, amounts[0]);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        vm.startPrank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(amountOut, amounts[0] - 1, path, recipient, _deadline());
        uint256[] memory executed = router.swapTokensForExactTokens(amountOut, amounts[0], path, recipient, _deadline());
        vm.stopPrank();

        assertEq(executed[0], amounts[0]);
        assertEq(executed[1], amounts[1]);
        assertEq(executed[2], amountOut);

        expectedTreasuryBase += _protocolFee(amounts[0]);
        expectedTreasuryQuote += _protocolFee(amounts[1]);
        expectedRecipientOut += amountOut;
    }

    function _swapOutToBaseMultiHopExactOutputBoundary(uint8 actorSeed, uint256 rawAmountOut) private {
        address trader = _selectOutTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);
        address[] memory path = _threeHopPath(address(outToken), address(quoteToken), address(baseToken));
        uint256 amountOut = _boundedMultiHopAmountOut(rawAmountOut, address(baseToken), address(quoteToken), baseQuotePair);
        uint256[] memory amounts = router.getAmountsIn(amountOut, path);

        _mintOut(trader, amounts[0]);
        vm.prank(trader);
        outToken.approve(address(router), type(uint256).max);

        vm.startPrank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(amountOut, amounts[0] - 1, path, recipient, _deadline());
        uint256[] memory executed = router.swapTokensForExactTokens(amountOut, amounts[0], path, recipient, _deadline());
        vm.stopPrank();

        assertEq(executed[0], amounts[0]);
        assertEq(executed[1], amounts[1]);
        assertEq(executed[2], amountOut);

        expectedTreasuryOut += _protocolFee(amounts[0]);
        expectedTreasuryQuote += _protocolFee(amounts[1]);
        expectedRecipientBase += amountOut;
    }

    function _assertState() private view {
        _assertPairReservesMatchBalances(baseQuotePair);
        _assertPairReservesMatchBalances(quoteOutPair);

        assertEq(baseQuotePair.balanceOf(lpA), expectedBaseQuoteLp[0]);
        assertEq(baseQuotePair.balanceOf(lpB), expectedBaseQuoteLp[1]);
        assertEq(baseQuotePair.balanceOf(lpC), expectedBaseQuoteLp[2]);

        assertEq(quoteOutPair.balanceOf(lpA), expectedQuoteOutLp[0]);
        assertEq(quoteOutPair.balanceOf(lpB), expectedQuoteOutLp[1]);
        assertEq(quoteOutPair.balanceOf(lpC), expectedQuoteOutLp[2]);

        assertEq(baseToken.balanceOf(treasury), expectedTreasuryBase);
        assertEq(quoteToken.balanceOf(treasury), expectedTreasuryQuote);
        assertEq(outToken.balanceOf(treasury), expectedTreasuryOut);

        assertEq(_recipientQuoteBalanceSum(), expectedRecipientQuote);
        assertEq(_recipientBaseBalanceSum(), expectedRecipientBase);
        assertEq(_recipientOutBalanceSum(), expectedRecipientOut);

        assertEq(baseToken.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
        assertEq(outToken.balanceOf(address(router)), 0);

        assertEq(totalMintedBase, _trackedBaseBalanceSum());
        assertEq(totalMintedQuote, _trackedQuoteBalanceSum());
        assertEq(totalMintedOut, _trackedOutBalanceSum());
    }

    function _assertPairReservesMatchBalances(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, MockERC20(pair.token0()).balanceOf(address(pair)));
        assertEq(reserve1, MockERC20(pair.token1()).balanceOf(address(pair)));
    }

    function _increaseLpExpectation(address actor, bool isBaseQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        uint256 index = _lpIndex(actor);
        if (isBaseQuotePair) {
            expectedBaseQuoteLp[index] += liquidityDelta;
            return;
        }
        expectedQuoteOutLp[index] += liquidityDelta;
    }

    function _decreaseLpExpectation(address actor, bool isBaseQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        uint256 index = _lpIndex(actor);
        if (isBaseQuotePair) {
            expectedBaseQuoteLp[index] -= liquidityDelta;
            return;
        }
        expectedQuoteOutLp[index] -= liquidityDelta;
    }

    function _mintBase(address to, uint256 amount) private {
        baseToken.mint(to, amount);
        totalMintedBase += amount;
    }

    function _mintQuote(address to, uint256 amount) private {
        quoteToken.mint(to, amount);
        totalMintedQuote += amount;
    }

    function _mintOut(address to, uint256 amount) private {
        outToken.mint(to, amount);
        totalMintedOut += amount;
    }

    function _protocolFee(uint256 amountIn) private pure returns (uint256) {
        return (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function _boundedSwapIn(uint256 rawAmountIn, address input, address output, FluxSwapPair pair)
        private
        view
        returns (uint256)
    {
        (uint256 reserveInput, ) = _reservesFor(input, output, pair);
        return bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
    }

    function _boundedMultiHopAmountOut(uint256 rawAmountOut, address output, address pairInput, FluxSwapPair pair)
        private
        view
        returns (uint256)
    {
        (, uint256 reserveOutput) = _reservesFor(pairInput, output, pair);
        return bound(rawAmountOut, 1, (reserveOutput / 25) + 1);
    }

    function _trackedBaseBalanceSum() private view returns (uint256) {
        return baseToken.balanceOf(lpA)
            + baseToken.balanceOf(lpB)
            + baseToken.balanceOf(lpC)
            + baseToken.balanceOf(traderBaseA)
            + baseToken.balanceOf(traderBaseB)
            + baseToken.balanceOf(traderQuoteA)
            + baseToken.balanceOf(traderQuoteB)
            + baseToken.balanceOf(traderOutA)
            + baseToken.balanceOf(traderOutB)
            + baseToken.balanceOf(recipientBaseA)
            + baseToken.balanceOf(recipientBaseB)
            + baseToken.balanceOf(recipientQuoteA)
            + baseToken.balanceOf(recipientQuoteB)
            + baseToken.balanceOf(recipientOutA)
            + baseToken.balanceOf(recipientOutB)
            + baseToken.balanceOf(address(baseQuotePair))
            + baseToken.balanceOf(address(quoteOutPair))
            + baseToken.balanceOf(treasury)
            + baseToken.balanceOf(address(router));
    }

    function _trackedQuoteBalanceSum() private view returns (uint256) {
        return quoteToken.balanceOf(lpA)
            + quoteToken.balanceOf(lpB)
            + quoteToken.balanceOf(lpC)
            + quoteToken.balanceOf(traderBaseA)
            + quoteToken.balanceOf(traderBaseB)
            + quoteToken.balanceOf(traderQuoteA)
            + quoteToken.balanceOf(traderQuoteB)
            + quoteToken.balanceOf(traderOutA)
            + quoteToken.balanceOf(traderOutB)
            + quoteToken.balanceOf(recipientBaseA)
            + quoteToken.balanceOf(recipientBaseB)
            + quoteToken.balanceOf(recipientQuoteA)
            + quoteToken.balanceOf(recipientQuoteB)
            + quoteToken.balanceOf(recipientOutA)
            + quoteToken.balanceOf(recipientOutB)
            + quoteToken.balanceOf(address(baseQuotePair))
            + quoteToken.balanceOf(address(quoteOutPair))
            + quoteToken.balanceOf(treasury)
            + quoteToken.balanceOf(address(router));
    }

    function _trackedOutBalanceSum() private view returns (uint256) {
        return outToken.balanceOf(lpA)
            + outToken.balanceOf(lpB)
            + outToken.balanceOf(lpC)
            + outToken.balanceOf(traderBaseA)
            + outToken.balanceOf(traderBaseB)
            + outToken.balanceOf(traderQuoteA)
            + outToken.balanceOf(traderQuoteB)
            + outToken.balanceOf(traderOutA)
            + outToken.balanceOf(traderOutB)
            + outToken.balanceOf(recipientBaseA)
            + outToken.balanceOf(recipientBaseB)
            + outToken.balanceOf(recipientQuoteA)
            + outToken.balanceOf(recipientQuoteB)
            + outToken.balanceOf(recipientOutA)
            + outToken.balanceOf(recipientOutB)
            + outToken.balanceOf(address(baseQuotePair))
            + outToken.balanceOf(address(quoteOutPair))
            + outToken.balanceOf(treasury)
            + outToken.balanceOf(address(router));
    }

    function _recipientQuoteBalanceSum() private view returns (uint256) {
        return quoteToken.balanceOf(recipientQuoteA) + quoteToken.balanceOf(recipientQuoteB);
    }

    function _recipientBaseBalanceSum() private view returns (uint256) {
        return baseToken.balanceOf(recipientBaseA) + baseToken.balanceOf(recipientBaseB);
    }

    function _recipientOutBalanceSum() private view returns (uint256) {
        return outToken.balanceOf(recipientOutA) + outToken.balanceOf(recipientOutB);
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

    function _selectBaseTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderBaseA : traderBaseB;
    }

    function _selectQuoteTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderQuoteA : traderQuoteB;
    }

    function _selectOutTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderOutA : traderOutB;
    }

    function _selectQuoteRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientQuoteA : recipientQuoteB;
    }

    function _selectBaseRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientBaseA : recipientBaseB;
    }

    function _selectOutRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientOutA : recipientOutB;
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

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
