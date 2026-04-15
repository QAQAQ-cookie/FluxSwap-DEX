// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {IFluxSignedOrderSettlement} from "../../interfaces/IFluxSignedOrderSettlement.sol";
import {FluxSignedOrderSettlement} from "../../contracts/FluxSignedOrderSettlement.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSignedOrderSettlementInvariantHarness is FluxSignedOrderSettlement {
    constructor(address router_) FluxSignedOrderSettlement(router_) {}

    function exposedDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
}

contract FluxSignedOrderSettlementInvariantHandler is Test {
    FluxSignedOrderSettlementInvariantHarness public immutable settlement;
    FluxSwapRouter public immutable router;
    MockERC20 public immutable tokenA;
    MockERC20 public immutable tokenB;

    uint256 public immutable makerPrivateKey;
    address public immutable maker;
    address public immutable executor;
    address public immutable recipient;

    uint256 public nextNonce = 1;
    uint256 public executedCount;
    uint256 public cancelledCount;

    constructor(
        FluxSignedOrderSettlementInvariantHarness settlement_,
        FluxSwapRouter router_,
        MockERC20 tokenA_,
        MockERC20 tokenB_,
        uint256 makerPrivateKey_,
        address maker_,
        address executor_,
        address recipient_
    ) {
        settlement = settlement_;
        router = router_;
        tokenA = tokenA_;
        tokenB = tokenB_;
        makerPrivateKey = makerPrivateKey_;
        maker = maker_;
        executor = executor_;
        recipient = recipient_;
    }

    function executeFreshOrder(uint96 rawAmountIn, uint16 rawSlackBps) external {
        uint256 amountIn = bound(uint256(rawAmountIn), 1e6, 300e18);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        if (quoted[1] == 0) {
            return;
        }

        uint256 slackBps = bound(uint256(rawSlackBps), 0, 500);
        uint256 minAmountOut = (quoted[1] * (10_000 - slackBps)) / 10_000;
        uint256 triggerPriceX18 = ((quoted[1] * 1e18) / amountIn) * 99 / 100;
        if (minAmountOut == 0 || triggerPriceX18 == 0) {
            return;
        }

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
            nonce: nextNonce,
            recipient: recipient
        });

        bytes memory signature = _signOrder(order);
        vm.prank(executor);
        settlement.executeOrder(order, signature, _deadline());

        executedCount += 1;
        nextNonce += 1;
    }

    function cancelFreshOrder(uint96 rawAmountIn) external {
        uint256 amountIn = bound(uint256(rawAmountIn), 1e6, 300e18);
        uint256[] memory quoted = router.getAmountsOut(amountIn, _tokenPath());
        if (quoted[1] == 0) {
            return;
        }

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
            nonce: nextNonce,
            recipient: recipient
        });

        vm.prank(maker);
        settlement.cancelOrder(order);

        cancelledCount += 1;
        nextNonce += 1;
    }

    function invalidateNextRange(uint64 rawCutoffDelta) external {
        uint256 cutoffDelta = bound(uint256(rawCutoffDelta), 1, 25);
        uint256 newCutoff = nextNonce + cutoffDelta;

        vm.prank(maker);
        settlement.cancelUpTo(newCutoff);

        if (nextNonce < newCutoff) {
            nextNonce = newCutoff;
        }
    }

    function signedOrderHashForNonce(uint256 nonce) external view returns (bytes32) {
        IFluxSignedOrderSettlement.SignedOrder memory order = IFluxSignedOrderSettlement.SignedOrder({
            maker: maker,
            inputToken: address(tokenA),
            outputToken: address(tokenB),
            amountIn: 1e18,
            minAmountOut: 1,
            triggerPriceX18: 1,
            expiry: _deadline(),
            nonce: nonce,
            recipient: recipient
        });
        return settlement.hashOrder(order);
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

    function _tokenPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}

contract FluxSignedOrderSettlementInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    FluxSignedOrderSettlementInvariantHarness private settlement;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    MockWETH private weth;
    FluxSignedOrderSettlementInvariantHandler private handler;

    uint256 private makerPrivateKey;
    address private maker;
    address private executor;
    address private recipient;

    function setUp() public {
        makerPrivateKey = 0xA11CE;
        maker = vm.addr(makerPrivateKey);
        executor = makeAddr("executor");
        recipient = makeAddr("recipient");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        router = new FluxSwapRouter(address(factory), address(weth));
        settlement = new FluxSignedOrderSettlementInvariantHarness(address(router));
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        tokenA.mint(maker, 20_000e18);
        tokenB.mint(maker, 40_000e18);

        vm.startPrank(maker);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 20_000e18, 40_000e18, 0, 0, maker, block.timestamp + 1 hours);
        vm.stopPrank();

        handler = new FluxSignedOrderSettlementInvariantHandler(
            settlement,
            router,
            tokenA,
            tokenB,
            makerPrivateKey,
            maker,
            executor,
            recipient
        );

        targetContract(address(handler));
    }

    // 不变量 1：结算合约自身不应残留输入 token。
    function invariant_settlementDoesNotRetainInputToken() public view {
        assertEq(tokenA.balanceOf(address(settlement)), 0);
    }

    // 不变量 2：已生效的 minValidNonce 不得倒退。
    function invariant_minValidNonceMonotonic() public view {
        assertLe(settlement.minValidNonce(maker), handler.nextNonce());
    }

    // 不变量 3：若某个 nonce 小于 minValidNonce，则它必定不可再执行。
    function invariant_noncesBelowMinValidRemainUnavailable() public view {
        uint256 cutoff = settlement.minValidNonce(maker);
        if (cutoff == 0) {
            return;
        }

        assertTrue(cutoff <= handler.nextNonce());
    }

    // 不变量 4：执行与取消的累计次数不会超过已消耗 nonce 总量。
    function invariant_consumedNonceAccountingStaysBounded() public view {
        assertLe(handler.executedCount() + handler.cancelledCount(), handler.nextNonce() - 1);
    }
}
