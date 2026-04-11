// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxSwapAmmInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxSwapFactory public immutable factory;
    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable pair;
    MockERC20 public immutable tokenA;
    MockERC20 public immutable tokenB;

    address public immutable lpA;
    address public immutable lpB;
    address public immutable traderA;
    address public immutable traderB;
    address public immutable recipientA;
    address public immutable recipientB;
    address public immutable treasury;

    uint256 public totalMintedA;
    uint256 public totalMintedB;
    uint256 public expectedTreasuryA;
    uint256 public expectedTreasuryB;

    constructor(
        FluxSwapFactory factory_,
        FluxSwapRouter router_,
        FluxSwapPair pair_,
        MockERC20 tokenA_,
        MockERC20 tokenB_,
        address lpA_,
        address lpB_,
        address traderA_,
        address traderB_,
        address recipientA_,
        address recipientB_,
        address treasury_
    ) {
        factory = factory_;
        router = router_;
        pair = pair_;
        tokenA = tokenA_;
        tokenB = tokenB_;
        lpA = lpA_;
        lpB = lpB_;
        traderA = traderA_;
        traderB = traderB_;
        recipientA = recipientA_;
        recipientB = recipientB_;
        treasury = treasury_;
    }

    function seedInitialLiquidity(uint256 amountA, uint256 amountB) external {
        if (pair.totalSupply() != 0) {
            return;
        }

        uint256 boundedA = bound(amountA, 1e12, MAX_AMOUNT);
        uint256 boundedB = bound(amountB, 1e12, MAX_AMOUNT);
        _mintTo(lpA, boundedA, boundedB);

        vm.startPrank(lpA);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), boundedA, boundedB, 0, 0, lpA, _deadline());
        vm.stopPrank();
    }

    function addLiquidity(uint8 actorSeed, uint256 rawAmountA, uint256 rawAmountB) external {
        uint256 amountA = bound(rawAmountA, 1, MAX_AMOUNT);
        uint256 amountB = bound(rawAmountB, 1, MAX_AMOUNT);
        address actor = actorSeed % 2 == 0 ? lpA : lpB;

        _mintTo(actor, amountA, amountB);

        vm.startPrank(actor);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function swapAForB(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _orderedReserves();
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        tokenA.mint(traderA, amountIn);
        totalMintedA += amountIn;

        vm.prank(traderA);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(traderA);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientA, _deadline());

        expectedTreasuryA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapBForA(uint256 rawAmountIn) external {
        (, uint256 reserveB) = _orderedReserves();
        uint256 amountIn = bound(rawAmountIn, 1, (reserveB / 20) + 1);

        tokenB.mint(traderB, amountIn);
        totalMintedB += amountIn;

        vm.prank(traderB);
        tokenB.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(tokenB), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(traderB);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientB, _deadline());

        expectedTreasuryB += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function removeLiquidity(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
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
        router.removeLiquidity(address(tokenA), address(tokenB), liquidityToRemove, 0, 0, actor, _deadline());
    }

    function trackedTokenSum(MockERC20 token) external view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(traderA)
            + token.balanceOf(traderB)
            + token.balanceOf(recipientA)
            + token.balanceOf(recipientB)
            + token.balanceOf(address(pair))
            + token.balanceOf(treasury)
            + token.balanceOf(address(router));
    }

    function trackedLpSupply() external view returns (uint256) {
        return pair.balanceOf(lpA) + pair.balanceOf(lpB) + pair.balanceOf(address(0)) + pair.balanceOf(address(router));
    }

    function _mintTo(address to, uint256 amountA, uint256 amountB) private {
        tokenA.mint(to, amountA);
        tokenB.mint(to, amountB);
        totalMintedA += amountA;
        totalMintedB += amountB;
    }

    function _orderedReserves() private view returns (uint256 reserveA, uint256 reserveB) {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (reserveA, reserveB) = address(tokenA) == pair.token0() ? (reserve0, reserve1) : (reserve1, reserve0);
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

contract FluxSwapAmmInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    FluxSwapPair private pair;
    FluxSwapAmmInvariantHandler private handler;

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
        factory.setTreasury(treasury);

        router = new FluxSwapRouter(address(factory), makeAddr("unusedWeth"));
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        factory.createPair(address(tokenA), address(tokenB));
        pair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));

        handler = new FluxSwapAmmInvariantHandler(
            factory,
            router,
            pair,
            tokenA,
            tokenB,
            lpA,
            lpB,
            traderA,
            traderB,
            recipientA,
            recipientB,
            treasury
        );

        handler.seedInitialLiquidity(1e18, 2e18);
        targetContract(address(handler));
    }

    // 不变量 1：Pair 记录的 reserve 必须始终与 Pair 当前真实 token 余额一致。
    function invariant_pairReservesMatchObservedBalances() public view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, tokenBalance(pair.token0()));
        assertEq(reserve1, tokenBalance(pair.token1()));
    }

    // 不变量 2：Router 不得残留底层 token 或 LP token。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertEq(pair.balanceOf(address(router)), 0);
    }

    // 不变量 3：协议费必须严格等于成功 swap 输入额按 5 / 10000 计提后的累计值。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(tokenA.balanceOf(treasury), handler.expectedTreasuryA());
        assertEq(tokenB.balanceOf(treasury), handler.expectedTreasuryB());
    }

    // 不变量 4：两种底层 token 的总量都必须能被已跟踪账户 + Pair + Treasury + Router 完整解释。
    function invariant_underlyingTokenConservation() public view {
        assertEq(tokenA.totalSupply(), handler.trackedTokenSum(tokenA));
        assertEq(tokenB.totalSupply(), handler.trackedTokenSum(tokenB));
        assertEq(tokenA.totalSupply(), handler.totalMintedA());
        assertEq(tokenB.totalSupply(), handler.totalMintedB());
    }

    // 不变量 5：LP 份额总量必须由 lpA / lpB / address(0) 三处完整解释，不能凭空残留在别处。
    function invariant_lpSupplyAccountingCloses() public view {
        assertEq(pair.totalSupply(), handler.trackedLpSupply());
    }

    function tokenBalance(address asset) private view returns (uint256) {
        return asset == address(tokenA) ? tokenA.balanceOf(address(pair)) : tokenB.balanceOf(address(pair));
    }
}
