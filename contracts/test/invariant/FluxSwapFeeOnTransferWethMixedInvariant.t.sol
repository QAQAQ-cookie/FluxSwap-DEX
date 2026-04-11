// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "../../contracts/mocks/MockFeeOnTransferERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSwapFeeOnTransferWethMixedInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable feeQuotePair;
    FluxSwapPair public immutable feeWethPair;
    MockFeeOnTransferERC20 public immutable feeToken;
    MockERC20 public immutable quoteToken;
    MockWETH public immutable weth;

    address public immutable lp;
    address public immutable traderFeeA;
    address public immutable traderFeeB;
    address public immutable traderQuoteA;
    address public immutable traderQuoteB;
    address public immutable traderEthA;
    address public immutable traderEthB;
    address public immutable recipientQuoteA;
    address public immutable recipientQuoteB;
    address public immutable recipientFeeA;
    address public immutable recipientFeeB;
    address public immutable recipientEthA;
    address public immutable recipientEthB;
    address public immutable treasury;

    uint256 public immutable routerWethPreload;

    uint256 public expectedTreasuryFeeToken;
    uint256 public expectedTreasuryQuoteToken;
    uint256 public expectedTreasuryWeth;
    uint256 public expectedRecipientQuote;
    uint256 public expectedRecipientFee;
    uint256 public expectedRecipientEth;

    constructor(
        FluxSwapRouter router_,
        address[2] memory pairAddresses,
        address[3] memory tokenAddresses,
        address[13] memory actors,
        address treasury_,
        uint256 routerWethPreload_
    ) {
        router = router_;
        feeQuotePair = FluxSwapPair(pairAddresses[0]);
        feeWethPair = FluxSwapPair(pairAddresses[1]);
        feeToken = MockFeeOnTransferERC20(tokenAddresses[0]);
        quoteToken = MockERC20(tokenAddresses[1]);
        weth = MockWETH(payable(tokenAddresses[2]));
        lp = actors[0];
        traderFeeA = actors[1];
        traderFeeB = actors[2];
        traderQuoteA = actors[3];
        traderQuoteB = actors[4];
        traderEthA = actors[5];
        traderEthB = actors[6];
        recipientQuoteA = actors[7];
        recipientQuoteB = actors[8];
        recipientFeeA = actors[9];
        recipientFeeB = actors[10];
        recipientEthA = actors[11];
        recipientEthB = actors[12];
        treasury = treasury_;
        routerWethPreload = routerWethPreload_;
    }

    // 这套混合 invariant 把共享同一个 feeToken 的两条主路径放进一套随机序列：
    // feeToken <-> quoteToken 和 feeToken <-> WETH。
    // 核心目标是同时锁住多 actor、净输入计费、净到账语义以及 Router 预存 WETH 隔离。
    function swapFeeToQuote(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn);
        if (netInput == 0) {
            return;
        }

        uint256 amountOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        if (amountOut == 0) {
            return;
        }

        address trader = _selectFeeTrader(actorSeed);
        address recipient = _selectQuoteRecipient(actorSeed);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(feeToken), address(quoteToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / BPS_BASE);
        expectedRecipientQuote += amountOut;
    }

    function swapQuoteToFee(uint8 actorSeed, uint256 rawAmountIn) external {
        _swapQuoteToFee(actorSeed, rawAmountIn, false);
    }

    // 这里专门补单跳 `quote -> fee` 的 boundary：
    // amountOutMin 必须按 recipient 最终净收到的 feeToken 校验，而不是按 Pair 毛输出校验。
    function swapQuoteToFeeAmountOutBoundary(uint8 actorSeed, uint256 rawAmountIn) external {
        _swapQuoteToFee(actorSeed, rawAmountIn, true);
    }

    function swapEthToFee(uint8 actorSeed, uint256 rawEthAmount) external {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(weth), address(feeToken), feeWethPair);
        uint256 ethAmount = bound(rawEthAmount, 2_000, (reserveInput / 20) + 2_000);
        uint256 grossAmountOut = router.getAmountOut(ethAmount, reserveInput, reserveOutput);
        if (grossAmountOut == 0) {
            return;
        }

        address trader = _selectEthTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        vm.deal(trader, trader.balance + ethAmount);

        vm.prank(trader);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            1,
            _twoHopPath(address(weth), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += _applyTransferFee(grossAmountOut);
    }

    function swapFeeToEth(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(feeToken), address(weth), feeWethPair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn);
        if (netInput == 0) {
            return;
        }

        uint256 wethOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        if (wethOut == 0) {
            return;
        }

        address trader = _selectFeeTrader(actorSeed);
        address recipient = _selectEthRecipient(actorSeed);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(feeToken), address(weth)),
            recipient,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / BPS_BASE);
        expectedRecipientEth += wethOut;
    }

    function trackedFeeTokenSum() external view returns (uint256) {
        return feeToken.balanceOf(lp)
            + feeToken.balanceOf(traderFeeA)
            + feeToken.balanceOf(traderFeeB)
            + feeToken.balanceOf(traderQuoteA)
            + feeToken.balanceOf(traderQuoteB)
            + feeToken.balanceOf(traderEthA)
            + feeToken.balanceOf(traderEthB)
            + feeToken.balanceOf(recipientQuoteA)
            + feeToken.balanceOf(recipientQuoteB)
            + feeToken.balanceOf(recipientFeeA)
            + feeToken.balanceOf(recipientFeeB)
            + feeToken.balanceOf(recipientEthA)
            + feeToken.balanceOf(recipientEthB)
            + feeToken.balanceOf(address(feeQuotePair))
            + feeToken.balanceOf(address(feeWethPair))
            + feeToken.balanceOf(treasury)
            + feeToken.balanceOf(address(router));
    }

    function trackedQuoteTokenSum() external view returns (uint256) {
        return quoteToken.balanceOf(lp)
            + quoteToken.balanceOf(traderFeeA)
            + quoteToken.balanceOf(traderFeeB)
            + quoteToken.balanceOf(traderQuoteA)
            + quoteToken.balanceOf(traderQuoteB)
            + quoteToken.balanceOf(traderEthA)
            + quoteToken.balanceOf(traderEthB)
            + quoteToken.balanceOf(recipientQuoteA)
            + quoteToken.balanceOf(recipientQuoteB)
            + quoteToken.balanceOf(recipientFeeA)
            + quoteToken.balanceOf(recipientFeeB)
            + quoteToken.balanceOf(recipientEthA)
            + quoteToken.balanceOf(recipientEthB)
            + quoteToken.balanceOf(address(feeQuotePair))
            + quoteToken.balanceOf(treasury)
            + quoteToken.balanceOf(address(router));
    }

    function recipientQuoteBalanceSum() external view returns (uint256) {
        return quoteToken.balanceOf(recipientQuoteA) + quoteToken.balanceOf(recipientQuoteB);
    }

    function recipientFeeBalanceSum() external view returns (uint256) {
        return feeToken.balanceOf(recipientFeeA) + feeToken.balanceOf(recipientFeeB);
    }

    function recipientEthBalanceSum() external view returns (uint256) {
        return recipientEthA.balance + recipientEthB.balance;
    }

    function _swapQuoteToFee(uint8 actorSeed, uint256 rawAmountIn, bool withBoundary) private {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(quoteToken), address(feeToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 grossAmountOut = router.getAmountOut(amountIn, reserveInput, reserveOutput);
        uint256 netRecipientOut = _applyTransferFee(grossAmountOut);
        if (grossAmountOut == 0 || netRecipientOut == 0) {
            return;
        }

        address trader = _selectQuoteTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        quoteToken.mint(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        if (withBoundary) {
            vm.prank(trader);
            vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amountIn,
                netRecipientOut + 1,
                _twoHopPath(address(quoteToken), address(feeToken)),
                recipient,
                _deadline()
            );
        }

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            withBoundary ? netRecipientOut : 1,
            _twoHopPath(address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryQuoteToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += netRecipientOut;
    }

    function _selectFeeTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderFeeA : traderFeeB;
    }

    function _selectQuoteTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderQuoteA : traderQuoteB;
    }

    function _selectEthTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderEthA : traderEthB;
    }

    function _selectQuoteRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientQuoteA : recipientQuoteB;
    }

    function _selectFeeRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientFeeA : recipientFeeB;
    }

    function _selectEthRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientEthA : recipientEthB;
    }

    function _applyTransferFee(uint256 amount) private view returns (uint256) {
        return amount - ((amount * feeToken.feeBps()) / BPS_BASE);
    }

    function _twoHopPath(address tokenIn, address tokenOut) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
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

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}

