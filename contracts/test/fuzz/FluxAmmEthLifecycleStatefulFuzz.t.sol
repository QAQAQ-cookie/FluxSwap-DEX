// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockWETH.sol";

contract FluxAmmEthLifecycleStatefulFuzzTest is Test {
    uint256 private constant MIN_TOKEN_LIQUIDITY = 1e12;
    uint256 private constant MAX_TOKEN_LIQUIDITY = 1e24;
    uint256 private constant MIN_ETH_LIQUIDITY = 1e10;
    uint256 private constant MAX_ETH_LIQUIDITY = 5e21;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant BPS_BASE = 10_000;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockERC20 private token;

    address private lpA;
    address private lpB;
    address private traderEthToToken;
    address private traderTokenToEth;
    address private recipientToken;
    address private recipientEth;
    address private treasury;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        traderEthToToken = makeAddr("traderEthToToken");
        traderTokenToEth = makeAddr("traderTokenToEth");
        recipientToken = makeAddr("recipientToken");
        recipientEth = makeAddr("recipientEth");
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
        token = new MockERC20("Token A", "TKNA", 18);
    }

    // 这一组 stateful fuzz 把 token-ETH 池的真实生命周期串起来：
    // 1. 首个 LP 建池，第二个 LP 再次 addLiquidityETH，且故意多付 ETH 以触发 refund。
    // 2. 做一笔 ETH -> token swap，让 treasury 以 WETH 形式沉淀协议费。
    // 3. 再做一笔 token -> ETH swap，让 treasury 继续沉淀 token 协议费。
    // 4. 第二个 LP 最后部分 removeLiquidityETH，验证 router 无 ETH/WETH/Token 残留，pair 储备持续自洽。
    function testFuzz_tokenEthLifecycle_preservesRefundsFeesAndReserves(
        uint96 rawInitialToken,
        uint96 rawInitialEth,
        uint16 rawShareBps,
        uint16 rawExtraEthBps,
        uint96 rawSwapEthIn,
        uint96 rawSwapTokenIn,
        uint16 rawRemoveShareBps
    ) public {
        uint256 initialToken = bound(uint256(rawInitialToken), MIN_TOKEN_LIQUIDITY, MAX_TOKEN_LIQUIDITY);
        uint256 initialEth = bound(uint256(rawInitialEth), MIN_ETH_LIQUIDITY, MAX_ETH_LIQUIDITY);

        factory.setTreasury(treasury);
        _seedEthPair(initialToken, initialEth);

        uint256 secondTokenDesired = _addSecondEthLiquidity(initialToken, initialEth, rawShareBps, rawExtraEthBps);
        (uint256 swapEthIn, uint256 tokenOut) = _swapExactEthForTokens(rawSwapEthIn);
        (uint256 swapTokenIn, uint256 ethOut) = _swapExactTokensForEth(rawSwapTokenIn);
        _removePartialEthLiquidity(rawRemoveShareBps);

        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(token), address(weth)));
        uint256 expectedTreasuryWeth = (swapEthIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        uint256 expectedTreasuryToken = (swapTokenIn * PROTOCOL_FEE_BPS) / BPS_BASE;

        assertEq(weth.balanceOf(treasury), expectedTreasuryWeth);
        assertEq(token.balanceOf(treasury), expectedTreasuryToken);
        assertEq(token.balanceOf(recipientToken), tokenOut);
        assertEq(recipientEth.balance, ethOut);
        assertEq(address(router).balance, 0);
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(router)), 0);

        _assertPairReservesMatchBalances(pair);

        uint256 totalMintedToken = initialToken + secondTokenDesired + swapTokenIn;
        assertEq(totalMintedToken, _trackedTokenBalanceSum(address(pair)));

        // 所有仍然存在的 WETH 只能留在 pair 或 treasury；被 withdraw 的部分会销毁 totalSupply。
        assertEq(weth.totalSupply(), weth.balanceOf(address(pair)) + weth.balanceOf(treasury));
    }

    function _seedEthPair(uint256 tokenAmount, uint256 ethAmount) private {
        token.mint(lpA, tokenAmount);
        vm.deal(lpA, ethAmount);

        vm.startPrank(lpA);
        token.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(token), tokenAmount, 0, 0, lpA, _deadline());
        vm.stopPrank();
    }

    function _addSecondEthLiquidity(
        uint256 initialToken,
        uint256 initialEth,
        uint16 rawShareBps,
        uint16 rawExtraEthBps
    ) private returns (uint256 secondTokenDesired) {
        uint256 shareBps = bound(uint256(rawShareBps), 1, 3_000);
        secondTokenDesired = (initialToken * shareBps) / BPS_BASE;
        vm.assume(secondTokenDesired > 0);

        uint256 secondEthOptimal = router.quote(secondTokenDesired, initialToken, initialEth);
        vm.assume(secondEthOptimal > 0);
        uint256 secondEthExtra = (secondEthOptimal * bound(uint256(rawExtraEthBps), 0, 5_000)) / BPS_BASE;
        uint256 secondEthSent = secondEthOptimal + secondEthExtra;

        token.mint(lpB, secondTokenDesired);
        vm.deal(lpB, secondEthSent);

        vm.startPrank(lpB);
        token.approve(address(router), type(uint256).max);
        uint256 lpBEthBefore = lpB.balance;
        (uint256 tokenUsed, uint256 ethUsed, uint256 mintedLp) =
            router.addLiquidityETH{value: secondEthSent}(address(token), secondTokenDesired, 0, 0, lpB, _deadline());
        vm.stopPrank();

        assertEq(tokenUsed, secondTokenDesired);
        assertEq(ethUsed, secondEthOptimal);
        assertEq(lpBEthBefore - lpB.balance, secondEthOptimal);
        assertGt(mintedLp, 0);
    }

    function _swapExactEthForTokens(uint96 rawSwapEthIn) private returns (uint256 swapEthIn, uint256 tokenOut) {
        (, uint256 reserveEth) = _orderedReserves();
        swapEthIn = bound(uint256(rawSwapEthIn), 2_000, (reserveEth / 20) + 1);

        vm.deal(traderEthToToken, swapEthIn);
        address[] memory path = _path(address(weth), address(token));
        uint256[] memory quoted = router.getAmountsOut(swapEthIn, path);
        vm.assume(quoted[1] > 0);

        vm.prank(traderEthToToken);
        uint256[] memory executed =
            router.swapExactETHForTokens{value: swapEthIn}(quoted[1], path, recipientToken, _deadline());

        assertEq(executed[0], swapEthIn);
        assertEq(executed[1], quoted[1]);
        return (swapEthIn, quoted[1]);
    }

    function _swapExactTokensForEth(uint96 rawSwapTokenIn) private returns (uint256 swapTokenIn, uint256 ethOut) {
        (uint256 reserveToken, ) = _orderedReserves();
        swapTokenIn = bound(uint256(rawSwapTokenIn), 2_000, (reserveToken / 20) + 1);

        token.mint(traderTokenToEth, swapTokenIn);
        vm.prank(traderTokenToEth);
        token.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(token), address(weth));
        uint256[] memory quoted = router.getAmountsOut(swapTokenIn, path);
        vm.assume(quoted[1] > 0);

        vm.prank(traderTokenToEth);
        uint256[] memory executed =
            router.swapExactTokensForETH(swapTokenIn, quoted[1], path, recipientEth, _deadline());

        assertEq(executed[0], swapTokenIn);
        assertEq(executed[1], quoted[1]);
        return (swapTokenIn, quoted[1]);
    }

    function _removePartialEthLiquidity(uint16 rawRemoveShareBps) private {
        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(token), address(weth)));
        uint256 removeShareBps = bound(uint256(rawRemoveShareBps), 1, 10_000);
        uint256 lpBBalance = pair.balanceOf(lpB);
        uint256 liquidityToRemove = (lpBBalance * removeShareBps) / BPS_BASE;
        vm.assume(liquidityToRemove > 0);

        vm.prank(lpB);
        pair.approve(address(router), type(uint256).max);

        vm.prank(lpB);
        router.removeLiquidityETH(address(token), liquidityToRemove, 0, 0, lpB, _deadline());
    }

    function _orderedReserves() private view returns (uint256 reserveToken, uint256 reserveEth) {
        FluxSwapPair pair = FluxSwapPair(factory.getPair(address(token), address(weth)));
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (address token0, ) = address(token) < address(weth) ? (address(token), address(weth)) : (address(weth), address(token));
        (reserveToken, reserveEth) = address(token) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _assertPairReservesMatchBalances(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, _pairTokenBalance(pair.token0(), address(pair)));
        assertEq(reserve1, _pairTokenBalance(pair.token1(), address(pair)));
    }

    function _pairTokenBalance(address asset, address pair) private view returns (uint256) {
        if (asset == address(weth)) {
            return weth.balanceOf(pair);
        }
        return token.balanceOf(pair);
    }

    function _trackedTokenBalanceSum(address pair) private view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(traderEthToToken)
            + token.balanceOf(traderTokenToEth)
            + token.balanceOf(recipientToken)
            + token.balanceOf(recipientEth)
            + token.balanceOf(pair)
            + token.balanceOf(treasury);
    }

    function _path(address from, address to) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = from;
        path[1] = to;
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
