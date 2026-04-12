// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockWETH.sol";

contract FluxSwapRouterExceptionFuzzTest is Test {
    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    MockERC20 private tokenC;

    address private provider;
    address private trader;
    address private recipient;

    function setUp() public {
        provider = makeAddr("provider");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
        tokenA = new MockERC20("Router Exception A", "RXA", 18);
        tokenB = new MockERC20("Router Exception B", "RXB", 18);
        tokenC = new MockERC20("Router Exception C", "RXC", 18);
    }

    // 这组异常路径 fuzz 不关心“成功后账对不对”，而是专门锁住“本该失败时必须准确失败”：
    // 过期、错 path、缺 pair、最小输出过高、最大输入过低、流动性最小值约束失败，都不能留下脏状态。
    function testFuzz_swapExactTokensForTokens_revertsWhenDeadlineExpired(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint96 rawAmountIn,
        uint32 rawWarp
    ) public {
        _seedTokenPair(
            bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY),
            bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY)
        );

        uint256 amountIn = bound(uint256(rawAmountIn), 1, (tokenA.balanceOf(address(_pair())) / 20) + 1);
        uint256 deadline = block.timestamp + bound(uint256(rawWarp), 1, 30 days);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        vm.warp(deadline + 1);

        uint256 traderBefore = tokenA.balanceOf(trader);
        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXPIRED"));
        router.swapExactTokensForTokens(amountIn, 0, _tokenPath(), recipient, deadline);

        assertEq(tokenA.balanceOf(trader), traderBefore);
        assertEq(tokenB.balanceOf(recipient), recipientBefore);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
    }

    function testFuzz_swapExactTokensForTokens_revertsWhenAmountOutMinIsTooHigh(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint96 rawAmountIn
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        _seedTokenPair(liquidityA, liquidityB);

        uint256 amountIn = bound(uint256(rawAmountIn), 1, (liquidityA / 20) + 1);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        vm.assume(quoted[1] > 0);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        uint256 traderBefore = tokenA.balanceOf(trader);
        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(amountIn, quoted[1] + 1, _tokenPath(), recipient, _deadline());

        assertEq(tokenA.balanceOf(trader), traderBefore);
        assertEq(tokenB.balanceOf(recipient), recipientBefore);
    }

    function testFuzz_swapTokensForExactTokens_revertsWhenAmountInMaxIsTooLow(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint96 rawAmountOut
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        _seedTokenPair(liquidityA, liquidityB);

        uint256 amountOut = bound(uint256(rawAmountOut), 1, (liquidityB / 20) + 1);
        uint256[] memory quoted = router.getAmountsIn(amountOut, _tokenPath());
        vm.assume(quoted[0] > 1);

        tokenA.mint(trader, quoted[0]);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        uint256 traderBefore = tokenA.balanceOf(trader);
        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(amountOut, quoted[0] - 1, _tokenPath(), recipient, _deadline());

        assertEq(tokenA.balanceOf(trader), traderBefore);
        assertEq(tokenB.balanceOf(recipient), recipientBefore);
    }

    function testFuzz_swapExactETHForTokens_revertsWhenPathDoesNotStartWithWeth(
        uint96 rawLiquidityA,
        uint96 rawLiquidityEth,
        uint96 rawEthIn
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityEth = bound(uint256(rawLiquidityEth), 1e10, 5e21);
        _seedEthPair(liquidityA, liquidityEth);

        uint256 ethIn = bound(uint256(rawEthIn), 1, (liquidityEth / 20) + 1);
        address[] memory invalidPath = new address[](2);
        invalidPath[0] = address(tokenA);
        invalidPath[1] = address(tokenB);

        vm.deal(trader, ethIn);
        uint256 traderBefore = trader.balance;
        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactETHForTokens{value: ethIn}(1, invalidPath, recipient, _deadline());

        assertEq(trader.balance, traderBefore);
        assertEq(tokenB.balanceOf(recipient), recipientBefore);
        assertEq(weth.balanceOf(address(router)), 0);
    }

    function testFuzz_swapExactTokensForTokensSupportingFeeOnTransfer_revertsWhenPathLengthIsInvalid(uint96 rawAmountIn)
        public
    {
        uint256 amountIn = bound(uint256(rawAmountIn), 1, 1e24);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory invalidPath = new address[](1);
        invalidPath[0] = address(tokenA);

        uint256 traderBefore = tokenA.balanceOf(trader);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, invalidPath, recipient, _deadline());

        assertEq(tokenA.balanceOf(trader), traderBefore);
        assertEq(tokenA.balanceOf(address(router)), 0);
    }

    function testFuzz_swapExactTokensForTokens_revertsWhenPairDoesNotExist(uint96 rawAmountIn) public {
        uint256 amountIn = bound(uint256(rawAmountIn), 1, 1e24);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory missingPath = new address[](2);
        missingPath[0] = address(tokenA);
        missingPath[1] = address(tokenC);

        uint256 traderBefore = tokenA.balanceOf(trader);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: PAIR_NOT_FOUND"));
        router.swapExactTokensForTokens(amountIn, 0, missingPath, recipient, _deadline());

        assertEq(tokenA.balanceOf(trader), traderBefore);
        assertEq(tokenA.balanceOf(address(router)), 0);
    }

    function testFuzz_addLiquidity_revertsWhenMinimumsExceedOptimalAmounts(
        uint96 rawInitialA,
        uint96 rawInitialB,
        uint16 rawShareBps
    ) public {
        uint256 initialA = bound(uint256(rawInitialA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 initialB = bound(uint256(rawInitialB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        _seedTokenPair(initialA, initialB);

        uint256 shareBps = bound(uint256(rawShareBps), 1, 2_000);
        uint256 desiredA = (initialA * shareBps) / 10_000;
        vm.assume(desiredA > 0);
        uint256 optimalB = router.quote(desiredA, initialA, initialB);
        vm.assume(optimalB > 0);
        uint256 desiredB = optimalB + 1;

        tokenA.mint(trader, desiredA);
        tokenB.mint(trader, desiredB);

        vm.startPrank(trader);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_B_AMOUNT"));
        router.addLiquidity(address(tokenA), address(tokenB), desiredA, desiredB, desiredA, desiredB, trader, _deadline());
        vm.stopPrank();

        assertEq(tokenA.balanceOf(trader), desiredA);
        assertEq(tokenB.balanceOf(trader), desiredB);
    }

    function testFuzz_removeLiquidity_revertsWhenMinimumOutputExceedsBurnProceeds(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint16 rawShareBps
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        _seedTokenPair(liquidityA, liquidityB);

        FluxSwapPair pair = _pair();
        uint256 providerLiquidity = pair.balanceOf(provider);
        uint256 burnShareBps = bound(uint256(rawShareBps), 1, 10_000);
        uint256 liquidityToBurn = (providerLiquidity * burnShareBps) / 10_000;
        vm.assume(liquidityToBurn > 0);

        uint256 pairABefore = tokenA.balanceOf(address(pair));
        uint256 pairBBefore = tokenB.balanceOf(address(pair));
        uint256 totalSupplyBefore = pair.totalSupply();
        uint256 expectedA = (liquidityToBurn * pairABefore) / totalSupplyBefore;
        uint256 expectedB = (liquidityToBurn * pairBBefore) / totalSupplyBefore;
        vm.assume(expectedA > 0 && expectedB > 0);

        vm.prank(provider);
        pair.approve(address(router), type(uint256).max);

        vm.prank(provider);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_A_AMOUNT"));
        router.removeLiquidity(
            address(tokenA), address(tokenB), liquidityToBurn, expectedA + 1, expectedB, recipient, _deadline()
        );

        assertEq(pair.balanceOf(provider), providerLiquidity);
        assertEq(tokenA.balanceOf(recipient), 0);
        assertEq(tokenB.balanceOf(recipient), 0);
    }

    function testFuzz_swapETHForExactTokens_revertsWhenMsgValueIsBelowQuotedInput(
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawAmountOut
    ) public {
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);
        _seedEthPair(tokenLiquidity, ethLiquidity);

        uint256 amountOut = bound(uint256(rawAmountOut), 1, (tokenLiquidity / 20) + 1);
        uint256[] memory quoted = router.getAmountsIn(amountOut, _ethToTokenPath());
        vm.assume(quoted[0] > 1);

        vm.deal(trader, quoted[0] - 1);
        uint256 traderBefore = trader.balance;
        uint256 recipientBefore = tokenA.balanceOf(recipient);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapETHForExactTokens{value: quoted[0] - 1}(amountOut, _ethToTokenPath(), recipient, _deadline());

        assertEq(trader.balance, traderBefore);
        assertEq(tokenA.balanceOf(recipient), recipientBefore);
        assertEq(weth.balanceOf(address(router)), 0);
    }

    function _seedTokenPair(uint256 amountA, uint256 amountB) private {
        tokenA.mint(provider, amountA);
        tokenB.mint(provider, amountB);

        vm.startPrank(provider);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, provider, _deadline());
        vm.stopPrank();
    }

    function _seedEthPair(uint256 tokenAmount, uint256 ethAmount) private {
        tokenA.mint(provider, tokenAmount);
        vm.deal(provider, ethAmount);

        vm.startPrank(provider);
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(tokenA), tokenAmount, 0, 0, provider, _deadline());
        vm.stopPrank();
    }

    function _pair() private view returns (FluxSwapPair) {
        return FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
    }

    function _tokenPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
    }

    function _ethToTokenPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(weth);
        path[1] = address(tokenA);
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