contract FluxSwapFeeOnTransferWethMixedInvariantTest is StdInvariant, Test {
    uint256 private constant ROUTER_WETH_PRELOAD = 1e18;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockFeeOnTransferERC20 private feeToken;
    MockERC20 private quoteToken;
    FluxSwapPair private feeQuotePair;
    FluxSwapPair private feeWethPair;
    FluxSwapFeeOnTransferWethMixedInvariantHandler private handler;

    address private treasury;

    function setUp() public {
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), address(weth));

        feeToken = new MockFeeOnTransferERC20("Hybrid Tax Token", "HTAX", 18, 300);
        quoteToken = new MockERC20("Hybrid Quote Token", "HQUOTE", 18);

        factory.createPair(address(feeToken), address(quoteToken));
        feeQuotePair = FluxSwapPair(factory.getPair(address(feeToken), address(quoteToken)));
        factory.createPair(address(feeToken), address(weth));
        feeWethPair = FluxSwapPair(factory.getPair(address(feeToken), address(weth)));

        vm.deal(address(this), ROUTER_WETH_PRELOAD);
        weth.deposit{value: ROUTER_WETH_PRELOAD}();
        weth.transfer(address(router), ROUTER_WETH_PRELOAD);

        address[2] memory pairAddresses = [address(feeQuotePair), address(feeWethPair)];
        address[3] memory tokenAddresses = [address(feeToken), address(quoteToken), address(weth)];
        address[13] memory actors = [
            makeAddr("lp"),
            makeAddr("traderFeeA"),
            makeAddr("traderFeeB"),
            makeAddr("traderQuoteA"),
            makeAddr("traderQuoteB"),
            makeAddr("traderEthA"),
            makeAddr("traderEthB"),
            makeAddr("recipientQuoteA"),
            makeAddr("recipientQuoteB"),
            makeAddr("recipientFeeA"),
            makeAddr("recipientFeeB"),
            makeAddr("recipientEthA"),
            makeAddr("recipientEthB")
        ];

        handler = new FluxSwapFeeOnTransferWethMixedInvariantHandler(
            router,
            pairAddresses,
            tokenAddresses,
            actors,
            treasury,
            ROUTER_WETH_PRELOAD
        );

        _seedGenericPair(feeToken, quoteToken, 5e18, 9e18, actors[0]);
        _seedFeeWethPair(7e18, 4e18, actors[0]);

        targetContract(address(handler));
    }

    // 不变量 1：两条 supporting Pair 的 reserve 都必须始终和当前真实余额同步。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(feeQuotePair);
        _assertPairReserves(feeWethPair);
    }

    // 不变量 2：feeToken / quoteToken / WETH 三类协议费余额必须与混合路径的成功输入累计一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(feeToken.balanceOf(treasury), handler.expectedTreasuryFeeToken());
        assertEq(quoteToken.balanceOf(treasury), handler.expectedTreasuryQuoteToken());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 3：三类 recipient 的最终到账总和必须与净输入 / 净到账模型一致。
    function invariant_recipientBalancesMatchModel() public view {
        assertEq(handler.recipientQuoteBalanceSum(), handler.expectedRecipientQuote());
        assertEq(handler.recipientFeeBalanceSum(), handler.expectedRecipientFee());
        assertEq(handler.recipientEthBalanceSum(), handler.expectedRecipientEth());
    }

    // 不变量 4：Router 不得残留 feeToken / quoteToken / LP，且预存 WETH 不能被 fee->ETH 路径误用。
    function invariant_routerRetainsOnlyPreloadedWeth() public view {
        assertEq(address(router).balance, 0);
        assertEq(feeToken.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
        assertEq(feeQuotePair.balanceOf(address(router)), 0);
        assertEq(feeWethPair.balanceOf(address(router)), 0);
        assertEq(weth.balanceOf(address(router)), handler.routerWethPreload());
    }

    // 不变量 5：feeToken / quoteToken 的总量都必须能被已跟踪账户 + Pair + Treasury + Router 完整解释。
    function invariant_tokenConservationCloses() public view {
        assertEq(feeToken.totalSupply(), handler.trackedFeeTokenSum());
        assertEq(quoteToken.totalSupply(), handler.trackedQuoteTokenSum());
    }

    // 不变量 6：WETH 总供应量只能由 feeWethPair + Treasury + Router 中的余额解释。
    function invariant_wethSupplyClosesToObservedBalances() public view {
        assertEq(
            weth.totalSupply(),
            weth.balanceOf(address(feeWethPair)) + weth.balanceOf(treasury) + weth.balanceOf(address(router))
        );
    }

    function _seedGenericPair(MockERC20 tokenA, MockERC20 tokenB, uint256 amountA, uint256 amountB, address lpAddr)
        private
    {
        address pairAddress = factory.getPair(address(tokenA), address(tokenB));

        tokenA.mint(lpAddr, amountA);
        tokenB.mint(lpAddr, amountB);

        vm.startPrank(lpAddr);
        tokenA.transfer(pairAddress, amountA);
        tokenB.transfer(pairAddress, amountB);
        FluxSwapPair(pairAddress).mint(lpAddr);
        vm.stopPrank();
    }

    function _seedFeeWethPair(uint256 feeTokenAmount, uint256 wethAmount, address lpAddr) private {
        address pairAddress = factory.getPair(address(feeToken), address(weth));

        feeToken.mint(lpAddr, feeTokenAmount);
        vm.deal(lpAddr, wethAmount);

        vm.startPrank(lpAddr);
        feeToken.transfer(pairAddress, feeTokenAmount);
        weth.deposit{value: wethAmount}();
        weth.transfer(pairAddress, wethAmount);
        FluxSwapPair(pairAddress).mint(lpAddr);
        vm.stopPrank();
    }

    function _assertPairReserves(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, _assetBalance(pair.token0(), address(pair)));
        assertEq(reserve1, _assetBalance(pair.token1(), address(pair)));
    }

    function _assetBalance(address asset, address owner) private view returns (uint256) {
        if (asset == address(feeToken)) {
            return feeToken.balanceOf(owner);
        }
        if (asset == address(quoteToken)) {
            return quoteToken.balanceOf(owner);
        }
        return weth.balanceOf(owner);
    }
}
