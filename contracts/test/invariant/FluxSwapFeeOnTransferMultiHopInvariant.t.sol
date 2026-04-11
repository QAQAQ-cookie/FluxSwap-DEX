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

contract FluxSwapFeeOnTransferMultiHopInvariantHandler is Test {
    uint256 private constant FEE_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    struct FourHopExpectations {
        uint256 treasuryFirstHop;
        uint256 treasurySecondHop;
        uint256 treasuryThirdHop;
        uint256 treasuryFourthHop;
        uint256 recipientOut;
    }

    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable pairFeeOneMidOne;
    FluxSwapPair public immutable pairMidOneFeeTwo;
    FluxSwapPair public immutable pairFeeTwoMidTwo;
    FluxSwapPair public immutable pairMidTwoOut;
    MockFeeOnTransferERC20 public immutable feeTokenOne;
    MockERC20 public immutable midTokenOne;
    MockFeeOnTransferERC20 public immutable feeTokenTwo;
    MockERC20 public immutable midTokenTwo;
    MockERC20 public immutable outToken;

    address public immutable lp;
    address public immutable trader;
    address public immutable recipient;
    address public immutable treasury;

    uint256 public expectedTreasuryFeeTokenOne;
    uint256 public expectedTreasuryMidTokenOne;
    uint256 public expectedTreasuryFeeTokenTwo;
    uint256 public expectedTreasuryMidTokenTwo;
    uint256 public expectedRecipientOut;

    constructor(
        FluxSwapRouter router_,
        address[4] memory pairAddresses,
        address[5] memory tokenAddresses,
        address[4] memory actors
    ) {
        router = router_;
        pairFeeOneMidOne = FluxSwapPair(pairAddresses[0]);
        pairMidOneFeeTwo = FluxSwapPair(pairAddresses[1]);
        pairFeeTwoMidTwo = FluxSwapPair(pairAddresses[2]);
        pairMidTwoOut = FluxSwapPair(pairAddresses[3]);
        feeTokenOne = MockFeeOnTransferERC20(tokenAddresses[0]);
        midTokenOne = MockERC20(tokenAddresses[1]);
        feeTokenTwo = MockFeeOnTransferERC20(tokenAddresses[2]);
        midTokenTwo = MockERC20(tokenAddresses[3]);
        outToken = MockERC20(tokenAddresses[4]);
        lp = actors[0];
        trader = actors[1];
        recipient = actors[2];
        treasury = actors[3];
    }

    // 这一组动作把 fuzz 里“四跳双 fee token supporting 路径”上提成 invariant：
    // feeTokenOne -> midTokenOne -> feeTokenTwo -> midTokenTwo -> outToken。
    // 核心目标是持续验证每一跳都只按“真实到达该 Pair 的净输入”计提协议费。
    function swapDualFeeFourHop(uint256 rawAmountIn) external {
        FourHopExpectations memory expected = _computeFourHopExpectations(rawAmountIn);
        if (expected.recipientOut == 0) {
            return;
        }

        _executeFourHopSwap(_amountIn(rawAmountIn), 1);
        _applyExpectedBalances(expected);
    }

    // 边界动作专门验证 amountOutMin 必须按最终 recipient 的真实净到账校验，
    // 不能把中间 hop 的毛输出误当成最终可领取金额。
    function swapDualFeeFourHopAmountOutBoundary(uint256 rawAmountIn) external {
        uint256 amountIn = _amountIn(rawAmountIn);
        FourHopExpectations memory expected = _computeFourHopExpectations(rawAmountIn);
        if (expected.recipientOut == 0) {
            return;
        }

        feeTokenOne.mint(trader, amountIn);
        vm.prank(trader);
        feeTokenOne.approve(address(router), type(uint256).max);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            expected.recipientOut + 1,
            _fiveHopPath(),
            recipient,
            _deadline()
        );

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            expected.recipientOut,
            _fiveHopPath(),
            recipient,
            _deadline()
        );

        _applyExpectedBalances(expected);
    }

    function trackedFeeTokenOneSum() external view returns (uint256) {
        return _trackedTokenSum(feeTokenOne);
    }

    function trackedMidTokenOneSum() external view returns (uint256) {
        return _trackedTokenSum(midTokenOne);
    }

    function trackedFeeTokenTwoSum() external view returns (uint256) {
        return _trackedTokenSum(feeTokenTwo);
    }

    function trackedMidTokenTwoSum() external view returns (uint256) {
        return _trackedTokenSum(midTokenTwo);
    }

    function trackedOutTokenSum() external view returns (uint256) {
        return _trackedTokenSum(outToken);
    }

    function _executeFourHopSwap(uint256 amountIn, uint256 amountOutMin) private {
        feeTokenOne.mint(trader, amountIn);
        vm.prank(trader);
        feeTokenOne.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            amountOutMin,
            _fiveHopPath(),
            recipient,
            _deadline()
        );
    }

    function _computeFourHopExpectations(uint256 rawAmountIn) private view returns (FourHopExpectations memory expected) {
        uint256 amountIn = _amountIn(rawAmountIn);
        uint256 netFirstHopInput = _applyTransferFee(amountIn, feeTokenOne.feeBps());
        if (netFirstHopInput == 0) {
            return expected;
        }

        uint256 firstHopAmountOut =
            _quoteAmountOut(pairFeeOneMidOne, address(feeTokenOne), address(midTokenOne), netFirstHopInput);
        if (firstHopAmountOut == 0) {
            return expected;
        }

        uint256 secondHopAmountOut =
            _quoteAmountOut(pairMidOneFeeTwo, address(midTokenOne), address(feeTokenTwo), firstHopAmountOut);
        if (secondHopAmountOut == 0) {
            return expected;
        }

        uint256 netThirdHopInput = _applyTransferFee(secondHopAmountOut, feeTokenTwo.feeBps());
        if (netThirdHopInput == 0) {
            return expected;
        }

        uint256 thirdHopAmountOut =
            _quoteAmountOut(pairFeeTwoMidTwo, address(feeTokenTwo), address(midTokenTwo), netThirdHopInput);
        if (thirdHopAmountOut == 0) {
            return expected;
        }

        expected.treasuryFirstHop =
            _applyTransferFee((netFirstHopInput * PROTOCOL_FEE_BPS) / FEE_BASE, feeTokenOne.feeBps());
        expected.treasurySecondHop = (firstHopAmountOut * PROTOCOL_FEE_BPS) / FEE_BASE;
        expected.treasuryThirdHop =
            _applyTransferFee((netThirdHopInput * PROTOCOL_FEE_BPS) / FEE_BASE, feeTokenTwo.feeBps());
        expected.treasuryFourthHop = (thirdHopAmountOut * PROTOCOL_FEE_BPS) / FEE_BASE;
        expected.recipientOut = _quoteAmountOut(pairMidTwoOut, address(midTokenTwo), address(outToken), thirdHopAmountOut);
    }

    function _applyExpectedBalances(FourHopExpectations memory expected) private {
        expectedTreasuryFeeTokenOne += expected.treasuryFirstHop;
        expectedTreasuryMidTokenOne += expected.treasurySecondHop;
        expectedTreasuryFeeTokenTwo += expected.treasuryThirdHop;
        expectedTreasuryMidTokenTwo += expected.treasuryFourthHop;
        expectedRecipientOut += expected.recipientOut;
    }

    function _amountIn(uint256 rawAmountIn) private view returns (uint256) {
        (uint256 reserveInput, ) = _reservesFor(address(feeTokenOne), address(midTokenOne), pairFeeOneMidOne);
        return bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
    }

    function _trackedTokenSum(MockERC20 token) private view returns (uint256) {
        return token.balanceOf(lp)
            + token.balanceOf(trader)
            + token.balanceOf(recipient)
            + token.balanceOf(treasury)
            + token.balanceOf(address(router))
            + token.balanceOf(address(pairFeeOneMidOne))
            + token.balanceOf(address(pairMidOneFeeTwo))
            + token.balanceOf(address(pairFeeTwoMidTwo))
            + token.balanceOf(address(pairMidTwoOut));
    }

    function _quoteAmountOut(FluxSwapPair pair, address input, address output, uint256 amountIn)
        private
        view
        returns (uint256)
    {
        (uint256 reserveInput, uint256 reserveOutput) = _reservesFor(input, output, pair);
        return router.getAmountOut(amountIn, reserveInput, reserveOutput);
    }

    function _applyTransferFee(uint256 amount, uint256 feeBps) private pure returns (uint256) {
        return amount - ((amount * feeBps) / FEE_BASE);
    }

    function _fiveHopPath() private view returns (address[] memory path) {
        path = new address[](5);
        path[0] = address(feeTokenOne);
        path[1] = address(midTokenOne);
        path[2] = address(feeTokenTwo);
        path[3] = address(midTokenTwo);
        path[4] = address(outToken);
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

contract FluxSwapFeeOnTransferMultiHopInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockFeeOnTransferERC20 private feeTokenOne;
    MockERC20 private midTokenOne;
    MockFeeOnTransferERC20 private feeTokenTwo;
    MockERC20 private midTokenTwo;
    MockERC20 private outToken;
    FluxSwapPair private pairFeeOneMidOne;
    FluxSwapPair private pairMidOneFeeTwo;
    FluxSwapPair private pairFeeTwoMidTwo;
    FluxSwapPair private pairMidTwoOut;
    FluxSwapFeeOnTransferMultiHopInvariantHandler private handler;

    address private lp;
    address private trader;
    address private recipient;
    address private treasury;

    function setUp() public {
        lp = makeAddr("lp");
        trader = makeAddr("trader");
        recipient = makeAddr("recipient");
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), address(weth));

        feeTokenOne = new MockFeeOnTransferERC20("Fee Token One", "FEE1", 18, 300);
        midTokenOne = new MockERC20("Mid Token One", "MID1", 18);
        feeTokenTwo = new MockFeeOnTransferERC20("Fee Token Two", "FEE2", 18, 500);
        midTokenTwo = new MockERC20("Mid Token Two", "MID2", 18);
        outToken = new MockERC20("Out Token", "OUT", 18);

        pairFeeOneMidOne = _seedGenericPair(feeTokenOne, midTokenOne, 8e18, 12e18, lp);
        pairMidOneFeeTwo = _seedGenericPair(midTokenOne, feeTokenTwo, 11e18, 9e18, lp);
        pairFeeTwoMidTwo = _seedGenericPair(feeTokenTwo, midTokenTwo, 7e18, 10e18, lp);
        pairMidTwoOut = _seedGenericPair(midTokenTwo, outToken, 13e18, 14e18, lp);

        address[4] memory pairAddresses = [
            address(pairFeeOneMidOne),
            address(pairMidOneFeeTwo),
            address(pairFeeTwoMidTwo),
            address(pairMidTwoOut)
        ];
        address[5] memory tokenAddresses = [
            address(feeTokenOne),
            address(midTokenOne),
            address(feeTokenTwo),
            address(midTokenTwo),
            address(outToken)
        ];
        address[4] memory actors = [lp, trader, recipient, treasury];

        handler = new FluxSwapFeeOnTransferMultiHopInvariantHandler(router, pairAddresses, tokenAddresses, actors);

        targetContract(address(handler));
    }

    // 不变量 1：四条 supporting Pair 的 reserve 必须始终与当前真实余额同步。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(pairFeeOneMidOne);
        _assertPairReserves(pairMidOneFeeTwo);
        _assertPairReserves(pairFeeTwoMidTwo);
        _assertPairReserves(pairMidTwoOut);
    }

    // 不变量 2：每一跳的协议费都必须与“真实净输入”模型累计值一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(feeTokenOne.balanceOf(treasury), handler.expectedTreasuryFeeTokenOne());
        assertEq(midTokenOne.balanceOf(treasury), handler.expectedTreasuryMidTokenOne());
        assertEq(feeTokenTwo.balanceOf(treasury), handler.expectedTreasuryFeeTokenTwo());
        assertEq(midTokenTwo.balanceOf(treasury), handler.expectedTreasuryMidTokenTwo());
    }

    // 不变量 3：最终 recipient 的 outToken 到账必须与四跳 supporting 路径模型一致。
    function invariant_recipientBalanceMatchesModel() public view {
        assertEq(outToken.balanceOf(recipient), handler.expectedRecipientOut());
    }

    // 不变量 4：Router 在纯 token 四跳路径里不得残留底层 token、LP 或 ETH。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(address(router).balance, 0);
        assertEq(feeTokenOne.balanceOf(address(router)), 0);
        assertEq(midTokenOne.balanceOf(address(router)), 0);
        assertEq(feeTokenTwo.balanceOf(address(router)), 0);
        assertEq(midTokenTwo.balanceOf(address(router)), 0);
        assertEq(outToken.balanceOf(address(router)), 0);
        assertEq(pairFeeOneMidOne.balanceOf(address(router)), 0);
        assertEq(pairMidOneFeeTwo.balanceOf(address(router)), 0);
        assertEq(pairFeeTwoMidTwo.balanceOf(address(router)), 0);
        assertEq(pairMidTwoOut.balanceOf(address(router)), 0);
    }

    // 不变量 5：五种底层 token 的总量必须都能被已跟踪账户、Pair、Treasury、Router 完整解释。
    function invariant_tokenConservationCloses() public view {
        assertEq(feeTokenOne.totalSupply(), handler.trackedFeeTokenOneSum());
        assertEq(midTokenOne.totalSupply(), handler.trackedMidTokenOneSum());
        assertEq(feeTokenTwo.totalSupply(), handler.trackedFeeTokenTwoSum());
        assertEq(midTokenTwo.totalSupply(), handler.trackedMidTokenTwoSum());
        assertEq(outToken.totalSupply(), handler.trackedOutTokenSum());
    }

    function _seedGenericPair(MockERC20 tokenA, MockERC20 tokenB, uint256 amountA, uint256 amountB, address lpAddr)
        private
        returns (FluxSwapPair pair)
    {
        factory.createPair(address(tokenA), address(tokenB));
        address pairAddress = factory.getPair(address(tokenA), address(tokenB));

        tokenA.mint(lpAddr, amountA);
        tokenB.mint(lpAddr, amountB);

        vm.startPrank(lpAddr);
        tokenA.transfer(pairAddress, amountA);
        tokenB.transfer(pairAddress, amountB);
        FluxSwapPair(pairAddress).mint(lpAddr);
        vm.stopPrank();

        pair = FluxSwapPair(pairAddress);
    }

    function _assertPairReserves(FluxSwapPair pair) private view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, MockERC20(pair.token0()).balanceOf(address(pair)));
        assertEq(reserve1, MockERC20(pair.token1()).balanceOf(address(pair)));
    }
}
