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
    bytes32 private constant INVALIDATE_NONCES_TYPEHASH =
        keccak256("InvalidateNonces(address maker,bytes32 noncesHash,uint256 deadline)");

    // Fuzz 目标：
    // 1. 随机金额与滑点边界下，签名订单成交后应正确写入成交与 nonce 状态。
    // 2. 随机批量 nonce 失效后，被命中的订单必须永久不可再执行。
    // 3. 随机签名批量失效请求中，重复 nonce 必须被拒绝，避免假成功。

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

    function testFuzz_invalidateNoncesBySig_blocksFutureExecution(
        uint64 rawNonceA,
        uint64 rawNonceB,
        uint96 rawAmountIn
    ) public {
        uint256 nonceA = bound(uint256(rawNonceA), 1, type(uint32).max);
        uint256 nonceB = bound(uint256(rawNonceB), 1, type(uint32).max);
        vm.assume(nonceA != nonceB);

        uint256 amountIn = bound(uint256(rawAmountIn), 1e6, 500e18);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        vm.assume(quoted[1] > 0);

        tokenA.mint(maker, amountIn * 2);
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
            nonce: nonceA,
            recipient: recipient
        });

        bytes memory orderSignature = _signOrder(order);
        uint256[] memory nonces = new uint256[](2);
        nonces[0] = nonceA;
        nonces[1] = nonceB;
        bytes memory revokeSignature = _signInvalidateNonces(nonces, _deadline());

        vm.prank(executor);
        settlement.invalidateNoncesBySig(maker, nonces, _deadline(), revokeSignature);

        vm.expectRevert(bytes("FluxSignedOrderSettlement: NONCE_INVALIDATED"));
        vm.prank(executor);
        settlement.executeOrder(order, orderSignature, _deadline());
    }

    function testFuzz_invalidateNoncesBySig_rejectsDuplicateNonce(uint64 rawNonce) public {
        uint256 nonce = bound(uint256(rawNonce), 1, type(uint32).max);

        uint256[] memory nonces = new uint256[](2);
        nonces[0] = nonce;
        nonces[1] = nonce;
        bytes memory revokeSignature = _signInvalidateNonces(nonces, _deadline());

        vm.expectRevert(bytes("FluxSignedOrderSettlement: NONCE_INVALIDATED"));
        vm.prank(executor);
        settlement.invalidateNoncesBySig(maker, nonces, _deadline(), revokeSignature);
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

    function _signInvalidateNonces(uint256[] memory nonces, uint256 deadline) private view returns (bytes memory) {
        bytes32 noncesHash = keccak256(abi.encodePacked(nonces));
        bytes32 structHash = keccak256(abi.encode(INVALIDATE_NONCES_TYPEHASH, maker, noncesHash, deadline));
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
