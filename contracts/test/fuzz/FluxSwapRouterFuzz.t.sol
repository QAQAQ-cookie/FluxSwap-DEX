// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockWETH.sol";

contract FluxSwapRouterFuzzTest is Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    address private provider;
    address private trader;
    address private recipient;

    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;

    function setUp() public {
        provider = makeAddr("provider");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);
    }

    // Router fuzz 这一组现在覆盖七条最核心路径：
    // 1. token -> token 的 exact-input / exact-output 交换应与 quote 一致。
    // 2. 已有池子的 addLiquidity 不应超出用户给定的 desired 数量。
    // 3. ETH <-> token 双向交换都要满足 quote / refund 语义。
    // 4. removeLiquidity 应按 LP 份额精确返还底层资产。
    function testFuzz_swapExactTokensForTokens_matchesQuotedOutput(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint96 rawAmountIn
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 amountIn = bound(uint256(rawAmountIn), 1, (liquidityA / 20) + 1);

        _seedTokenPair(liquidityA, liquidityB);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _tokenPath();
        uint256[] memory quoted = router.getAmountsOut(amountIn, path);
        vm.assume(quoted[1] > 0);
        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        uint256[] memory executed =
            router.swapExactTokensForTokens(amountIn, quoted[1], path, recipient, _deadline());

        assertEq(executed[0], amountIn);
        assertEq(executed[1], quoted[1]);
        assertEq(tokenB.balanceOf(recipient) - recipientBefore, quoted[1]);
        assertEq(tokenA.balanceOf(trader), 0);
    }

    function testFuzz_swapTokensForExactTokens_spendsQuotedInput(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint96 rawAmountOut
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 amountOut = bound(uint256(rawAmountOut), 1, (liquidityB / 20) + 1);

        _seedTokenPair(liquidityA, liquidityB);

        address[] memory path = _tokenPath();
        uint256[] memory quoted = router.getAmountsIn(amountOut, path);

        tokenA.mint(trader, quoted[0]);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        uint256 recipientBefore = tokenB.balanceOf(recipient);

        vm.prank(trader);
        uint256[] memory executed =
            router.swapTokensForExactTokens(amountOut, quoted[0], path, recipient, _deadline());

        assertEq(executed[0], quoted[0]);
        assertEq(executed[1], amountOut);
        assertEq(tokenB.balanceOf(recipient) - recipientBefore, amountOut);
        assertEq(tokenA.balanceOf(trader), 0);
    }

    function testFuzz_addLiquidity_onExistingPair_neverExceedsDesiredAmounts(
        uint96 rawInitialA,
        uint96 rawInitialB,
        uint16 rawShareBps
    ) public {
        uint256 initialA = bound(uint256(rawInitialA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 initialB = bound(uint256(rawInitialB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 shareBps = bound(uint256(rawShareBps), 1, 2000);
        uint256 desiredA = (initialA * shareBps) / 10000;
        uint256 desiredB = (initialB * shareBps) / 10000;
        vm.assume(desiredA > 0 && desiredB > 0);

        _seedTokenPair(initialA, initialB);

        tokenA.mint(trader, desiredA);
        tokenB.mint(trader, desiredB);

        vm.startPrank(trader);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        uint256 traderABefore = tokenA.balanceOf(trader);
        uint256 traderBBefore = tokenB.balanceOf(trader);

        (uint256 amountA, uint256 amountB, uint256 liquidity) =
            router.addLiquidity(address(tokenA), address(tokenB), desiredA, desiredB, 0, 0, trader, _deadline());
        vm.stopPrank();

        assertGt(liquidity, 0);
        assertLe(amountA, desiredA);
        assertLe(amountB, desiredB);
        assertEq(traderABefore - tokenA.balanceOf(trader), amountA);
        assertEq(traderBBefore - tokenB.balanceOf(trader), amountB);
    }

    function testFuzz_removeLiquidity_returnsProportionalUnderlying(
        uint96 rawLiquidityA,
        uint96 rawLiquidityB,
        uint16 rawShareBps
    ) public {
        uint256 liquidityA = bound(uint256(rawLiquidityA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 liquidityB = bound(uint256(rawLiquidityB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 shareBps = bound(uint256(rawShareBps), 1, 10_000);

        _seedTokenPair(liquidityA, liquidityB);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
        uint256 providerLiquidity = pair.balanceOf(provider);
        uint256 liquidityToBurn = (providerLiquidity * shareBps) / 10_000;
        vm.assume(liquidityToBurn > 0);

        uint256 pairTokenABalanceBefore = tokenA.balanceOf(address(pair));
        uint256 pairTokenBBalanceBefore = tokenB.balanceOf(address(pair));
        uint256 totalSupplyBefore = pair.totalSupply();
        uint256 expectedAmountA = (liquidityToBurn * pairTokenABalanceBefore) / totalSupplyBefore;
        uint256 expectedAmountB = (liquidityToBurn * pairTokenBBalanceBefore) / totalSupplyBefore;
        vm.assume(expectedAmountA > 0 && expectedAmountB > 0);

        vm.prank(provider);
        pair.approve(address(router), type(uint256).max);

        uint256 recipientABefore = tokenA.balanceOf(recipient);
        uint256 recipientBBefore = tokenB.balanceOf(recipient);

        vm.prank(provider);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(tokenA), address(tokenB), liquidityToBurn, 0, 0, recipient, _deadline());

        assertEq(amountA, expectedAmountA);
        assertEq(amountB, expectedAmountB);
        assertEq(tokenA.balanceOf(recipient) - recipientABefore, expectedAmountA);
        assertEq(tokenB.balanceOf(recipient) - recipientBBefore, expectedAmountB);
    }

    function testFuzz_swapExactETHForTokens_matchesQuotedOutput(
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawEthIn
    ) public {
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);
        uint256 ethIn = bound(uint256(rawEthIn), 1, (ethLiquidity / 20) + 1);

        _seedEthPair(tokenLiquidity, ethLiquidity);

        address[] memory path = _ethToTokenPath();
        uint256[] memory quoted = router.getAmountsOut(ethIn, path);
        vm.assume(quoted[1] > 0);
        uint256 recipientBefore = tokenA.balanceOf(recipient);

        vm.deal(trader, ethIn);
        vm.prank(trader);
        uint256[] memory executed =
            router.swapExactETHForTokens{value: ethIn}(quoted[1], path, recipient, _deadline());

        assertEq(executed[0], ethIn);
        assertEq(executed[1], quoted[1]);
        assertEq(tokenA.balanceOf(recipient) - recipientBefore, quoted[1]);
    }

    function testFuzz_swapExactTokensForETH_matchesQuotedOutput(
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawTokenIn
    ) public {
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);
        uint256 amountIn = bound(uint256(rawTokenIn), 1, (tokenLiquidity / 20) + 1);

        _seedEthPair(tokenLiquidity, ethLiquidity);

        tokenA.mint(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _tokenToEthPath();
        uint256[] memory quoted = router.getAmountsOut(amountIn, path);
        vm.assume(quoted[1] > 0);
        uint256 recipientBefore = recipient.balance;

        vm.prank(trader);
        uint256[] memory executed =
            router.swapExactTokensForETH(amountIn, quoted[1], path, recipient, _deadline());

        assertEq(executed[0], amountIn);
        assertEq(executed[1], quoted[1]);
        assertEq(recipient.balance - recipientBefore, quoted[1]);
        assertEq(tokenA.balanceOf(trader), 0);
    }

    function testFuzz_swapETHForExactTokens_refundsUnusedEth(
        uint96 rawTokenLiquidity,
        uint96 rawEthLiquidity,
        uint96 rawAmountOut,
        uint96 rawExtraValue
    ) public {
        uint256 tokenLiquidity = bound(uint256(rawTokenLiquidity), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 ethLiquidity = bound(uint256(rawEthLiquidity), 1e10, 5e21);
        uint256 amountOut = bound(uint256(rawAmountOut), 1, (tokenLiquidity / 20) + 1);

        _seedEthPair(tokenLiquidity, ethLiquidity);

        address[] memory path = _ethToTokenPath();
        uint256[] memory quoted = router.getAmountsIn(amountOut, path);
        uint256 extraValue = bound(uint256(rawExtraValue), 0, 1e18);
        uint256 valueSent = quoted[0] + extraValue;

        vm.deal(trader, valueSent);
        uint256 traderEthBefore = trader.balance;
        uint256 recipientBefore = tokenA.balanceOf(recipient);

        vm.prank(trader);
        uint256[] memory executed =
            router.swapETHForExactTokens{value: valueSent}(amountOut, path, recipient, _deadline());

        assertEq(executed[0], quoted[0]);
        assertEq(executed[1], amountOut);
        assertEq(tokenA.balanceOf(recipient) - recipientBefore, amountOut);
        assertEq(traderEthBefore - trader.balance, quoted[0]);
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

    function _tokenToEthPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(weth);
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
