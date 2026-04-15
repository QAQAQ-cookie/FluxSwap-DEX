// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSignedOrderSettlement.sol";
import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapRouter.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockWETH.sol";

contract FluxSignedOrderSettlementHarness is FluxSignedOrderSettlement {
    constructor(address router_) FluxSignedOrderSettlement(router_) {}

    function exposedDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
}

contract FluxSignedOrderSettlementFuzzTest is Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    FluxSignedOrderSettlementHarness private settlement;
    MockWETH private weth;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    uint256 private makerPrivateKey;
    address private maker;
    address private executor;
    address private recipient;

    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;

    function setUp() public {
        makerPrivateKey = 0xA11CE;
        maker = vm.addr(makerPrivateKey);
        executor = makeAddr("executor");
        recipient = makeAddr("recipient");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
        settlement = new FluxSignedOrderSettlementHarness(address(router));
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        _seedTokenPair(20_000e18, 40_000e18);
    }

    // Fuzz 目标：
    // 1. 随机金额与阈值下，签名订单执行后应写入最小状态并锁定 nonce。
    // 2. 随机 cancelUpTo 边界下，旧 nonce 订单必须被拒绝执行。
    // 3. 随机取消路径下，单笔取消应使相同订单后续无法再被执行。
    function testFuzz_executeSignedOrder_marksOrderAndNonce(uint96 rawAmountIn, uint16 rawSlackBps) public {
        uint256 amountIn = bound(uint256(rawAmountIn), 1e6, 500e18);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        uint256 amountOut = quoted[1];
        vm.assume(amountOut > 0);

        uint256 slackBps = bound(uint256(rawSlackBps), 0, 500);
        uint256 minAmountOut = (amountOut * (10_000 - slackBps)) / 10_000;
        uint256 triggerPriceX18 = ((amountOut * 1e18) / amountIn) * 99 / 100;
        vm.assume(minAmountOut > 0);
        vm.assume(triggerPriceX18 > 0);

        tokenA.mint(maker, amountIn);
        vm.prank(maker);
        tokenA.approve(address(settlement), type(uint256).max);

        IFluxSignedOrderSettlement.SignedOrder memory order = IFluxSignedOrderSettlement.SignedOrder({
            maker: maker,
            inputToken: address(tokenA),
            outputToken: address(tokenB),
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            triggerPriceX18: triggerPriceX18,
            expiry: _deadline(),
            nonce: 1,
            recipient: recipient
        });

        bytes memory signature = _signOrder(order);
        bytes32 orderHash = settlement.hashOrder(order);

        vm.prank(executor);
        settlement.executeOrder(order, signature, _deadline());

        assertTrue(settlement.orderExecuted(orderHash));
        assertTrue(settlement.invalidatedNonce(maker, order.nonce));
    }

    function testFuzz_cancelUpTo_invalidatesOlderNonces(uint64 rawCutoff, uint64 rawOrderNonce) public {
        uint256 cutoff = bound(uint256(rawCutoff), 1, 10_000);
        uint256 orderNonce = bound(uint256(rawOrderNonce), 0, cutoff - 1);

        vm.prank(maker);
        settlement.cancelUpTo(cutoff);

        tokenA.mint(maker, 100e18);
        vm.prank(maker);
        tokenA.approve(address(settlement), type(uint256).max);

        uint256[] memory quoted = router.getAmountsOut(100e18, _tokenPath());
        IFluxSignedOrderSettlement.SignedOrder memory order = IFluxSignedOrderSettlement.SignedOrder({
            maker: maker,
            inputToken: address(tokenA),
            outputToken: address(tokenB),
            amountIn: 100e18,
            minAmountOut: quoted[1] * 95 / 100,
            triggerPriceX18: ((quoted[1] * 1e18) / 100e18) * 95 / 100,
            expiry: _deadline(),
            nonce: orderNonce,
            recipient: recipient
        });

        bytes memory signature = _signOrder(order);

        vm.expectRevert(bytes("FluxSignedOrderSettlement: NONCE_INVALIDATED"));
        vm.prank(executor);
        settlement.executeOrder(order, signature, _deadline());
    }

    function testFuzz_cancelOrder_blocksFutureExecution(uint96 rawAmountIn) public {
        uint256 amountIn = bound(uint256(rawAmountIn), 1e6, 500e18);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        vm.assume(quoted[1] > 0);

        tokenA.mint(maker, amountIn);
        vm.prank(maker);
        tokenA.approve(address(settlement), type(uint256).max);

        IFluxSignedOrderSettlement.SignedOrder memory order = IFluxSignedOrderSettlement.SignedOrder({
            maker: maker,
            inputToken: address(tokenA),
            outputToken: address(tokenB),
            amountIn: amountIn,
            minAmountOut: quoted[1] * 95 / 100,
            triggerPriceX18: ((quoted[1] * 1e18) / amountIn) * 95 / 100,
            expiry: _deadline(),
            nonce: 42,
            recipient: recipient
        });

        bytes memory signature = _signOrder(order);

        vm.prank(maker);
        settlement.cancelOrder(order);

        vm.expectRevert(bytes("FluxSignedOrderSettlement: NONCE_INVALIDATED"));
        vm.prank(executor);
        settlement.executeOrder(order, signature, _deadline());
    }

    function _signOrder(IFluxSignedOrderSettlement.SignedOrder memory order) private view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "SignedOrder(address maker,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 triggerPriceX18,uint256 expiry,uint256 nonce,address recipient)"
                ),
                order.maker,
                order.inputToken,
                order.outputToken,
                order.amountIn,
                order.minAmountOut,
                order.triggerPriceX18,
                order.expiry,
                order.nonce,
                order.recipient
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", settlement.exposedDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _seedTokenPair(uint256 amountA, uint256 amountB) private {
        amountA = bound(amountA, MIN_LIQUIDITY, MAX_LIQUIDITY);
        amountB = bound(amountB, MIN_LIQUIDITY, MAX_LIQUIDITY);

        tokenA.mint(maker, amountA);
        tokenB.mint(maker, amountB);

        vm.startPrank(maker);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, maker, _deadline());
        vm.stopPrank();
    }

    function _tokenPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}
