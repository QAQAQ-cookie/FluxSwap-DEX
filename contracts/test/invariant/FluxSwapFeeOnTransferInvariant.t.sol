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

contract FluxSwapFeeOnTransferInvariantHandler is Test {
    uint256 private constant FEE_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_LIQUIDITY = 1e24;
    uint256 private constant MAX_ETH_LIQUIDITY = 5e21;

    FluxSwapFactory public immutable factory;
    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable feeQuotePair;
    FluxSwapPair public immutable feeWethPair;
    MockFeeOnTransferERC20 public immutable feeToken;
    MockERC20 public immutable quoteToken;
    MockWETH public immutable weth;

    address public immutable lp;
    address public immutable traderFeeToQuote;
    address public immutable traderFeeToEth;
    address public immutable traderEthToFee;
    address public immutable recipientQuote;
    address public immutable recipientFee;
    address public immutable recipientEth;
    address public immutable treasury;

    uint256 public immutable routerWethPreload;

    uint256 public totalMintedFeeToken;
    uint256 public totalMintedQuoteToken;
    uint256 public expectedTreasuryFeeToken;
    uint256 public expectedTreasuryWeth;
    uint256 public expectedRecipientQuote;
    uint256 public expectedRecipientFee;
    uint256 public expectedRecipientEth;

    constructor(
        FluxSwapFactory factory_,
        FluxSwapRouter router_,
        FluxSwapPair feeQuotePair_,
        FluxSwapPair feeWethPair_,
        MockFeeOnTransferERC20 feeToken_,
        MockERC20 quoteToken_,
        MockWETH weth_,
        address treasury_,
        uint256 routerWethPreload_
    ) {
        factory = factory_;
        router = router_;
        feeQuotePair = feeQuotePair_;
        feeWethPair = feeWethPair_;
        feeToken = feeToken_;
        quoteToken = quoteToken_;
        weth = weth_;
        lp = makeAddr("lp");
        traderFeeToQuote = makeAddr("traderFeeToQuote");
        traderFeeToEth = makeAddr("traderFeeToEth");
        traderEthToFee = makeAddr("traderEthToFee");
        recipientQuote = makeAddr("recipientQuote");
        recipientFee = makeAddr("recipientFee");
        recipientEth = makeAddr("recipientEth");
        treasury = treasury_;
        routerWethPreload = routerWethPreload_;
    }

    function swapFeeToQuote(uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn);
        if (netInput == 0) {
            return;
        }

        uint256 amountOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        if (amountOut == 0) {
            return;
        }

        feeToken.mint(traderFeeToQuote, amountIn);
        totalMintedFeeToken += amountIn;

        vm.prank(traderFeeToQuote);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(traderFeeToQuote);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(feeToken), address(quoteToken)),
            recipientQuote,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / FEE_BASE);
        expectedRecipientQuote += amountOut;
    }

    function swapFeeToQuoteAmountOutBoundary(uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 netInput = _applyTransferFee(amountIn);
        if (netInput == 0) {
            return;
        }

        uint256 exactAmountOut = router.getAmountOut(netInput, reserveInput, reserveOutput);
        if (exactAmountOut == 0) {
            return;
        }

        feeToken.mint(traderFeeToQuote, amountIn);
        totalMintedFeeToken += amountIn;

        vm.prank(traderFeeToQuote);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(traderFeeToQuote);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            exactAmountOut + 1,
            _twoHopPath(address(feeToken), address(quoteToken)),
            recipientQuote,
            _deadline()
        );

        vm.prank(traderFeeToQuote);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            exactAmountOut,
            _twoHopPath(address(feeToken), address(quoteToken)),
            recipientQuote,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / FEE_BASE);
        expectedRecipientQuote += exactAmountOut;
    }

    function swapEthToFee(uint256 rawEthAmount) external {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(address(weth), address(feeToken), feeWethPair);
        uint256 ethAmount = bound(rawEthAmount, 2_000, (reserveInput / 20) + 2_000);
        uint256 grossAmountOut = router.getAmountOut(ethAmount, reserveInput, reserveOutput);
        if (grossAmountOut == 0) {
            return;
        }

        vm.deal(traderEthToFee, traderEthToFee.balance + ethAmount);

        vm.prank(traderEthToFee);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: ethAmount}(
            1,
            _twoHopPath(address(weth), address(feeToken)),
            recipientFee,
            _deadline()
        );

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / FEE_BASE;
        expectedRecipientFee += _applyTransferFee(grossAmountOut);
    }

    function swapFeeToEth(uint256 rawAmountIn) external {
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

        feeToken.mint(traderFeeToEth, amountIn);
        totalMintedFeeToken += amountIn;

        vm.prank(traderFeeToEth);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(traderFeeToEth);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(feeToken), address(weth)),
            recipientEth,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netInput * PROTOCOL_FEE_BPS) / FEE_BASE);
        expectedRecipientEth += wethOut;
    }

    function trackedFeeTokenSum() external view returns (uint256) {
        return feeToken.balanceOf(lp)
            + feeToken.balanceOf(traderFeeToQuote)
            + feeToken.balanceOf(traderFeeToEth)
            + feeToken.balanceOf(traderEthToFee)
            + feeToken.balanceOf(recipientQuote)
            + feeToken.balanceOf(recipientFee)
            + feeToken.balanceOf(recipientEth)
            + feeToken.balanceOf(address(feeQuotePair))
            + feeToken.balanceOf(address(feeWethPair))
            + feeToken.balanceOf(treasury)
            + feeToken.balanceOf(address(router));
    }

    function trackedQuoteTokenSum() external view returns (uint256) {
        return quoteToken.balanceOf(lp)
            + quoteToken.balanceOf(traderFeeToQuote)
            + quoteToken.balanceOf(traderFeeToEth)
            + quoteToken.balanceOf(traderEthToFee)
            + quoteToken.balanceOf(recipientQuote)
            + quoteToken.balanceOf(recipientFee)
            + quoteToken.balanceOf(recipientEth)
            + quoteToken.balanceOf(address(feeQuotePair))
            + quoteToken.balanceOf(treasury)
            + quoteToken.balanceOf(address(router));
    }

    function _applyTransferFee(uint256 amount) private view returns (uint256) {
        return amount - ((amount * feeToken.feeBps()) / FEE_BASE);
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

contract FluxSwapFeeOnTransferInvariantTest is StdInvariant, Test {
    uint256 private constant ROUTER_WETH_PRELOAD = 1e18;

    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockFeeOnTransferERC20 private feeToken;
    MockERC20 private quoteToken;
    FluxSwapPair private feeQuotePair;
    FluxSwapPair private feeWethPair;
    FluxSwapFeeOnTransferInvariantHandler private handler;

    address private treasury;

    function setUp() public {
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);

        router = new FluxSwapRouter(address(factory), address(weth));
        feeToken = new MockFeeOnTransferERC20("Tax Token", "TAX", 18, 300);
        quoteToken = new MockERC20("Quote Token", "QUOTE", 18);

        factory.createPair(address(feeToken), address(quoteToken));
        feeQuotePair = FluxSwapPair(factory.getPair(address(feeToken), address(quoteToken)));
        factory.createPair(address(feeToken), address(weth));
        feeWethPair = FluxSwapPair(factory.getPair(address(feeToken), address(weth)));

        vm.deal(address(this), ROUTER_WETH_PRELOAD);
        weth.deposit{value: ROUTER_WETH_PRELOAD}();
        weth.transfer(address(router), ROUTER_WETH_PRELOAD);

        handler = new FluxSwapFeeOnTransferInvariantHandler(
            factory,
            router,
            feeQuotePair,
            feeWethPair,
            feeToken,
            quoteToken,
            weth,
            treasury,
            ROUTER_WETH_PRELOAD
        );

        _seedGenericPair(feeToken, quoteToken, 5e18, 9e18, handler.lp());
        _seedFeeWethPair(7e18, 4e18, handler.lp());

        targetContract(address(handler));
    }

    // 不变量 1：两条 Pair 记录的 reserve 必须始终与当前真实余额一致。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(feeQuotePair);
        _assertPairReserves(feeWethPair);
    }

    // 不变量 2：treasury 的 feeToken / WETH 余额必须与 supporting 路径真实成功计提结果一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(feeToken.balanceOf(treasury), handler.expectedTreasuryFeeToken());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 3：recipient 的最终到账余额必须与 supporting 路径按净输入 / 净到账语义计算的结果一致。
    function invariant_recipientBalancesMatchModel() public view {
        assertEq(quoteToken.balanceOf(handler.recipientQuote()), handler.expectedRecipientQuote());
        assertEq(feeToken.balanceOf(handler.recipientFee()), handler.expectedRecipientFee());
        assertEq(handler.recipientEth().balance, handler.expectedRecipientEth());
    }

    // 不变量 4：Router 不得残留 feeToken / quoteToken / LP token，且预存 WETH 不能被 supporting token->ETH 路径误用。
    function invariant_routerRetainsOnlyPreloadedWeth() public view {
        assertEq(feeToken.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
        assertEq(feeQuotePair.balanceOf(address(router)), 0);
        assertEq(feeWethPair.balanceOf(address(router)), 0);
        assertEq(weth.balanceOf(address(router)), handler.routerWethPreload());
    }

    // 不变量 5：feeToken / quoteToken 的总量必须能被已跟踪账户 + Pair + Treasury + Router 完整解释。
    function invariant_tokenConservationCloses() public view {
        assertEq(feeToken.totalSupply(), handler.trackedFeeTokenSum());
        assertEq(quoteToken.totalSupply(), handler.trackedQuoteTokenSum());
    }

    // 不变量 6：WETH 总供应量只能由 feeWethPair + treasury + router 中的余额解释。
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
