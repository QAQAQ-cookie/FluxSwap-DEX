// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapPairFuzzTest is Test {
    uint256 private constant MIN_LIQUIDITY_SEED = 1e12;
    uint256 private constant MAX_LIQUIDITY_SEED = 1e24;
    uint256 private constant TOTAL_FEE_BPS = 30;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant BPS_BASE = 10_000;

    FluxSwapFactory private factory;
    FluxSwapPair private pair;
    MockERC20 private token0;
    MockERC20 private token1;

    address private provider;
    address private trader;
    address private recipient;
    address private treasury;

    function setUp() public {
        provider = makeAddr("provider");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");
        treasury = makeAddr("treasury");

        MockERC20 tokenA = new MockERC20("Token A", "TKNA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKNB", 18);

        factory = new FluxSwapFactory(address(this));
        factory.createPair(address(tokenA), address(tokenB));
        pair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));

        token0 = MockERC20(pair.token0());
        token1 = MockERC20(pair.token1());
    }

    // 这一组 fuzz 聚焦 Pair 自身最关键的资产守恒语义：
    // 1. mint / burn 之后，储备必须和合约真实余额保持同步。
    // 2. 无 treasury 时，swap 后 K 值不能倒退。
    // 3. 有 treasury 时，协议费必须精确转出，Pair 内剩余储备仍需自洽。
    function testFuzz_mint_syncsReservesToActualBalances(uint96 rawAmount0, uint96 rawAmount1) public {
        uint256 amount0 = bound(uint256(rawAmount0), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        uint256 amount1 = bound(uint256(rawAmount1), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);

        _seedMintInputs(amount0, amount1);

        vm.prank(provider);
        uint256 liquidity = pair.mint(provider);

        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();

        assertGt(liquidity, 0);
        assertEq(reserve0, token0.balanceOf(address(pair)));
        assertEq(reserve1, token1.balanceOf(address(pair)));
        assertEq(token0.balanceOf(address(pair)), amount0);
        assertEq(token1.balanceOf(address(pair)), amount1);
    }

    function testFuzz_burn_returnsProportionalUnderlying(uint96 rawAmount0, uint96 rawAmount1, uint16 rawShareBps)
        public
    {
        uint256 amount0 = bound(uint256(rawAmount0), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        uint256 amount1 = bound(uint256(rawAmount1), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        _seedPair(amount0, amount1);

        uint256 providerLiquidity = pair.balanceOf(provider);
        uint256 liquidityToBurn = (providerLiquidity * bound(uint256(rawShareBps), 1, 10_000)) / 10_000;
        vm.assume(liquidityToBurn > 0);

        uint256 pairBalance0Before = token0.balanceOf(address(pair));
        uint256 pairBalance1Before = token1.balanceOf(address(pair));
        uint256 totalSupplyBefore = pair.totalSupply();
        uint256 expectedAmount0 = (liquidityToBurn * pairBalance0Before) / totalSupplyBefore;
        uint256 expectedAmount1 = (liquidityToBurn * pairBalance1Before) / totalSupplyBefore;
        vm.assume(expectedAmount0 > 0 && expectedAmount1 > 0);

        vm.prank(provider);
        pair.transfer(address(pair), liquidityToBurn);

        uint256 recipientBalance0Before = token0.balanceOf(recipient);
        uint256 recipientBalance1Before = token1.balanceOf(recipient);

        vm.prank(provider);
        (uint256 amount0Out, uint256 amount1Out) = pair.burn(recipient);

        (uint112 reserve0After, uint112 reserve1After, ) = pair.getReserves();

        assertEq(amount0Out, expectedAmount0);
        assertEq(amount1Out, expectedAmount1);
        assertEq(token0.balanceOf(recipient) - recipientBalance0Before, expectedAmount0);
        assertEq(token1.balanceOf(recipient) - recipientBalance1Before, expectedAmount1);
        assertEq(reserve0After, token0.balanceOf(address(pair)));
        assertEq(reserve1After, token1.balanceOf(address(pair)));
    }

    function testFuzz_swapWithoutTreasury_preservesInvariantAndSyncsReserves(
        uint96 rawReserve0,
        uint96 rawReserve1,
        uint96 rawAmountIn
    ) public {
        uint256 reserveSeed0 = bound(uint256(rawReserve0), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        uint256 reserveSeed1 = bound(uint256(rawReserve1), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        _seedPair(reserveSeed0, reserveSeed1);

        (uint112 reserve0Before, uint112 reserve1Before, ) = pair.getReserves();
        uint256 amountIn = bound(uint256(rawAmountIn), 1, (uint256(reserve0Before) / 20) + 1);
        uint256 amountOut = _getAmountOut(amountIn, reserve0Before, reserve1Before);
        vm.assume(amountOut > 0);

        uint256 recipientBalanceBefore = token1.balanceOf(recipient);
        uint256 invariantBefore = uint256(reserve0Before) * uint256(reserve1Before);

        token0.mint(trader, amountIn);
        vm.startPrank(trader);
        token0.transfer(address(pair), amountIn);
        pair.swap(0, amountOut, recipient, "");
        vm.stopPrank();

        (uint112 reserve0After, uint112 reserve1After, ) = pair.getReserves();

        assertEq(token1.balanceOf(recipient) - recipientBalanceBefore, amountOut);
        assertEq(reserve0After, token0.balanceOf(address(pair)));
        assertEq(reserve1After, token1.balanceOf(address(pair)));
        assertGe(uint256(reserve0After) * uint256(reserve1After), invariantBefore);
    }

    function testFuzz_swapWithTreasury_paysExactProtocolFee(
        uint96 rawReserve0,
        uint96 rawReserve1,
        uint96 rawAmountIn
    ) public {
        uint256 reserveSeed0 = bound(uint256(rawReserve0), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        uint256 reserveSeed1 = bound(uint256(rawReserve1), MIN_LIQUIDITY_SEED, MAX_LIQUIDITY_SEED);
        _seedPair(reserveSeed0, reserveSeed1);
        factory.setTreasury(treasury);

        (uint112 reserve0Before, uint112 reserve1Before, ) = pair.getReserves();
        uint256 amountIn = bound(uint256(rawAmountIn), 2_000, uint256(reserve0Before) / 20);
        uint256 amountOut = _getAmountOut(amountIn, reserve0Before, reserve1Before);
        uint256 expectedProtocolFee = (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        vm.assume(amountOut > 0 && expectedProtocolFee > 0);

        uint256 treasuryBalanceBefore = token0.balanceOf(treasury);
        uint256 recipientBalanceBefore = token1.balanceOf(recipient);
        uint256 invariantBefore = uint256(reserve0Before) * uint256(reserve1Before);

        token0.mint(trader, amountIn);
        vm.startPrank(trader);
        token0.transfer(address(pair), amountIn);
        pair.swap(0, amountOut, recipient, "");
        vm.stopPrank();

        (uint112 reserve0After, uint112 reserve1After, ) = pair.getReserves();

        assertEq(token0.balanceOf(treasury) - treasuryBalanceBefore, expectedProtocolFee);
        assertEq(token1.balanceOf(recipient) - recipientBalanceBefore, amountOut);
        assertEq(reserve0After, token0.balanceOf(address(pair)));
        assertEq(reserve1After, token1.balanceOf(address(pair)));
        assertGe(uint256(reserve0After) * uint256(reserve1After), invariantBefore);
    }

    function _seedPair(uint256 amount0, uint256 amount1) private {
        _seedMintInputs(amount0, amount1);
        vm.prank(provider);
        pair.mint(provider);
    }

    function _seedMintInputs(uint256 amount0, uint256 amount1) private {
        token0.mint(provider, amount0);
        token1.mint(provider, amount1);

        vm.startPrank(provider);
        token0.transfer(address(pair), amount0);
        token1.transfer(address(pair), amount1);
        vm.stopPrank();
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        uint256 amountInWithFee = amountIn * (BPS_BASE - TOTAL_FEE_BPS);
        return (amountInWithFee * reserveOut) / (reserveIn * BPS_BASE + amountInWithFee);
    }
}
