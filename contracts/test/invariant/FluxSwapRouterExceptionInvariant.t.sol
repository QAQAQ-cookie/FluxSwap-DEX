// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSwapRouterExceptionInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_TOKEN_AMOUNT = 1e24;
    uint256 private constant MAX_ETH_AMOUNT = 5e21;

    struct TokenPairSnapshot {
        uint112 reserve0;
        uint112 reserve1;
        uint256 traderTokenA;
        uint256 traderTokenB;
        uint256 recipientTokenA;
        uint256 recipientTokenB;
        uint256 treasuryTokenA;
        uint256 treasuryTokenB;
        uint256 routerTokenA;
        uint256 routerTokenB;
        uint256 routerLp;
    }

    struct EthPairSnapshot {
        uint112 reserve0;
        uint112 reserve1;
        uint256 traderTokenA;
        uint256 traderEth;
        uint256 recipientTokenA;
        uint256 recipientEth;
        uint256 treasuryTokenA;
        uint256 treasuryWeth;
        uint256 routerTokenA;
        uint256 routerWeth;
        uint256 routerEth;
        uint256 routerLp;
    }

    FluxSwapFactory public immutable factory;
    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable tokenPair;
    FluxSwapPair public immutable tokenWethPair;
    MockERC20 public immutable tokenA;
    MockERC20 public immutable tokenB;
    MockERC20 public immutable tokenC;
    MockWETH public immutable weth;

    address public immutable lpA;
    address public immutable lpB;
    address public immutable trader;
    address public immutable recipient;
    address public immutable treasury;

    uint256 public totalMintedTokenA;
    uint256 public totalMintedTokenB;
    uint256 public expectedTreasuryTokenA;
    uint256 public expectedTreasuryTokenB;
    uint256 public expectedTreasuryWeth;

    constructor(
        FluxSwapFactory factory_,
        FluxSwapRouter router_,
        FluxSwapPair tokenPair_,
        FluxSwapPair tokenWethPair_,
        MockERC20 tokenA_,
        MockERC20 tokenB_,
        MockERC20 tokenC_,
        MockWETH weth_,
        address treasury_
    ) {
        factory = factory_;
        router = router_;
        tokenPair = tokenPair_;
        tokenWethPair = tokenWethPair_;
        tokenA = tokenA_;
        tokenB = tokenB_;
        tokenC = tokenC_;
        weth = weth_;
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");
        treasury = treasury_;
    }

    // 先建立一个稳定初始状态，后续 invariant 的重点是：
    // 在成功路径和失败路径长序列混排时，成功动作照常改状态，失败动作不能把状态污染坏。
    function seedInitialLiquidity(uint256 amountABase, uint256 amountBQuote, uint256 amountAEth, uint256 wethAmount)
        external
    {
        if (tokenPair.totalSupply() != 0 || tokenWethPair.totalSupply() != 0) {
            return;
        }

        uint256 boundedABase = bound(amountABase, 1e12, MAX_TOKEN_AMOUNT);
        uint256 boundedBQuote = bound(amountBQuote, 1e12, MAX_TOKEN_AMOUNT);
        uint256 boundedAEth = bound(amountAEth, 1e12, MAX_TOKEN_AMOUNT);
        uint256 boundedWeth = bound(wethAmount, 1e10, MAX_ETH_AMOUNT);

        _mintTokenA(lpA, boundedABase + boundedAEth);
        _mintTokenB(lpA, boundedBQuote);

        vm.deal(lpA, boundedWeth);

        vm.startPrank(lpA);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), boundedABase, boundedBQuote, 0, 0, lpA, _deadline());
        router.addLiquidityETH{value: boundedWeth}(address(tokenA), boundedAEth, 0, 0, lpA, _deadline());
        vm.stopPrank();
    }

    function addTokenPairLiquidity(uint8 actorSeed, uint256 rawAmountA, uint256 rawAmountB) external {
        address actor = _lp(actorSeed);
        uint256 amountA = bound(rawAmountA, 1, MAX_TOKEN_AMOUNT);
        uint256 amountB = bound(rawAmountB, 1, MAX_TOKEN_AMOUNT);

        _mintTokenA(actor, amountA);
        _mintTokenB(actor, amountB);

        vm.startPrank(actor);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function addTokenWethLiquidity(uint8 actorSeed, uint256 rawAmountA, uint256 rawEthAmount) external {
        address actor = _lp(actorSeed);
        uint256 amountA = bound(rawAmountA, 1, MAX_TOKEN_AMOUNT);
        uint256 ethAmount = bound(rawEthAmount, 1, MAX_ETH_AMOUNT);

        _mintTokenA(actor, amountA);
        vm.deal(actor, actor.balance + ethAmount);

        vm.startPrank(actor);
        tokenA.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(tokenA), amountA, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function swapTokenAToTokenB(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        _mintTokenA(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenA), address(tokenB));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryTokenA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapTokenBToTokenA(uint256 rawAmountIn) external {
        (uint256 reserveB, ) = _reservesFor(address(tokenB), address(tokenA), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveB / 20) + 1);

        _mintTokenB(trader, amountIn);
        vm.prank(trader);
        tokenB.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenB), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryTokenB += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapEthToTokenA(uint256 rawEthAmount) external {
        (uint256 reserveWeth, ) = _reservesFor(address(weth), address(tokenA), tokenWethPair);
        uint256 ethAmount = bound(rawEthAmount, 1, (reserveWeth / 20) + 1);

        vm.deal(trader, trader.balance + ethAmount);

        address[] memory path = _twoHopPath(address(weth), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(ethAmount, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactETHForTokens{value: ethAmount}(amounts[1], path, recipient, _deadline());

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapTokenAToEth(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(weth), tokenWethPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        _mintTokenA(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenA), address(weth));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        vm.assume(amounts[1] > 0);

        vm.prank(trader);
        router.swapExactTokensForETH(amountIn, amounts[1], path, recipient, _deadline());

        expectedTreasuryTokenA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function removeTokenPairLiquidity(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = _lp(actorSeed);
        uint256 lpBalance = tokenPair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        tokenPair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        router.removeLiquidity(address(tokenA), address(tokenB), liquidityToRemove, 0, 0, actor, _deadline());
    }

    function removeTokenWethLiquidity(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = _lp(actorSeed);
        uint256 lpBalance = tokenWethPair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        tokenWethPair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        router.removeLiquidityETH(address(tokenA), liquidityToRemove, 0, 0, actor, _deadline());
    }

    // 这类失败动作会在随机长序列里反复插入。
    // 这里不仅要求命中预期 revert，还要求失败后关键状态和余额都完全不变。
    function failExpiredTokenSwap(uint256 rawAmountIn, uint32 rawWarp) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);
        uint256 deadline = block.timestamp + bound(uint256(rawWarp), 1, 30 days);

        _mintTokenA(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();
        vm.warp(deadline + 1);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXPIRED"));
        router.swapExactTokensForTokens(amountIn, 0, _twoHopPath(address(tokenA), address(tokenB)), recipient, deadline);

        _assertTokenPairSnapshot(snapshot);
    }

    function failHighMinOut(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        _mintTokenA(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, _twoHopPath(address(tokenA), address(tokenB)));
        vm.assume(amounts[1] > 0);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(
            amountIn, amounts[1] + 1, _twoHopPath(address(tokenA), address(tokenB)), recipient, _deadline()
        );

        _assertTokenPairSnapshot(snapshot);
    }

    function failLowMaxIn(uint256 rawAmountOut) external {
        (, uint256 reserveB) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountOut = bound(rawAmountOut, 1, (reserveB / 20) + 1);

        uint256[] memory amounts = router.getAmountsIn(amountOut, _twoHopPath(address(tokenA), address(tokenB)));
        vm.assume(amounts[0] > 1);

        _mintTokenA(trader, amounts[0]);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(
            amountOut, amounts[0] - 1, _twoHopPath(address(tokenA), address(tokenB)), recipient, _deadline()
        );

        _assertTokenPairSnapshot(snapshot);
    }

    function failMissingPair(uint256 rawAmountIn) external {
        uint256 amountIn = bound(rawAmountIn, 1, MAX_TOKEN_AMOUNT);

        _mintTokenB(trader, amountIn);
        vm.prank(trader);
        tokenB.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: PAIR_NOT_FOUND"));
        router.swapExactTokensForTokens(amountIn, 0, _twoHopPath(address(tokenB), address(tokenC)), recipient, _deadline());

        _assertTokenPairSnapshot(snapshot);
    }

    function failInvalidSupportingPath(uint256 rawAmountIn) external {
        uint256 amountIn = bound(rawAmountIn, 1, MAX_TOKEN_AMOUNT);

        _mintTokenA(trader, amountIn);
        vm.prank(trader);
        tokenA.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();
        address[] memory invalidPath = new address[](1);
        invalidPath[0] = address(tokenA);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, invalidPath, recipient, _deadline());

        _assertTokenPairSnapshot(snapshot);
    }

    function failInvalidEthPath(uint256 rawEthAmount) external {
        uint256 ethAmount = bound(rawEthAmount, 1, MAX_ETH_AMOUNT);
        vm.deal(trader, trader.balance + ethAmount);

        EthPairSnapshot memory snapshot = _ethPairSnapshot();
        address[] memory invalidPath = _twoHopPath(address(tokenA), address(tokenB));

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactETHForTokens{value: ethAmount}(1, invalidPath, recipient, _deadline());

        _assertEthPairSnapshot(snapshot);
    }

    function failUnderfundedExactEthOut(uint256 rawAmountOut) external {
        (, uint256 reserveTokenA) = _reservesFor(address(weth), address(tokenA), tokenWethPair);
        uint256 amountOut = bound(rawAmountOut, 1, (reserveTokenA / 20) + 1);
        uint256[] memory amounts = router.getAmountsIn(amountOut, _twoHopPath(address(weth), address(tokenA)));
        vm.assume(amounts[0] > 1);

        vm.deal(trader, trader.balance + amounts[0] - 1);

        EthPairSnapshot memory snapshot = _ethPairSnapshot();

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapETHForExactTokens{value: amounts[0] - 1}(
            amountOut, _twoHopPath(address(weth), address(tokenA)), recipient, _deadline()
        );

        _assertEthPairSnapshot(snapshot);
    }

    function failAddLiquidityMinConstraint(uint16 rawShareBps) external {
        (uint256 reserveA, uint256 reserveB) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 shareBps = bound(uint256(rawShareBps), 1, 2_000);
        uint256 desiredA = (reserveA * shareBps) / BPS_BASE;
        if (desiredA == 0) {
            return;
        }

        uint256 optimalB = router.quote(desiredA, reserveA, reserveB);
        if (optimalB == 0) {
            return;
        }
        uint256 desiredB = optimalB + 1;

        _mintTokenA(lpB, desiredA);
        _mintTokenB(lpB, desiredB);

        vm.startPrank(lpB);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_B_AMOUNT"));
        router.addLiquidity(address(tokenA), address(tokenB), desiredA, desiredB, desiredA, desiredB, lpB, _deadline());
        vm.stopPrank();

        _assertTokenPairSnapshot(snapshot);
    }

    function failRemoveLiquidityMinConstraint(uint16 rawShareBps) external {
        uint256 lpBalance = tokenPair.balanceOf(lpA);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        uint256 pairBalanceA = tokenA.balanceOf(address(tokenPair));
        uint256 pairBalanceB = tokenB.balanceOf(address(tokenPair));
        uint256 totalSupply = tokenPair.totalSupply();
        uint256 expectedA = (liquidityToRemove * pairBalanceA) / totalSupply;
        uint256 expectedB = (liquidityToRemove * pairBalanceB) / totalSupply;
        if (expectedA == 0 || expectedB == 0) {
            return;
        }

        vm.prank(lpA);
        tokenPair.approve(address(router), type(uint256).max);

        TokenPairSnapshot memory snapshot = _tokenPairSnapshot();

        vm.prank(lpA);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_A_AMOUNT"));
        router.removeLiquidity(
            address(tokenA), address(tokenB), liquidityToRemove, expectedA + 1, expectedB, recipient, _deadline()
        );

        _assertTokenPairSnapshot(snapshot);
    }

    function trackedTokenASum() external view returns (uint256) {
        return tokenA.balanceOf(lpA)
            + tokenA.balanceOf(lpB)
            + tokenA.balanceOf(trader)
            + tokenA.balanceOf(recipient)
            + tokenA.balanceOf(address(tokenPair))
            + tokenA.balanceOf(address(tokenWethPair))
            + tokenA.balanceOf(treasury)
            + tokenA.balanceOf(address(router));
    }

    function trackedTokenBSum() external view returns (uint256) {
        return tokenB.balanceOf(lpA)
            + tokenB.balanceOf(lpB)
            + tokenB.balanceOf(trader)
            + tokenB.balanceOf(recipient)
            + tokenB.balanceOf(address(tokenPair))
            + tokenB.balanceOf(treasury)
            + tokenB.balanceOf(address(router));
    }

    function trackedTokenPairLpSupply() external view returns (uint256) {
        return tokenPair.balanceOf(lpA) + tokenPair.balanceOf(lpB) + tokenPair.balanceOf(address(0))
            + tokenPair.balanceOf(address(router));
    }

    function trackedTokenWethPairLpSupply() external view returns (uint256) {
        return tokenWethPair.balanceOf(lpA) + tokenWethPair.balanceOf(lpB) + tokenWethPair.balanceOf(address(0))
            + tokenWethPair.balanceOf(address(router));
    }

    function _mintTokenA(address to, uint256 amount) private {
        tokenA.mint(to, amount);
        totalMintedTokenA += amount;
    }

    function _mintTokenB(address to, uint256 amount) private {
        tokenB.mint(to, amount);
        totalMintedTokenB += amount;
    }

    function _lp(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? lpA : lpB;
    }

    function _tokenPairSnapshot() private view returns (TokenPairSnapshot memory snapshot) {
        (snapshot.reserve0, snapshot.reserve1, ) = tokenPair.getReserves();
        snapshot.traderTokenA = tokenA.balanceOf(trader);
        snapshot.traderTokenB = tokenB.balanceOf(trader);
        snapshot.recipientTokenA = tokenA.balanceOf(recipient);
        snapshot.recipientTokenB = tokenB.balanceOf(recipient);
        snapshot.treasuryTokenA = tokenA.balanceOf(treasury);
        snapshot.treasuryTokenB = tokenB.balanceOf(treasury);
        snapshot.routerTokenA = tokenA.balanceOf(address(router));
        snapshot.routerTokenB = tokenB.balanceOf(address(router));
        snapshot.routerLp = tokenPair.balanceOf(address(router));
    }

    function _assertTokenPairSnapshot(TokenPairSnapshot memory snapshot) private view {
        (uint112 reserve0, uint112 reserve1, ) = tokenPair.getReserves();
        assertEq(reserve0, snapshot.reserve0);
        assertEq(reserve1, snapshot.reserve1);
        assertEq(tokenA.balanceOf(trader), snapshot.traderTokenA);
        assertEq(tokenB.balanceOf(trader), snapshot.traderTokenB);
        assertEq(tokenA.balanceOf(recipient), snapshot.recipientTokenA);
        assertEq(tokenB.balanceOf(recipient), snapshot.recipientTokenB);
        assertEq(tokenA.balanceOf(treasury), snapshot.treasuryTokenA);
        assertEq(tokenB.balanceOf(treasury), snapshot.treasuryTokenB);
        assertEq(tokenA.balanceOf(address(router)), snapshot.routerTokenA);
        assertEq(tokenB.balanceOf(address(router)), snapshot.routerTokenB);
        assertEq(tokenPair.balanceOf(address(router)), snapshot.routerLp);
    }

    function _ethPairSnapshot() private view returns (EthPairSnapshot memory snapshot) {
        (snapshot.reserve0, snapshot.reserve1, ) = tokenWethPair.getReserves();
        snapshot.traderTokenA = tokenA.balanceOf(trader);
        snapshot.traderEth = trader.balance;
        snapshot.recipientTokenA = tokenA.balanceOf(recipient);
        snapshot.recipientEth = recipient.balance;
        snapshot.treasuryTokenA = tokenA.balanceOf(treasury);
        snapshot.treasuryWeth = weth.balanceOf(treasury);
        snapshot.routerTokenA = tokenA.balanceOf(address(router));
        snapshot.routerWeth = weth.balanceOf(address(router));
        snapshot.routerEth = address(router).balance;
        snapshot.routerLp = tokenWethPair.balanceOf(address(router));
    }

    function _assertEthPairSnapshot(EthPairSnapshot memory snapshot) private view {
        (uint112 reserve0, uint112 reserve1, ) = tokenWethPair.getReserves();
        assertEq(reserve0, snapshot.reserve0);
        assertEq(reserve1, snapshot.reserve1);
        assertEq(tokenA.balanceOf(trader), snapshot.traderTokenA);
        assertEq(trader.balance, snapshot.traderEth);
        assertEq(tokenA.balanceOf(recipient), snapshot.recipientTokenA);
        assertEq(recipient.balance, snapshot.recipientEth);
        assertEq(tokenA.balanceOf(treasury), snapshot.treasuryTokenA);
        assertEq(weth.balanceOf(treasury), snapshot.treasuryWeth);
        assertEq(tokenA.balanceOf(address(router)), snapshot.routerTokenA);
        assertEq(weth.balanceOf(address(router)), snapshot.routerWeth);
        assertEq(address(router).balance, snapshot.routerEth);
        assertEq(tokenWethPair.balanceOf(address(router)), snapshot.routerLp);
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

    function _twoHopPath(address tokenIn, address tokenOut) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}

contract FluxSwapRouterExceptionInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    MockERC20 private tokenC;
    MockWETH private weth;
    FluxSwapPair private tokenPair;
    FluxSwapPair private tokenWethPair;
    FluxSwapRouterExceptionInvariantHandler private handler;

    address private treasury;

    function setUp() public {
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);

        router = new FluxSwapRouter(address(factory), address(weth));
        tokenA = new MockERC20("Router Exception Invariant A", "REIA", 18);
        tokenB = new MockERC20("Router Exception Invariant B", "REIB", 18);
        tokenC = new MockERC20("Router Exception Invariant C", "REIC", 18);

        factory.createPair(address(tokenA), address(tokenB));
        tokenPair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
        factory.createPair(address(tokenA), address(weth));
        tokenWethPair = FluxSwapPair(factory.getPair(address(tokenA), address(weth)));

        handler = new FluxSwapRouterExceptionInvariantHandler(
            factory, router, tokenPair, tokenWethPair, tokenA, tokenB, tokenC, weth, treasury
        );

        handler.seedInitialLiquidity(8e18, 11e18, 7e18, 4e18);
        targetContract(address(handler));
    }

    // 不变量 1：token-token Pair 的 reserve 必须始终和真实余额一致。
    function invariant_tokenPairReservesMatchObservedBalances() public view {
        _assertPairReserves(tokenPair);
    }

    // 不变量 2：token-WETH Pair 的 reserve 必须始终和真实余额一致。
    function invariant_tokenWethPairReservesMatchObservedBalances() public view {
        _assertPairReserves(tokenWethPair);
    }

    // 不变量 3：不管成功路径和失败路径如何混排，Router 都不得残留资产。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertEq(tokenC.balanceOf(address(router)), 0);
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
        assertEq(tokenPair.balanceOf(address(router)), 0);
        assertEq(tokenWethPair.balanceOf(address(router)), 0);
    }

    // 不变量 4：Treasury 的协议费余额必须始终等于成功 swap 路径累积出来的模型值。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(tokenA.balanceOf(treasury), handler.expectedTreasuryTokenA());
        assertEq(tokenB.balanceOf(treasury), handler.expectedTreasuryTokenB());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 5：tokenA / tokenB 的总量必须始终能被已跟踪账户 + Pair + Treasury + Router 完整解释。
    function invariant_underlyingTokenConservation() public view {
        assertEq(tokenA.totalSupply(), handler.trackedTokenASum());
        assertEq(tokenB.totalSupply(), handler.trackedTokenBSum());
        assertEq(tokenA.totalSupply(), handler.totalMintedTokenA());
        assertEq(tokenB.totalSupply(), handler.totalMintedTokenB());
    }

    // 不变量 6：WETH 总供应量只能由 Pair + Treasury + Router 中的 WETH 余额解释。
    function invariant_wethSupplyClosesToObservedBalances() public view {
        assertEq(
            weth.totalSupply(),
            weth.balanceOf(address(tokenWethPair)) + weth.balanceOf(treasury) + weth.balanceOf(address(router))
        );
    }

    // 不变量 7：两个 Pair 的 LP 总供应量都必须闭合到 LP 持仓 + address(0) + Router。
    function invariant_lpSupplyAccountingCloses() public view {
        assertEq(tokenPair.totalSupply(), handler.trackedTokenPairLpSupply());
        assertEq(tokenWethPair.totalSupply(), handler.trackedTokenWethPairLpSupply());
    }

    function _assertPairReserves(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, _assetBalance(pair.token0(), address(pair)));
        assertEq(reserve1, _assetBalance(pair.token1(), address(pair)));
    }

    function _assetBalance(address asset, address owner) private view returns (uint256) {
        if (asset == address(tokenA)) {
            return tokenA.balanceOf(owner);
        }
        if (asset == address(tokenB)) {
            return tokenB.balanceOf(owner);
        }
        if (asset == address(tokenC)) {
            return tokenC.balanceOf(owner);
        }
        return weth.balanceOf(owner);
    }
}
