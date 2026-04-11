// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockFeeOnTransferERC20.sol";
import "../../contracts/mocks/MockWETH.sol";

contract FluxSwapRouterFeeOnTransferFuzzTest is Test {
    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;
    uint256 private constant FEE_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    struct MultiHopExpectations {
        uint256 treasuryFirstHop;
        uint256 treasurySecondHop;
        uint256 recipientOut;
    }

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockFeeOnTransferERC20 private feeToken;
    MockERC20 private quoteToken;

    address private lp;
    address private trader;
    address private recipient;
    address private treasury;

    function setUp() public {
        lp = makeAddr("lp");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
    }

    // 这一组 fuzz 专门锁住 supporting fee-on-transfer 路径的两个关键性质：
    // 1. 协议费必须按真实净输入计费，而不是按用户的名义输入金额误计。
    // 2. token -> ETH 的 supporting 路径只能消耗本次 swap 产生的 WETH，不能动到 Router 预存的 WETH。
    function testFuzz_swapExactTokensForTokensSupportingFeeOnTransfer_chargesTreasuryFromRealNetInput(
        uint16 rawFeeBps,
        uint96 rawLiquidityFee,
        uint96 rawLiquidityQuote,
        uint96 rawAmountIn
    ) public {
        uint256 feeBps = bound(uint256(rawFeeBps), 1, 1_000);
        uint256 liquidityFee = bound(uint256(rawLiquidityFee), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityQuote = bound(uint256(rawLiquidityQuote), MIN_LIQUIDITY, MAX_LIQUIDITY);

        _deployFeeToken(feeBps);
        _seedTokenPair(liquidityFee, liquidityQuote);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(feeToken), address(quoteToken)));
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(feeToken), address(quoteToken), pair);

        uint256 amountIn = bound(uint256(rawAmountIn), 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn, feeBps);
        uint256 expectedGrossProtocolFee = (netInput * PROTOCOL_FEE_BPS) / FEE_BASE;
        uint256 expectedTreasuryReceive = _applyTransferFee(expectedGrossProtocolFee, feeBps);
        uint256 expectedAmountOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        vm.assume(netInput > 0 && expectedAmountOut > 0);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        uint256 treasuryBefore = feeToken.balanceOf(treasury);
        uint256 recipientBefore = quoteToken.balanceOf(recipient);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, 1, _feeToQuotePath(), recipient, _deadline()
        );

        assertEq(feeToken.balanceOf(treasury) - treasuryBefore, expectedTreasuryReceive);
        assertEq(quoteToken.balanceOf(recipient) - recipientBefore, expectedAmountOut);
    }

    function testFuzz_swapExactETHForTokensSupportingFeeOnTransfer_chargesTreasuryInRealInputAsset(
        uint16 rawFeeBps,
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawEthIn
    ) public {
        uint256 feeBps = bound(uint256(rawFeeBps), 1, 1_000);
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);

        _deployFeeToken(feeBps);
        _seedEthPair(tokenLiquidity, ethLiquidity);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(feeToken), address(weth)));
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(weth), address(feeToken), pair);

        uint256 ethIn = bound(uint256(rawEthIn), 2_000, (reserveInput / 20) + 2_000);
        uint256 expectedTreasuryReceive = (ethIn * PROTOCOL_FEE_BPS) / FEE_BASE;
        uint256 expectedGrossAmountOut = router.getAmountOut(ethIn, reserveInput, reserveOutput);
        uint256 expectedRecipientReceive = _applyTransferFee(expectedGrossAmountOut, feeBps);
        vm.assume(expectedGrossAmountOut > 0);

        vm.deal(trader, ethIn);
        uint256 treasuryBefore = weth.balanceOf(treasury);
        uint256 recipientBefore = feeToken.balanceOf(recipient);

        vm.prank(trader);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethIn}(
            1, _ethToFeePath(), recipient, _deadline()
        );

        assertEq(weth.balanceOf(treasury) - treasuryBefore, expectedTreasuryReceive);
        assertEq(feeToken.balanceOf(recipient) - recipientBefore, expectedRecipientReceive);
    }

    function testFuzz_swapExactTokensForTokensSupportingFeeOnTransfer_multihopTaxesOnlyRealHopInputs(
        uint16 rawFeeBps,
        uint96 rawLiquidityFee,
        uint96 rawLiquidityMidA,
        uint96 rawLiquidityMidB,
        uint96 rawLiquidityOut,
        uint96 rawAmountIn
    ) public {
        uint256 feeBps = bound(uint256(rawFeeBps), 1, 1_000);
        uint256 liquidityFee = bound(uint256(rawLiquidityFee), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityMidA = bound(uint256(rawLiquidityMidA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityMidB = bound(uint256(rawLiquidityMidB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityOut = bound(uint256(rawLiquidityOut), MIN_LIQUIDITY, MAX_LIQUIDITY);

        _deployFeeToken(feeBps);
        MockERC20 midToken = new MockERC20("Mid Token", "MID", 18);
        MockERC20 outToken = new MockERC20("Out Token", "OUT", 18);

        FluxSwapPair firstPair = _seedGenericPair(feeToken, midToken, liquidityFee, liquidityMidA);
        FluxSwapPair secondPair = _seedGenericPair(midToken, outToken, liquidityMidB, liquidityOut);

        uint256 amountIn = bound(uint256(rawAmountIn), 2_000, (liquidityFee / 20) + 2_000);
        MultiHopExpectations memory expected =
            _computeFeeFirstMultiHopExpectations(firstPair, secondPair, amountIn, feeBps, midToken, outToken);
        vm.assume(expected.recipientOut > 0);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        uint256 feeTokenTreasuryBefore = feeToken.balanceOf(treasury);
        uint256 midTreasuryBefore = midToken.balanceOf(treasury);
        uint256 recipientBefore = outToken.balanceOf(recipient);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, 1, _threeHopPath(address(feeToken), address(midToken), address(outToken)), recipient, _deadline()
        );

        assertEq(feeToken.balanceOf(treasury) - feeTokenTreasuryBefore, expected.treasuryFirstHop);
        assertEq(midToken.balanceOf(treasury) - midTreasuryBefore, expected.treasurySecondHop);
        assertEq(outToken.balanceOf(recipient) - recipientBefore, expected.recipientOut);
    }

    function testFuzz_swapExactTokensForTokensSupportingFeeOnTransfer_taxedMiddleTokenUsesNetInterHopInput(
        uint16 rawFeeBps,
        uint96 rawLiquidityIn,
        uint96 rawLiquidityTaxA,
        uint96 rawLiquidityTaxB,
        uint96 rawLiquidityOut,
        uint96 rawAmountIn
    ) public {
        uint256 feeBps = bound(uint256(rawFeeBps), 1, 1_000);
        uint256 liquidityIn = bound(uint256(rawLiquidityIn), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityTaxA = bound(uint256(rawLiquidityTaxA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityTaxB = bound(uint256(rawLiquidityTaxB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityOut = bound(uint256(rawLiquidityOut), MIN_LIQUIDITY, MAX_LIQUIDITY);

        _deployFeeToken(feeBps);
        MockERC20 inToken = new MockERC20("Input Token", "IN", 18);
        MockERC20 outToken = new MockERC20("Out Token", "OUT", 18);

        FluxSwapPair firstPair = _seedGenericPair(inToken, feeToken, liquidityIn, liquidityTaxA);
        FluxSwapPair secondPair = _seedGenericPair(feeToken, outToken, liquidityTaxB, liquidityOut);

        uint256 amountIn = bound(uint256(rawAmountIn), 2_000, (liquidityIn / 20) + 2_000);
        MultiHopExpectations memory expected =
            _computeTaxedMiddleMultiHopExpectations(firstPair, secondPair, amountIn, feeBps, inToken, outToken);
        vm.assume(expected.treasurySecondHop > 0 && expected.recipientOut > 0);

        inToken.mint(trader, amountIn);
        vm.prank(trader);
        inToken.approve(address(router), type(uint256).max);

        uint256 inTreasuryBefore = inToken.balanceOf(treasury);
        uint256 feeTokenTreasuryBefore = feeToken.balanceOf(treasury);
        uint256 recipientBefore = outToken.balanceOf(recipient);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn, 1, _threeHopPath(address(inToken), address(feeToken), address(outToken)), recipient, _deadline()
        );

        assertEq(inToken.balanceOf(treasury) - inTreasuryBefore, expected.treasuryFirstHop);
        assertEq(feeToken.balanceOf(treasury) - feeTokenTreasuryBefore, expected.treasurySecondHop);
        assertEq(outToken.balanceOf(recipient) - recipientBefore, expected.recipientOut);
    }

    function testFuzz_swapExactTokensForETHSupportingFeeOnTransfer_keepsPreloadedRouterWethUntouched(
        uint16 rawFeeBps,
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawAmountIn,
        uint96 rawPreload
    ) public {
        uint256 feeBps = bound(uint256(rawFeeBps), 1, 1_000);
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);

        _deployFeeToken(feeBps);
        _seedEthPair(tokenLiquidity, ethLiquidity);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(feeToken), address(weth)));
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(feeToken), address(weth), pair);

        uint256 amountIn = bound(uint256(rawAmountIn), 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn, feeBps);
        uint256 expectedGrossProtocolFee = (netInput * PROTOCOL_FEE_BPS) / FEE_BASE;
        uint256 expectedTreasuryReceive = _applyTransferFee(expectedGrossProtocolFee, feeBps);
        uint256 expectedEthOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        uint256 preload = bound(uint256(rawPreload), 1, 1e21);
        vm.assume(netInput > 0 && expectedEthOut > 0);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.deal(address(this), preload);
        weth.deposit{value: preload}();
        weth.transfer(address(router), preload);

        uint256 routerWethBefore = weth.balanceOf(address(router));
        uint256 treasuryBefore = feeToken.balanceOf(treasury);
        uint256 recipientEthBefore = recipient.balance;

        vm.prank(trader);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn, 1, _feeToEthPath(), recipient, _deadline()
        );

        assertEq(feeToken.balanceOf(treasury) - treasuryBefore, expectedTreasuryReceive);
        assertEq(recipient.balance - recipientEthBefore, expectedEthOut);
        assertEq(weth.balanceOf(address(router)), routerWethBefore);
    }

    function _deployFeeToken(uint256 feeBps) private {
        feeToken = new MockFeeOnTransferERC20("Tax Token", "TAX", 18, feeBps);
        quoteToken = new MockERC20("Quote Token", "QUOTE", 18);
        factory.setTreasury(treasury);
    }

    function _seedTokenPair(uint256 feeTokenAmount, uint256 quoteTokenAmount) private {
        _seedGenericPair(feeToken, quoteToken, feeTokenAmount, quoteTokenAmount);
    }

    function _seedEthPair(uint256 feeTokenAmount, uint256 ethAmount) private {
        factory.createPair(address(feeToken), address(weth));
        address pairAddress = factory.getPair(address(feeToken), address(weth));

        feeToken.mint(lp, feeTokenAmount);
        vm.deal(lp, ethAmount);

        vm.startPrank(lp);
        feeToken.transfer(pairAddress, feeTokenAmount);
        weth.deposit{value: ethAmount}();
        weth.transfer(pairAddress, ethAmount);
        FluxSwapPair(pairAddress).mint(lp);
        vm.stopPrank();
    }

    function _seedGenericPair(MockERC20 tokenA, MockERC20 tokenB, uint256 amountA, uint256 amountB)
        private
        returns (FluxSwapPair pair)
    {
        factory.createPair(address(tokenA), address(tokenB));
        address pairAddress = factory.getPair(address(tokenA), address(tokenB));

        tokenA.mint(lp, amountA);
        tokenB.mint(lp, amountB);

        vm.startPrank(lp);
        tokenA.transfer(pairAddress, amountA);
        tokenB.transfer(pairAddress, amountB);
        FluxSwapPair(pairAddress).mint(lp);
        vm.stopPrank();

        pair = FluxSwapPair(pairAddress);
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
        } else {
            assert(pair.token1() == input);
            assert(pair.token0() == output || pair.token1() == output);
            reserveInput = reserve1;
            reserveOutput = reserve0;
        }
    }

    function _computeFeeFirstMultiHopExpectations(
        FluxSwapPair firstPair,
        FluxSwapPair secondPair,
        uint256 amountIn,
        uint256 feeBps,
        MockERC20 midToken,
        MockERC20 outToken
    ) private view returns (MultiHopExpectations memory expected) {
        (uint256 reserveFeeIn, uint256 reserveMidOut) =
            _reservesFor(address(feeToken), address(midToken), firstPair);
        (uint256 reserveMidIn, uint256 reserveOut) =
            _reservesFor(address(midToken), address(outToken), secondPair);

        uint256 netFirstHopInput = _applyTransferFee(amountIn, feeBps);
        uint256 firstHopAmountOut = router.getAmountOut(netFirstHopInput, reserveFeeIn, reserveMidOut);
        if (netFirstHopInput == 0 || firstHopAmountOut == 0) {
            return expected;
        }

        expected.treasuryFirstHop = _applyTransferFee((netFirstHopInput * PROTOCOL_FEE_BPS) / FEE_BASE, feeBps);
        expected.treasurySecondHop = (firstHopAmountOut * PROTOCOL_FEE_BPS) / FEE_BASE;
        expected.recipientOut = router.getAmountOut(firstHopAmountOut, reserveMidIn, reserveOut);
    }

    function _computeTaxedMiddleMultiHopExpectations(
        FluxSwapPair firstPair,
        FluxSwapPair secondPair,
        uint256 amountIn,
        uint256 feeBps,
        MockERC20 inToken,
        MockERC20 outToken
    ) private view returns (MultiHopExpectations memory expected) {
        (uint256 reserveInput, uint256 reserveTaxOut) =
            _reservesFor(address(inToken), address(feeToken), firstPair);
        (uint256 reserveTaxIn, uint256 reserveOutput) =
            _reservesFor(address(feeToken), address(outToken), secondPair);

        uint256 firstHopTaxOut = router.getAmountOut(amountIn, reserveInput, reserveTaxOut);
        uint256 netSecondHopInput = _applyTransferFee(firstHopTaxOut, feeBps);
        if (firstHopTaxOut == 0 || netSecondHopInput == 0) {
            return expected;
        }

        expected.treasuryFirstHop = (amountIn * PROTOCOL_FEE_BPS) / FEE_BASE;
        expected.treasurySecondHop = _applyTransferFee((netSecondHopInput * PROTOCOL_FEE_BPS) / FEE_BASE, feeBps);
        expected.recipientOut = router.getAmountOut(netSecondHopInput, reserveTaxIn, reserveOutput);
    }

    function _applyTransferFee(uint256 amount, uint256 feeBps) private pure returns (uint256) {
        return amount - ((amount * feeBps) / FEE_BASE);
    }

    function _feeToQuotePath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(feeToken);
        path[1] = address(quoteToken);
    }

    function _ethToFeePath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(weth);
        path[1] = address(feeToken);
    }

    function _feeToEthPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(feeToken);
        path[1] = address(weth);
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

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
