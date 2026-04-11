// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSwapMixedAmmInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_TOKEN_AMOUNT = 1e24;
    uint256 private constant MAX_ETH_AMOUNT = 5e21;

    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable tokenPair;
    FluxSwapPair public immutable ethPair;
    MockERC20 public immutable tokenA;
    MockERC20 public immutable tokenB;
    MockWETH public immutable weth;

    address public immutable lpA;
    address public immutable lpB;
    address public immutable traderAForB;
    address public immutable traderBForA;
    address public immutable traderEthForA;
    address public immutable traderAForEth;
    address public immutable recipientToken;
    address public immutable recipientEth;
    address public immutable treasury;

    uint256 public totalMintedA;
    uint256 public totalMintedB;
    uint256 public expectedTreasuryA;
    uint256 public expectedTreasuryB;
    uint256 public expectedTreasuryWeth;

    constructor(
        FluxSwapRouter router_,
        address[2] memory pairAddresses,
        address[3] memory tokenAddresses,
        address[9] memory actors,
        uint256 initialMintedA,
        uint256 initialMintedB
    ) {
        router = router_;
        tokenPair = FluxSwapPair(pairAddresses[0]);
        ethPair = FluxSwapPair(pairAddresses[1]);
        tokenA = MockERC20(tokenAddresses[0]);
        tokenB = MockERC20(tokenAddresses[1]);
        weth = MockWETH(payable(tokenAddresses[2]));
        lpA = actors[0];
        lpB = actors[1];
        traderAForB = actors[2];
        traderBForA = actors[3];
        traderEthForA = actors[4];
        traderAForEth = actors[5];
        recipientToken = actors[6];
        recipientEth = actors[7];
        treasury = actors[8];
        totalMintedA = initialMintedA;
        totalMintedB = initialMintedB;
    }

    // 这一组动作把 token-token 和 token-ETH/WETH 两条主路径放进同一套 invariant：
    // 两个 Pair 共用 tokenA，同一个 Router 在多条路径之间来回切换，
    // 重点锁住“共享资产、多 Pair 混排”时的协议费、储备和资产守恒语义。
    function addLiquidityTokenPair(uint8 actorSeed, uint256 rawAmountA, uint256 rawAmountB) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        uint256 amountA = bound(rawAmountA, 1, MAX_TOKEN_AMOUNT);
        uint256 amountB = bound(rawAmountB, 1, MAX_TOKEN_AMOUNT);

        tokenA.mint(actor, amountA);
        tokenB.mint(actor, amountB);
        totalMintedA += amountA;
        totalMintedB += amountB;

        vm.startPrank(actor);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function addLiquidityEthPair(uint8 actorSeed, uint256 rawAmountA, uint256 rawEthAmount) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        uint256 amountA = bound(rawAmountA, 1, MAX_TOKEN_AMOUNT);
        uint256 ethAmount = bound(rawEthAmount, 1, MAX_ETH_AMOUNT);

        tokenA.mint(actor, amountA);
        totalMintedA += amountA;
        vm.deal(actor, actor.balance + ethAmount);

        vm.startPrank(actor);
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(tokenA), amountA, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function swapAForB(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _orderedReserves(tokenPair, address(tokenA), address(tokenB));
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        tokenA.mint(traderAForB, amountIn);
        totalMintedA += amountIn;

        vm.prank(traderAForB);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderAForB);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientToken, _deadline());

        expectedTreasuryA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapBForA(uint256 rawAmountIn) external {
        (, uint256 reserveB) = _orderedReserves(tokenPair, address(tokenA), address(tokenB));
        uint256 amountIn = bound(rawAmountIn, 1, (reserveB / 20) + 1);

        tokenB.mint(traderBForA, amountIn);
        totalMintedB += amountIn;

        vm.prank(traderBForA);
        tokenB.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(tokenB), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderBForA);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientToken, _deadline());

        expectedTreasuryB += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapEthForA(uint256 rawEthAmount) external {
        (, uint256 reserveEth) = _orderedReserves(ethPair, address(tokenA), address(weth));
        uint256 ethAmount = bound(rawEthAmount, 1, (reserveEth / 20) + 1);

        vm.deal(traderEthForA, traderEthForA.balance + ethAmount);

        address[] memory path = _path(address(weth), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(ethAmount, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderEthForA);
        router.swapExactETHForTokens{value: ethAmount}(amounts[1], path, recipientToken, _deadline());

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapAForEth(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _orderedReserves(ethPair, address(tokenA), address(weth));
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        tokenA.mint(traderAForEth, amountIn);
        totalMintedA += amountIn;

        vm.prank(traderAForEth);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(tokenA), address(weth));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderAForEth);
        router.swapExactTokensForETH(amountIn, amounts[1], path, recipientEth, _deadline());

        expectedTreasuryA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function removeLiquidityTokenPair(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        _removeLiquidity(tokenPair, actor, rawShareBps, false);
    }

    function removeLiquidityEthPair(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        _removeLiquidity(ethPair, actor, rawShareBps, true);
    }

    function trackedTokenASum() external view returns (uint256) {
        return _trackedTokenSum(tokenA);
    }

    function trackedTokenBSum() external view returns (uint256) {
        return _trackedTokenSum(tokenB);
    }

    function trackedTokenLpSupply() external view returns (uint256) {
        return _trackedLpSupply(tokenPair);
    }

    function trackedEthLpSupply() external view returns (uint256) {
        return _trackedLpSupply(ethPair);
    }

    function _removeLiquidity(FluxSwapPair pair, address actor, uint16 rawShareBps, bool isEthPair) private {
        uint256 lpBalance = pair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        pair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        if (isEthPair) {
            router.removeLiquidityETH(address(tokenA), liquidityToRemove, 0, 0, actor, _deadline());
        } else {
            router.removeLiquidity(address(tokenA), address(tokenB), liquidityToRemove, 0, 0, actor, _deadline());
        }
    }

    function _trackedTokenSum(MockERC20 token) private view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(traderAForB)
            + token.balanceOf(traderBForA)
            + token.balanceOf(traderEthForA)
            + token.balanceOf(traderAForEth)
            + token.balanceOf(recipientToken)
            + token.balanceOf(recipientEth)
            + token.balanceOf(treasury)
            + token.balanceOf(address(router))
            + token.balanceOf(address(tokenPair))
            + token.balanceOf(address(ethPair));
    }

    function _trackedLpSupply(FluxSwapPair pair) private view returns (uint256) {
        return pair.balanceOf(lpA) + pair.balanceOf(lpB) + pair.balanceOf(address(0)) + pair.balanceOf(address(router));
    }

    function _orderedReserves(FluxSwapPair pair, address assetA, address assetB)
        private
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (reserveA, reserveB) = pair.token0() == assetA ? (reserve0, reserve1) : (reserve1, reserve0);
        require(pair.token0() == assetA || pair.token1() == assetA, "INVALID_ASSET_A");
        require(pair.token0() == assetB || pair.token1() == assetB, "INVALID_ASSET_B");
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

contract FluxSwapMixedAmmInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    FluxSwapPair private tokenPair;
    FluxSwapPair private ethPair;
    FluxSwapMixedAmmInvariantHandler private handler;

    address private lpA;
    address private lpB;
    address private traderAForB;
    address private traderBForA;
    address private traderEthForA;
    address private traderAForEth;
    address private recipientToken;
    address private recipientEth;
    address private treasury;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        traderAForB = makeAddr("traderAForB");
        traderBForA = makeAddr("traderBForA");
        traderEthForA = makeAddr("traderEthForA");
        traderAForEth = makeAddr("traderAForEth");
        recipientToken = makeAddr("recipientToken");
        recipientEth = makeAddr("recipientEth");
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), address(weth));

        tokenA = new MockERC20("Shared Token A", "STKA", 18);
        tokenB = new MockERC20("Quote Token B", "QTKB", 18);

        tokenPair = _seedTokenPair(6e18, 11e18, lpA);
        ethPair = _seedEthPair(8e18, 4e18, lpA);

        address[2] memory pairAddresses = [address(tokenPair), address(ethPair)];
        address[3] memory tokenAddresses = [address(tokenA), address(tokenB), address(weth)];
        address[9] memory actors = [
            lpA,
            lpB,
            traderAForB,
            traderBForA,
            traderEthForA,
            traderAForEth,
            recipientToken,
            recipientEth,
            treasury
        ];

        handler = new FluxSwapMixedAmmInvariantHandler(router, pairAddresses, tokenAddresses, actors, 14e18, 11e18);

        targetContract(address(handler));
    }

    // 不变量 1：共享 tokenA 的两个 Pair 记录的 reserve 都必须始终和真实余额同步。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(tokenPair);
        _assertPairReserves(ethPair);
    }

    // 不变量 2：同一个 Router 在 token-token 与 token-ETH 混排路径里都不得残留资产。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(address(router).balance, 0);
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(tokenPair.balanceOf(address(router)), 0);
        assertEq(ethPair.balanceOf(address(router)), 0);
    }

    // 不变量 3：三类协议费余额必须和两条主路径的成功 swap 输入累计严格一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(tokenA.balanceOf(treasury), handler.expectedTreasuryA());
        assertEq(tokenB.balanceOf(treasury), handler.expectedTreasuryB());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 4：共享 tokenA 与独立 tokenB 的总量都必须能被两个 Pair + 参与账户完整解释。
    function invariant_underlyingTokenConservation() public view {
        assertEq(tokenA.totalSupply(), handler.trackedTokenASum());
        assertEq(tokenB.totalSupply(), handler.trackedTokenBSum());
        assertEq(tokenA.totalSupply(), handler.totalMintedA());
        assertEq(tokenB.totalSupply(), handler.totalMintedB());
    }

    // 不变量 5：WETH 总供应量只能由 ethPair + treasury + router 中的余额解释。
    function invariant_wethSupplyClosesToObservedBalances() public view {
        assertEq(weth.totalSupply(), weth.balanceOf(address(ethPair)) + weth.balanceOf(treasury) + weth.balanceOf(address(router)));
    }

    // 不变量 6：两个 Pair 的 LP 总供应量都必须由 LP 持仓 + address(0) 完整解释。
    function invariant_lpSupplyAccountingCloses() public view {
        assertEq(tokenPair.totalSupply(), handler.trackedTokenLpSupply());
        assertEq(ethPair.totalSupply(), handler.trackedEthLpSupply());
    }

    function _seedTokenPair(uint256 amountA, uint256 amountB, address lp) private returns (FluxSwapPair pair) {
        factory.createPair(address(tokenA), address(tokenB));
        address pairAddress = factory.getPair(address(tokenA), address(tokenB));

        tokenA.mint(lp, amountA);
        tokenB.mint(lp, amountB);

        vm.startPrank(lp);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, lp, block.timestamp + 1 hours);
        vm.stopPrank();

        pair = FluxSwapPair(pairAddress);
    }

    function _seedEthPair(uint256 amountA, uint256 ethAmount, address lp) private returns (FluxSwapPair pair) {
        factory.createPair(address(tokenA), address(weth));
        address pairAddress = factory.getPair(address(tokenA), address(weth));

        tokenA.mint(lp, amountA);
        vm.deal(lp, ethAmount);

        vm.startPrank(lp);
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(tokenA), amountA, 0, 0, lp, block.timestamp + 1 hours);
        vm.stopPrank();

        pair = FluxSwapPair(pairAddress);
    }

    function _assertPairReserves(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, _assetBalance(pair.token0(), pair));
        assertEq(reserve1, _assetBalance(pair.token1(), pair));
    }

    function _assetBalance(address asset, FluxSwapPair pair) private view returns (uint256) {
        if (asset == address(tokenA)) {
            return tokenA.balanceOf(address(pair));
        }
        if (asset == address(tokenB)) {
            return tokenB.balanceOf(address(pair));
        }
        return weth.balanceOf(address(pair));
    }
}
