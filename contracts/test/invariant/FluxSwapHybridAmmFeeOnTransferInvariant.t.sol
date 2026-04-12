// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "../../contracts/mocks/MockFeeOnTransferERC20.sol";

contract FluxSwapHybridAmmFeeOnTransferInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;

    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable feeQuotePair;
    FluxSwapPair public immutable baseQuotePair;
    MockFeeOnTransferERC20 public immutable feeToken;
    MockERC20 public immutable quoteToken;
    MockERC20 public immutable baseToken;

    address public immutable lpA;
    address public immutable lpB;
    address public immutable lpC;
    address public immutable traderFeeA;
    address public immutable traderFeeB;
    address public immutable traderPlainA;
    address public immutable traderPlainB;
    address public immutable recipientQuoteA;
    address public immutable recipientQuoteB;
    address public immutable recipientBaseA;
    address public immutable recipientBaseB;
    address public immutable recipientFeeA;
    address public immutable recipientFeeB;
    address public immutable treasury;

    uint256 public expectedTreasuryFeeToken;
    uint256 public expectedTreasuryQuoteToken;
    uint256 public expectedTreasuryBaseToken;
    uint256 public expectedRecipientQuote;
    uint256 public expectedRecipientBase;
    uint256 public expectedRecipientFee;
    uint256 public expectedFeeQuoteLpA;
    uint256 public expectedFeeQuoteLpB;
    uint256 public expectedFeeQuoteLpC;
    uint256 public expectedBaseQuoteLpA;
    uint256 public expectedBaseQuoteLpB;
    uint256 public expectedBaseQuoteLpC;
    uint256 public expectedLpAFeeTokenBalance;
    uint256 public expectedLpAQuoteTokenBalance;
    uint256 public expectedLpABaseTokenBalance;
    uint256 public expectedLpBFeeTokenBalance;
    uint256 public expectedLpBQuoteTokenBalance;
    uint256 public expectedLpBBaseTokenBalance;
    uint256 public expectedLpCFeeTokenBalance;
    uint256 public expectedLpCQuoteTokenBalance;
    uint256 public expectedLpCBaseTokenBalance;
    uint256[3] private initialLpFeeTokenBalances;
    uint256[3] private initialLpQuoteTokenBalances;
    uint256[3] private initialLpBaseTokenBalances;
    uint256[3] private feeQuoteModeledFeeTokenBalances;
    uint256[3] private feeQuoteModeledQuoteTokenBalances;
    uint256[3] private baseQuoteModeledQuoteTokenBalances;
    uint256[3] private baseQuoteModeledBaseTokenBalances;

    constructor(
        FluxSwapRouter router_,
        address[2] memory pairAddresses,
        address[3] memory tokenAddresses,
        address[14] memory actors
    ) {
        router = router_;
        feeQuotePair = FluxSwapPair(pairAddresses[0]);
        baseQuotePair = FluxSwapPair(pairAddresses[1]);
        feeToken = MockFeeOnTransferERC20(tokenAddresses[0]);
        quoteToken = MockERC20(tokenAddresses[1]);
        baseToken = MockERC20(tokenAddresses[2]);
        lpA = actors[0];
        lpB = actors[1];
        lpC = actors[2];
        traderFeeA = actors[3];
        traderFeeB = actors[4];
        traderPlainA = actors[5];
        traderPlainB = actors[6];
        recipientQuoteA = actors[7];
        recipientQuoteB = actors[8];
        recipientBaseA = actors[9];
        recipientBaseB = actors[10];
        recipientFeeA = actors[11];
        recipientFeeB = actors[12];
        treasury = actors[13];

        // 初始 LP 份额直接从已建好的两个 Pair 读取，后续只允许 add/remove liquidity 更新。
        expectedFeeQuoteLpA = feeQuotePair.balanceOf(lpA);
        expectedFeeQuoteLpB = feeQuotePair.balanceOf(lpB);
        expectedFeeQuoteLpC = feeQuotePair.balanceOf(lpC);
        expectedBaseQuoteLpA = baseQuotePair.balanceOf(lpA);
        expectedBaseQuoteLpB = baseQuotePair.balanceOf(lpB);
        expectedBaseQuoteLpC = baseQuotePair.balanceOf(lpC);
        _syncLpUnderlyingSnapshots(lpA);
        _syncLpUnderlyingSnapshots(lpB);
        _syncLpUnderlyingSnapshots(lpC);
        _recordInitialLpUnderlyingBalances();
    }

    // 这套 hybrid invariant 把普通 AMM、supporting AMM、多 LP actor 以及两条 Pair 的 mint / burn / swap
    // 一起放进同一套路由环境：
    // 1. 普通 Pair：baseToken <-> quoteToken
    // 2. supporting Pair：feeToken <-> quoteToken
    // 3. 多跳桥接：feeToken -> quoteToken -> baseToken、baseToken -> quoteToken -> feeToken
    // 4. 流动性增减：feeQuotePair / baseQuotePair 都允许在随机序列里由不同 LP actor 加减仓
    // 目标是验证普通 swap、supporting swap、多跳桥接与多 LP 流动性迁移混排时的协议费、净到账和总量守恒。
    function addLiquidityFeeQuote(uint8 actorSeed, uint256 rawFeeAmount, uint256 rawQuoteAmount) external {
        (uint256 feeReserve, uint256 quoteReserve) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);

        uint256 amountFee = bound(rawFeeAmount, 2_000, (feeReserve / 10) + 2_000);
        uint256 amountQuote = bound(rawQuoteAmount, 2_000, (quoteReserve / 10) + 2_000);
        address actor = _selectLp(actorSeed);

        uint256 usedFee;
        uint256 usedQuote;
        uint256 liquidity;

        feeToken.mint(actor, amountFee);
        quoteToken.mint(actor, amountQuote);

        vm.startPrank(actor);
        feeToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        (usedFee, usedQuote, liquidity) =
            router.addLiquidity(address(feeToken), address(quoteToken), amountFee, amountQuote, 0, 0, actor, _deadline());
        vm.stopPrank();

        // fee-on-transfer 池子同时约束两层账本：
        // 1. LP 份额按真实铸造数量增长
        // 2. 钱包余额按“本次 mint 进去的金额 - Router 实际拿去加池的金额”建模
        _increaseLpExpectation(actor, true, liquidity);
        _increaseLpUnderlyingExpectation(actor, amountFee - usedFee, amountQuote - usedQuote, 0);
        _increaseFeeQuotePairUnderlyingExpectation(actor, amountFee - usedFee, amountQuote - usedQuote);
    }

    function addLiquidityBaseQuote(uint8 actorSeed, uint256 rawBaseAmount, uint256 rawQuoteAmount) external {
        (uint256 baseReserve, uint256 quoteReserve) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);

        uint256 amountBase = bound(rawBaseAmount, 1, (baseReserve / 10) + 1);
        uint256 amountQuote = bound(rawQuoteAmount, 1, (quoteReserve / 10) + 1);
        address actor = _selectLp(actorSeed);

        uint256 usedBase;
        uint256 usedQuote;
        uint256 liquidity;

        baseToken.mint(actor, amountBase);
        quoteToken.mint(actor, amountQuote);

        vm.startPrank(actor);
        baseToken.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        (usedBase, usedQuote, liquidity) =
            router.addLiquidity(address(baseToken), address(quoteToken), amountBase, amountQuote, 0, 0, actor, _deadline());
        vm.stopPrank();

        // 普通池的钱包余额按“mint 进来 - 实际入池”精确累计，避免用事后快照掩盖中间流量。
        _increaseLpExpectation(actor, false, liquidity);
        _increaseLpUnderlyingExpectation(actor, 0, amountQuote - usedQuote, amountBase - usedBase);
        _increaseBaseQuotePairUnderlyingExpectation(actor, amountQuote - usedQuote, amountBase - usedBase);
    }

    function removeLiquidityFeeQuote(uint8 actorSeed, uint16 rawShareBps) external {
        _removeLiquidity(feeQuotePair, address(feeToken), address(quoteToken), _selectLp(actorSeed), rawShareBps);
    }

    function removeLiquidityBaseQuote(uint8 actorSeed, uint16 rawShareBps) external {
        _removeLiquidity(baseQuotePair, address(baseToken), address(quoteToken), _selectLp(actorSeed), rawShareBps);
    }

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
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(quoteToken), address(feeToken), feeQuotePair);
        uint256 amountIn = bound(rawAmountIn, 2_000, (reserveInput / 20) + 2_000);
        uint256 grossAmountOut = router.getAmountOut(amountIn, reserveInput, reserveOutput);
        uint256 netRecipientOut = _applyTransferFee(grossAmountOut);
        if (grossAmountOut == 0 || netRecipientOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        quoteToken.mint(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _twoHopPath(address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryQuoteToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += netRecipientOut;
    }

    function swapBaseToQuote(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveInput / 20) + 1);
        uint256 amountOut = router.getAmountOut(amountIn, reserveInput, reserveOutput);
        if (amountOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectQuoteRecipient(actorSeed);

        baseToken.mint(trader, amountIn);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokens(
            amountIn,
            amountOut,
            _twoHopPath(address(baseToken), address(quoteToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryBaseToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientQuote += amountOut;
    }

    function swapQuoteToBase(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 reserveInput, uint256 reserveOutput) =
            _reservesFor(address(quoteToken), address(baseToken), baseQuotePair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveInput / 20) + 1);
        uint256 amountOut = router.getAmountOut(amountIn, reserveInput, reserveOutput);
        if (amountOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);

        quoteToken.mint(trader, amountIn);
        vm.prank(trader);
        quoteToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokens(
            amountIn,
            amountOut,
            _twoHopPath(address(quoteToken), address(baseToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryQuoteToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientBase += amountOut;
    }

    function swapFeeToBaseMultiHop(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 feeReserveIn, uint256 quoteReserveOut) =
            _reservesFor(address(feeToken), address(quoteToken), feeQuotePair);
        (uint256 quoteReserveIn, uint256 baseReserveOut) =
            _reservesFor(address(quoteToken), address(baseToken), baseQuotePair);

        uint256 amountIn = bound(rawAmountIn, 2_000, (feeReserveIn / 20) + 2_000);
        uint256 netFirstHopInput = _applyTransferFee(amountIn);
        if (netFirstHopInput == 0) {
            return;
        }

        uint256 firstHopQuoteOut = router.getAmountOut(netFirstHopInput, feeReserveIn, quoteReserveOut);
        if (firstHopQuoteOut == 0) {
            return;
        }

        uint256 finalBaseOut = router.getAmountOut(firstHopQuoteOut, quoteReserveIn, baseReserveOut);
        if (finalBaseOut == 0) {
            return;
        }

        address trader = _selectFeeTrader(actorSeed);
        address recipient = _selectBaseRecipient(actorSeed);

        feeToken.mint(trader, amountIn);
        vm.prank(trader);
        feeToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            1,
            _threeHopPath(address(feeToken), address(quoteToken), address(baseToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryFeeToken += _applyTransferFee((netFirstHopInput * PROTOCOL_FEE_BPS) / BPS_BASE);
        expectedTreasuryQuoteToken += (firstHopQuoteOut * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientBase += finalBaseOut;
    }

    // 这里专门锁多跳输出 token 为 fee-on-transfer 时的 amountOutMin：
    // 必须按 recipient 最终净收到的 feeToken 校验，不能按第二跳毛输出放行。
    function swapBaseToFeeMultiHopAmountOutBoundary(uint8 actorSeed, uint256 rawAmountIn) external {
        (uint256 baseReserveIn, uint256 quoteReserveOut) =
            _reservesFor(address(baseToken), address(quoteToken), baseQuotePair);
        (uint256 quoteReserveIn, uint256 feeReserveOut) =
            _reservesFor(address(quoteToken), address(feeToken), feeQuotePair);

        uint256 amountIn = bound(rawAmountIn, 2_000, (baseReserveIn / 20) + 2_000);
        uint256 firstHopQuoteOut = router.getAmountOut(amountIn, baseReserveIn, quoteReserveOut);
        if (firstHopQuoteOut == 0) {
            return;
        }

        uint256 secondHopGrossFeeOut = router.getAmountOut(firstHopQuoteOut, quoteReserveIn, feeReserveOut);
        uint256 finalNetFeeOut = _applyTransferFee(secondHopGrossFeeOut);
        if (secondHopGrossFeeOut == 0 || finalNetFeeOut == 0) {
            return;
        }

        address trader = _selectPlainTrader(actorSeed);
        address recipient = _selectFeeRecipient(actorSeed);

        baseToken.mint(trader, amountIn);
        vm.prank(trader);
        baseToken.approve(address(router), type(uint256).max);

        vm.prank(trader);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            finalNetFeeOut + 1,
            _threeHopPath(address(baseToken), address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        vm.prank(trader);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            finalNetFeeOut,
            _threeHopPath(address(baseToken), address(quoteToken), address(feeToken)),
            recipient,
            _deadline()
        );

        expectedTreasuryBaseToken += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedTreasuryQuoteToken += (firstHopQuoteOut * PROTOCOL_FEE_BPS) / BPS_BASE;
        expectedRecipientFee += finalNetFeeOut;
    }

    function trackedFeeTokenSum() external view returns (uint256) {
        return feeToken.balanceOf(lpA)
            + feeToken.balanceOf(lpB)
            + feeToken.balanceOf(lpC)
            + feeToken.balanceOf(traderFeeA)
            + feeToken.balanceOf(traderFeeB)
            + feeToken.balanceOf(traderPlainA)
            + feeToken.balanceOf(traderPlainB)
            + feeToken.balanceOf(recipientQuoteA)
            + feeToken.balanceOf(recipientQuoteB)
            + feeToken.balanceOf(recipientBaseA)
            + feeToken.balanceOf(recipientBaseB)
            + feeToken.balanceOf(recipientFeeA)
            + feeToken.balanceOf(recipientFeeB)
            + feeToken.balanceOf(address(feeQuotePair))
            + feeToken.balanceOf(address(baseQuotePair))
            + feeToken.balanceOf(treasury)
            + feeToken.balanceOf(address(router));
    }

    function trackedQuoteTokenSum() external view returns (uint256) {
        return quoteToken.balanceOf(lpA)
            + quoteToken.balanceOf(lpB)
            + quoteToken.balanceOf(lpC)
            + quoteToken.balanceOf(traderFeeA)
            + quoteToken.balanceOf(traderFeeB)
            + quoteToken.balanceOf(traderPlainA)
            + quoteToken.balanceOf(traderPlainB)
            + quoteToken.balanceOf(recipientQuoteA)
            + quoteToken.balanceOf(recipientQuoteB)
            + quoteToken.balanceOf(recipientBaseA)
            + quoteToken.balanceOf(recipientBaseB)
            + quoteToken.balanceOf(recipientFeeA)
            + quoteToken.balanceOf(recipientFeeB)
            + quoteToken.balanceOf(address(feeQuotePair))
            + quoteToken.balanceOf(address(baseQuotePair))
            + quoteToken.balanceOf(treasury)
            + quoteToken.balanceOf(address(router));
    }

    function trackedBaseTokenSum() external view returns (uint256) {
        return baseToken.balanceOf(lpA)
            + baseToken.balanceOf(lpB)
            + baseToken.balanceOf(lpC)
            + baseToken.balanceOf(traderFeeA)
            + baseToken.balanceOf(traderFeeB)
            + baseToken.balanceOf(traderPlainA)
            + baseToken.balanceOf(traderPlainB)
            + baseToken.balanceOf(recipientQuoteA)
            + baseToken.balanceOf(recipientQuoteB)
            + baseToken.balanceOf(recipientBaseA)
            + baseToken.balanceOf(recipientBaseB)
            + baseToken.balanceOf(recipientFeeA)
            + baseToken.balanceOf(recipientFeeB)
            + baseToken.balanceOf(address(feeQuotePair))
            + baseToken.balanceOf(address(baseQuotePair))
            + baseToken.balanceOf(treasury)
            + baseToken.balanceOf(address(router));
    }

    function trackedFeeQuoteLpSupply() external view returns (uint256) {
        return feeQuotePair.balanceOf(lpA) + feeQuotePair.balanceOf(lpB) + feeQuotePair.balanceOf(lpC)
            + feeQuotePair.balanceOf(address(0)) + feeQuotePair.balanceOf(address(router));
    }

    function trackedBaseQuoteLpSupply() external view returns (uint256) {
        return baseQuotePair.balanceOf(lpA) + baseQuotePair.balanceOf(lpB) + baseQuotePair.balanceOf(lpC)
            + baseQuotePair.balanceOf(address(0)) + baseQuotePair.balanceOf(address(router));
    }

    function lpBalanceExpectationsMatch() external view returns (bool) {
        return feeQuotePair.balanceOf(lpA) == expectedFeeQuoteLpA && feeQuotePair.balanceOf(lpB) == expectedFeeQuoteLpB
            && feeQuotePair.balanceOf(lpC) == expectedFeeQuoteLpC
            && baseQuotePair.balanceOf(lpA) == expectedBaseQuoteLpA
            && baseQuotePair.balanceOf(lpB) == expectedBaseQuoteLpB
            && baseQuotePair.balanceOf(lpC) == expectedBaseQuoteLpC;
    }

    function lpUnderlyingBalanceSnapshotsMatch() external view returns (bool) {
        return feeToken.balanceOf(lpA) == expectedLpAFeeTokenBalance
            && quoteToken.balanceOf(lpA) == expectedLpAQuoteTokenBalance
            && baseToken.balanceOf(lpA) == expectedLpABaseTokenBalance
            && feeToken.balanceOf(lpB) == expectedLpBFeeTokenBalance
            && quoteToken.balanceOf(lpB) == expectedLpBQuoteTokenBalance
            && baseToken.balanceOf(lpB) == expectedLpBBaseTokenBalance
            && feeToken.balanceOf(lpC) == expectedLpCFeeTokenBalance
            && quoteToken.balanceOf(lpC) == expectedLpCQuoteTokenBalance
            && baseToken.balanceOf(lpC) == expectedLpCBaseTokenBalance;
    }

    function pairIsolatedUnderlyingExpectationsMatch() external view returns (bool) {
        for (uint256 i = 0; i < 3; i++) {
            address actor = _lpByIndex(i);
            if (feeToken.balanceOf(actor) != initialLpFeeTokenBalances[i] + feeQuoteModeledFeeTokenBalances[i]) {
                return false;
            }
            if (baseToken.balanceOf(actor) != initialLpBaseTokenBalances[i] + baseQuoteModeledBaseTokenBalances[i]) {
                return false;
            }
            if (
                quoteToken.balanceOf(actor)
                    != initialLpQuoteTokenBalances[i] + feeQuoteModeledQuoteTokenBalances[i]
                        + baseQuoteModeledQuoteTokenBalances[i]
            ) {
                return false;
            }
        }

        return true;
    }

    function recipientQuoteBalanceSum() external view returns (uint256) {
        return quoteToken.balanceOf(recipientQuoteA) + quoteToken.balanceOf(recipientQuoteB);
    }

    function recipientBaseBalanceSum() external view returns (uint256) {
        return baseToken.balanceOf(recipientBaseA) + baseToken.balanceOf(recipientBaseB);
    }

    function recipientFeeBalanceSum() external view returns (uint256) {
        return feeToken.balanceOf(recipientFeeA) + feeToken.balanceOf(recipientFeeB);
    }

    function _selectFeeTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderFeeA : traderFeeB;
    }

    function _selectLp(uint8 actorSeed) private view returns (address) {
        uint8 slot = actorSeed % 3;
        if (slot == 0) {
            return lpA;
        }
        if (slot == 1) {
            return lpB;
        }
        return lpC;
    }

    function _selectPlainTrader(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? traderPlainA : traderPlainB;
    }

    function _selectQuoteRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientQuoteA : recipientQuoteB;
    }

    function _selectBaseRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientBaseA : recipientBaseB;
    }

    function _selectFeeRecipient(uint8 actorSeed) private view returns (address) {
        return actorSeed % 2 == 0 ? recipientFeeA : recipientFeeB;
    }

    function _applyTransferFee(uint256 amount) private view returns (uint256) {
        return amount - ((amount * feeToken.feeBps()) / BPS_BASE);
    }

    function _removeLiquidity(FluxSwapPair pair, address tokenA, address tokenB, address actor, uint16 rawShareBps)
        private
    {
        uint256 lpBalance = pair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }
        uint256 amountA;
        uint256 amountB;

        vm.prank(actor);
        pair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        (amountA, amountB) = router.removeLiquidity(tokenA, tokenB, liquidityToRemove, 0, 0, actor, _deadline());

        if (address(pair) == address(feeQuotePair)) {
            _decreaseLpExpectation(actor, true, liquidityToRemove);
            // feeToken 在 removeLiquidity 时也会扣转账税，因此这里按真实净到账记入钱包模型。
            _increaseLpUnderlyingExpectation(actor, _applyTransferFee(amountA), amountB, 0);
            _increaseFeeQuotePairUnderlyingExpectation(actor, _applyTransferFee(amountA), amountB);
            return;
        }

        _decreaseLpExpectation(actor, false, liquidityToRemove);
        _increaseLpUnderlyingExpectation(actor, 0, amountB, amountA);
        _increaseBaseQuotePairUnderlyingExpectation(actor, amountB, amountA);
    }

    function _syncFeeQuoteLpExpectation(address actor) private {
        uint256 currentBalance = feeQuotePair.balanceOf(actor);
        if (actor == lpA) {
            expectedFeeQuoteLpA = currentBalance;
            return;
        }
        if (actor == lpB) {
            expectedFeeQuoteLpB = currentBalance;
            return;
        }
        expectedFeeQuoteLpC = currentBalance;
    }

    function _syncBaseQuoteLpExpectation(address actor) private {
        uint256 currentBalance = baseQuotePair.balanceOf(actor);
        if (actor == lpA) {
            expectedBaseQuoteLpA = currentBalance;
            return;
        }
        if (actor == lpB) {
            expectedBaseQuoteLpB = currentBalance;
            return;
        }
        expectedBaseQuoteLpC = currentBalance;
    }

    function _syncLpUnderlyingSnapshots(address actor) private {
        if (actor == lpA) {
            expectedLpAFeeTokenBalance = feeToken.balanceOf(actor);
            expectedLpAQuoteTokenBalance = quoteToken.balanceOf(actor);
            expectedLpABaseTokenBalance = baseToken.balanceOf(actor);
            return;
        }
        if (actor == lpB) {
            expectedLpBFeeTokenBalance = feeToken.balanceOf(actor);
            expectedLpBQuoteTokenBalance = quoteToken.balanceOf(actor);
            expectedLpBBaseTokenBalance = baseToken.balanceOf(actor);
            return;
        }

        expectedLpCFeeTokenBalance = feeToken.balanceOf(actor);
        expectedLpCQuoteTokenBalance = quoteToken.balanceOf(actor);
        expectedLpCBaseTokenBalance = baseToken.balanceOf(actor);
    }

    function _recordInitialLpUnderlyingBalances() private {
        initialLpFeeTokenBalances[0] = feeToken.balanceOf(lpA);
        initialLpQuoteTokenBalances[0] = quoteToken.balanceOf(lpA);
        initialLpBaseTokenBalances[0] = baseToken.balanceOf(lpA);

        initialLpFeeTokenBalances[1] = feeToken.balanceOf(lpB);
        initialLpQuoteTokenBalances[1] = quoteToken.balanceOf(lpB);
        initialLpBaseTokenBalances[1] = baseToken.balanceOf(lpB);

        initialLpFeeTokenBalances[2] = feeToken.balanceOf(lpC);
        initialLpQuoteTokenBalances[2] = quoteToken.balanceOf(lpC);
        initialLpBaseTokenBalances[2] = baseToken.balanceOf(lpC);
    }

    function _increaseLpExpectation(address actor, bool isFeeQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        if (isFeeQuotePair) {
            if (actor == lpA) {
                expectedFeeQuoteLpA += liquidityDelta;
                return;
            }
            if (actor == lpB) {
                expectedFeeQuoteLpB += liquidityDelta;
                return;
            }
            expectedFeeQuoteLpC += liquidityDelta;
            return;
        }

        if (actor == lpA) {
            expectedBaseQuoteLpA += liquidityDelta;
            return;
        }
        if (actor == lpB) {
            expectedBaseQuoteLpB += liquidityDelta;
            return;
        }
        expectedBaseQuoteLpC += liquidityDelta;
    }

    function _decreaseLpExpectation(address actor, bool isFeeQuotePair, uint256 liquidityDelta) private {
        if (liquidityDelta == 0) {
            return;
        }

        if (isFeeQuotePair) {
            if (actor == lpA) {
                expectedFeeQuoteLpA -= liquidityDelta;
                return;
            }
            if (actor == lpB) {
                expectedFeeQuoteLpB -= liquidityDelta;
                return;
            }
            expectedFeeQuoteLpC -= liquidityDelta;
            return;
        }

        if (actor == lpA) {
            expectedBaseQuoteLpA -= liquidityDelta;
            return;
        }
        if (actor == lpB) {
            expectedBaseQuoteLpB -= liquidityDelta;
            return;
        }
        expectedBaseQuoteLpC -= liquidityDelta;
    }

    function _increaseLpUnderlyingExpectation(address actor, uint256 feeDelta, uint256 quoteDelta, uint256 baseDelta)
        private
    {
        if (actor == lpA) {
            expectedLpAFeeTokenBalance += feeDelta;
            expectedLpAQuoteTokenBalance += quoteDelta;
            expectedLpABaseTokenBalance += baseDelta;
            return;
        }
        if (actor == lpB) {
            expectedLpBFeeTokenBalance += feeDelta;
            expectedLpBQuoteTokenBalance += quoteDelta;
            expectedLpBBaseTokenBalance += baseDelta;
            return;
        }

        expectedLpCFeeTokenBalance += feeDelta;
        expectedLpCQuoteTokenBalance += quoteDelta;
        expectedLpCBaseTokenBalance += baseDelta;
    }

    function _increaseFeeQuotePairUnderlyingExpectation(address actor, uint256 feeDelta, uint256 quoteDelta) private {
        uint256 actorIndex = _lpIndex(actor);
        feeQuoteModeledFeeTokenBalances[actorIndex] += feeDelta;
        feeQuoteModeledQuoteTokenBalances[actorIndex] += quoteDelta;
    }

    function _increaseBaseQuotePairUnderlyingExpectation(address actor, uint256 quoteDelta, uint256 baseDelta) private {
        uint256 actorIndex = _lpIndex(actor);
        baseQuoteModeledQuoteTokenBalances[actorIndex] += quoteDelta;
        baseQuoteModeledBaseTokenBalances[actorIndex] += baseDelta;
    }

    function _lpIndex(address actor) private view returns (uint256) {
        if (actor == lpA) {
            return 0;
        }
        if (actor == lpB) {
            return 1;
        }
        require(actor == lpC, "UNKNOWN_LP");
        return 2;
    }

    function _lpByIndex(uint256 index) private view returns (address) {
        if (index == 0) {
            return lpA;
        }
        if (index == 1) {
            return lpB;
        }
        require(index == 2, "INVALID_LP_INDEX");
        return lpC;
    }

    function _twoHopPath(address tokenIn, address tokenOut) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
    }

    function _threeHopPath(address tokenIn, address tokenMid, address tokenOut)
        private
        pure
        returns (address[] memory path)
    {
        path = new address[](3);
        path[0] = tokenIn;
        path[1] = tokenMid;
        path[2] = tokenOut;
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

contract FluxSwapHybridAmmFeeOnTransferInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockFeeOnTransferERC20 private feeToken;
    MockERC20 private quoteToken;
    MockERC20 private baseToken;
    FluxSwapPair private feeQuotePair;
    FluxSwapPair private baseQuotePair;
    FluxSwapHybridAmmFeeOnTransferInvariantHandler private handler;

    address private treasury;

    function setUp() public {
        treasury = makeAddr("treasury");

        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);
        router = new FluxSwapRouter(address(factory), makeAddr("unusedWeth"));

        feeToken = new MockFeeOnTransferERC20("Hybrid Fee Token", "HFEE", 18, 300);
        quoteToken = new MockERC20("Hybrid Quote Token", "HQUOTE", 18);
        baseToken = new MockERC20("Hybrid Base Token", "HBASE", 18);

        factory.createPair(address(feeToken), address(quoteToken));
        feeQuotePair = FluxSwapPair(factory.getPair(address(feeToken), address(quoteToken)));
        factory.createPair(address(baseToken), address(quoteToken));
        baseQuotePair = FluxSwapPair(factory.getPair(address(baseToken), address(quoteToken)));

        address[2] memory pairAddresses = [address(feeQuotePair), address(baseQuotePair)];
        address[3] memory tokenAddresses = [address(feeToken), address(quoteToken), address(baseToken)];
        address[14] memory actors = [
            makeAddr("lpA"),
            makeAddr("lpB"),
            makeAddr("lpC"),
            makeAddr("traderFeeA"),
            makeAddr("traderFeeB"),
            makeAddr("traderPlainA"),
            makeAddr("traderPlainB"),
            makeAddr("recipientQuoteA"),
            makeAddr("recipientQuoteB"),
            makeAddr("recipientBaseA"),
            makeAddr("recipientBaseB"),
            makeAddr("recipientFeeA"),
            makeAddr("recipientFeeB"),
            treasury
        ];

        _seedGenericPair(feeToken, quoteToken, 5e18, 9e18, actors[0]);
        _seedGenericPair(feeToken, quoteToken, 3e18, 5e18, actors[1]);
        _seedGenericPair(feeToken, quoteToken, 2e18, 4e18, actors[2]);
        _seedGenericPair(baseToken, quoteToken, 7e18, 11e18, actors[0]);
        _seedGenericPair(baseToken, quoteToken, 4e18, 6e18, actors[1]);
        _seedGenericPair(baseToken, quoteToken, 2e18, 3e18, actors[2]);

        handler = new FluxSwapHybridAmmFeeOnTransferInvariantHandler(router, pairAddresses, tokenAddresses, actors);

        targetContract(address(handler));
    }

    // 不变量 1：普通 Pair 和 supporting Pair 的 reserve 都必须始终与当前真实余额同步。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(feeQuotePair);
        _assertPairReserves(baseQuotePair);
    }

    // 不变量 2：fee / quote / base 三类协议费余额必须与混合路径成功输入额累计值一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(feeToken.balanceOf(treasury), handler.expectedTreasuryFeeToken());
        assertEq(quoteToken.balanceOf(treasury), handler.expectedTreasuryQuoteToken());
        assertEq(baseToken.balanceOf(treasury), handler.expectedTreasuryBaseToken());
    }

    // 不变量 3：三类 recipient 的最终到账总和必须与单跳 / 多跳模型一致。
    function invariant_recipientBalancesMatchModel() public view {
        assertEq(handler.recipientQuoteBalanceSum(), handler.expectedRecipientQuote());
        assertEq(handler.recipientBaseBalanceSum(), handler.expectedRecipientBase());
        assertEq(handler.recipientFeeBalanceSum(), handler.expectedRecipientFee());
    }

    // 不变量 4：Router 在普通 AMM 与 supporting 多跳混排下不得残留底层 token 或 LP。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(feeToken.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
        assertEq(baseToken.balanceOf(address(router)), 0);
        assertEq(feeQuotePair.balanceOf(address(router)), 0);
        assertEq(baseQuotePair.balanceOf(address(router)), 0);
    }

    // 不变量 5：fee / quote / base 三种底层 token 的总量都必须能被已跟踪账户 + 两个 Pair + Treasury + Router 完整解释。
    function invariant_tokenConservationCloses() public view {
        assertEq(feeToken.totalSupply(), handler.trackedFeeTokenSum());
        assertEq(quoteToken.totalSupply(), handler.trackedQuoteTokenSum());
        assertEq(baseToken.totalSupply(), handler.trackedBaseTokenSum());
    }

    // 不变量 6：两个 Pair 的 LP 总供应量都必须由多 LP 持仓 + address(0) 完整解释。
    function invariant_lpSupplyAccountingCloses() public view {
        assertEq(feeQuotePair.totalSupply(), handler.trackedFeeQuoteLpSupply());
        assertEq(baseQuotePair.totalSupply(), handler.trackedBaseQuoteLpSupply());
    }

    // 不变量 7：三个 LP actor 在两个 Pair 上的 LP 持仓，只能随 add/remove liquidity 按预期变化，不能在其他路径里漂移。
    function invariant_lpBalanceSnapshotsMatchModel() public view {
        assertTrue(handler.lpBalanceExpectationsMatch());
    }

    // 不变量 8：三个 LP actor 的底层 token 余额，只能由 add/remove liquidity 引起变化，不能在 swap 路径里被动漂移。
    function invariant_lpUnderlyingBalanceSnapshotsMatchModel() public view {
        assertTrue(handler.lpUnderlyingBalanceSnapshotsMatch());
    }

    // 不变量 9：feeQuotePair 与 baseQuotePair 对 LP actor 底层余额的影响必须保持隔离。
    // feeToken 只能由 feeQuotePair 的 add/remove 解释，baseToken 只能由 baseQuotePair 的 add/remove 解释，
    // quoteToken 则必须能被两个 Pair 各自累计出来的净流量精确拼回。
    function invariant_pairIsolatedUnderlyingExpectationsMatch() public view {
        assertTrue(handler.pairIsolatedUnderlyingExpectationsMatch());
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
        return baseToken.balanceOf(owner);
    }
}
