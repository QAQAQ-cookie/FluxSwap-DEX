// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxAmmLifecycleStatefulFuzzTest is Test {
    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant BPS_BASE = 10_000;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    address private lpA;
    address private lpB;
    address private traderA;
    address private traderB;
    address private recipientA;
    address private recipientB;
    address private treasury;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        traderA = makeAddr("traderA");
        traderB = makeAddr("traderB");
        recipientA = makeAddr("recipientA");
        recipientB = makeAddr("recipientB");
        treasury = makeAddr("treasury");

        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), makeAddr("unusedWeth"));
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);
    }

    // 这一组 stateful fuzz 把 token-token AMM 的真实生命周期串成一条链：
    // 1. 首个 LP 建池，第二个 LP 在已有价格上继续加池。
    // 2. 两个方向各做一笔 exact-input swap，让 treasury 分别沉淀 tokenA / tokenB 协议费。
    // 3. 第二个 LP 再做部分撤池，最终验证储备同步、协议费对账、总量守恒和 router 无残留。
    function testFuzz_tokenPairLifecycle_preservesFeesReservesAndTokenConservation(
        uint96 rawInitialA,
        uint96 rawInitialB,
        uint16 rawShareBps,
        uint16 rawExtraBBps,
        uint96 rawSwapInA,
        uint96 rawSwapInB,
        uint16 rawRemoveShareBps
    ) public {
        uint256 initialA = bound(uint256(rawInitialA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 initialB = bound(uint256(rawInitialB), MIN_LIQUIDITY, MAX_LIQUIDITY);

        factory.setTreasury(treasury);
        _seedTokenPair(initialA, initialB);

        (uint256 secondA, uint256 secondBDesired) = _addSecondTokenLiquidity(initialA, initialB, rawShareBps, rawExtraBBps);
        (uint256 swapInA, uint256 swapOutB) = _swapAToB(rawSwapInA);
        (uint256 swapInB, uint256 swapOutA) = _swapBToA(rawSwapInB);
        _removePartialTokenLiquidity(rawRemoveShareBps);

        uint256 expectedTreasuryA = (swapInA * PROTOCOL_FEE_BPS) / BPS_BASE;
        uint256 expectedTreasuryB = (swapInB * PROTOCOL_FEE_BPS) / BPS_BASE;

        assertEq(tokenA.balanceOf(treasury), expectedTreasuryA);
        assertEq(tokenB.balanceOf(treasury), expectedTreasuryB);
        assertEq(tokenB.balanceOf(recipientA), swapOutB);
        assertEq(tokenA.balanceOf(recipientB), swapOutA);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
        _assertPairReservesMatchBalances(pair);

        uint256 totalMintedA = initialA + secondA + swapInA;
        uint256 totalMintedB = initialB + secondBDesired + swapInB;

        assertEq(totalMintedA, _trackedBalanceSum(tokenA, address(pair)));
        assertEq(totalMintedB, _trackedBalanceSum(tokenB, address(pair)));
    }

    function _seedTokenPair(uint256 amountA, uint256 amountB) private {
        tokenA.mint(lpA, amountA);
        tokenB.mint(lpA, amountB);

        vm.startPrank(lpA);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, lpA, _deadline());
        vm.stopPrank();
    }

    function _addSecondTokenLiquidity(
        uint256 initialA,
        uint256 initialB,
        uint16 rawShareBps,
        uint16 rawExtraBBps
    ) private returns (uint256 secondA, uint256 secondBDesired) {
        uint256 shareBps = bound(uint256(rawShareBps), 1, 3_000);
        secondA = (initialA * shareBps) / BPS_BASE;
        vm.assume(secondA > 0);

        uint256 secondBOptimal = router.quote(secondA, initialA, initialB);
        vm.assume(secondBOptimal > 0);
        uint256 secondBExtra = (secondBOptimal * bound(uint256(rawExtraBBps), 0, 5_000)) / BPS_BASE;
        secondBDesired = secondBOptimal + secondBExtra;

        tokenA.mint(lpB, secondA);
        tokenB.mint(lpB, secondBDesired);

        vm.startPrank(lpB);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        (uint256 secondAmountA, uint256 secondAmountB, uint256 mintedLp) =
            router.addLiquidity(address(tokenA), address(tokenB), secondA, secondBDesired, 0, 0, lpB, _deadline());
        vm.stopPrank();

        assertEq(secondAmountA, secondA);
        assertEq(secondAmountB, secondBOptimal);
        assertGt(mintedLp, 0);
    }

    function _swapAToB(uint96 rawSwapInA) private returns (uint256 swapIn, uint256 quotedOut) {
        (uint256 reserveABeforeSwapA, ) = _orderedReserves();
        swapIn = bound(uint256(rawSwapInA), 2_000, (reserveABeforeSwapA / 20) + 1);

        tokenA.mint(traderA, swapIn);
        vm.prank(traderA);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory pathAToB = _tokenPath(address(tokenA), address(tokenB));
        uint256[] memory quotedAToB = router.getAmountsOut(swapIn, pathAToB);
        vm.assume(quotedAToB[1] > 0);

        vm.prank(traderA);
        uint256[] memory executedAToB =
            router.swapExactTokensForTokens(swapIn, quotedAToB[1], pathAToB, recipientA, _deadline());

        assertEq(executedAToB[0], swapIn);
        assertEq(executedAToB[1], quotedAToB[1]);
        return (swapIn, quotedAToB[1]);
    }

    function _swapBToA(uint96 rawSwapInB) private returns (uint256 swapIn, uint256 quotedOut) {
        (, uint256 reserveBAfterSwapA) = _orderedReserves();
        swapIn = bound(uint256(rawSwapInB), 2_000, (reserveBAfterSwapA / 20) + 1);

        tokenB.mint(traderB, swapIn);
        vm.prank(traderB);
        tokenB.approve(address(router), type(uint256).max);

        address[] memory pathBToA = _tokenPath(address(tokenB), address(tokenA));
        uint256[] memory quotedBToA = router.getAmountsOut(swapIn, pathBToA);
        vm.assume(quotedBToA[1] > 0);

        vm.prank(traderB);
        uint256[] memory executedBToA =
            router.swapExactTokensForTokens(swapIn, quotedBToA[1], pathBToA, recipientB, _deadline());

        assertEq(executedBToA[0], swapIn);
        assertEq(executedBToA[1], quotedBToA[1]);
        return (swapIn, quotedBToA[1]);
    }

    function _removePartialTokenLiquidity(uint16 rawRemoveShareBps) private {
        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
        uint256 removeShareBps = bound(uint256(rawRemoveShareBps), 1, 10_000);
        uint256 lpBBalance = pair.balanceOf(lpB);
        uint256 liquidityToRemove = (lpBBalance * removeShareBps) / BPS_BASE;
        vm.assume(liquidityToRemove > 0);

        vm.prank(lpB);
        pair.approve(address(router), type(uint256).max);

        vm.prank(lpB);
        router.removeLiquidity(address(tokenA), address(tokenB), liquidityToRemove, 0, 0, lpB, _deadline());
    }

    function _orderedReserves() private view returns (uint256 reserveA, uint256 reserveB) {
        return _orderedReserves(address(tokenA), address(tokenB));
    }

    function _orderedReserves(address assetA, address assetB) private view returns (uint256 reserveA, uint256 reserveB) {
        FluxSwapPair pair = FluxSwapPair(factory.getPair(assetA, assetB));
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (address token0, ) = assetA < assetB ? (assetA, assetB) : (assetB, assetA);
        (reserveA, reserveB) = assetA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _assertPairReservesMatchBalances(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, MockERC20(pair.token0()).balanceOf(address(pair)));
        assertEq(reserve1, MockERC20(pair.token1()).balanceOf(address(pair)));
    }

    function _trackedBalanceSum(MockERC20 token, address pair) private view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(traderA)
            + token.balanceOf(traderB)
            + token.balanceOf(recipientA)
            + token.balanceOf(recipientB)
            + token.balanceOf(pair)
            + token.balanceOf(treasury);
    }

    function _tokenPath(address from, address to) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = from;
        path[1] = to;
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
