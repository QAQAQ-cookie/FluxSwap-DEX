// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSwapRouterMixedExceptionInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_TOKEN_AMOUNT = 1e24;
    uint256 private constant MAX_ETH_AMOUNT = 5e21;

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
    address public immutable traderToken;
    address public immutable traderEth;
    address public immutable recipientToken;
    address public immutable recipientEth;
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
        traderToken = makeAddr("traderToken");
        traderEth = makeAddr("traderEth");
        recipientToken = makeAddr("recipientToken");
        recipientEth = makeAddr("recipientEth");
        treasury = treasury_;
    }

    // 先构造共享 tokenA 的双 Pair 初始状态，后续所有成功路径和失败路径都围绕这两条主链路混排。
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

    // 成功路径：共享 tokenA 的 token-token / token-ETH 两条主路径随机交错执行。
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

        _mintTokenA(traderToken, amountIn);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenA), address(tokenB));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderToken);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientToken, _deadline());

        expectedTreasuryTokenA += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapTokenBToTokenA(uint256 rawAmountIn) external {
        (uint256 reserveB, ) = _reservesFor(address(tokenB), address(tokenA), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveB / 20) + 1);

        _mintTokenB(traderToken, amountIn);
        vm.prank(traderToken);
        tokenB.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenB), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderToken);
        router.swapExactTokensForTokens(amountIn, amounts[1], path, recipientToken, _deadline());

        expectedTreasuryTokenB += (amountIn * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapEthToTokenA(uint256 rawEthAmount) external {
        (uint256 reserveWeth, ) = _reservesFor(address(weth), address(tokenA), tokenWethPair);
        uint256 ethAmount = bound(rawEthAmount, 1, (reserveWeth / 20) + 1);

        vm.deal(traderEth, traderEth.balance + ethAmount);

        address[] memory path = _twoHopPath(address(weth), address(tokenA));
        uint256[] memory amounts = router.getAmountsOut(ethAmount, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderEth);
        router.swapExactETHForTokens{value: ethAmount}(amounts[1], path, recipientToken, _deadline());

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapTokenAToEth(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(weth), tokenWethPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        _mintTokenA(traderToken, amountIn);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory path = _twoHopPath(address(tokenA), address(weth));
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        if (amounts[1] == 0) {
            return;
        }

        vm.prank(traderToken);
        router.swapExactTokensForETH(amountIn, amounts[1], path, recipientEth, _deadline());

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

    // 失败路径：这些动作故意命中边界或异常分支。
    // 关键要求不是“会 revert”而已，而是 revert 之后双 Pair 与共享资产状态都必须完全不被污染。
    function failExpiredTokenSwap(uint256 rawAmountIn, uint32 rawWarp) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);
        uint256 deadline = block.timestamp + bound(uint256(rawWarp), 1, 30 days);

        _mintTokenA(traderToken, amountIn);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        bytes32 snapshot = _globalStateHash();
        vm.warp(deadline + 1);

        vm.prank(traderToken);
        vm.expectRevert(bytes("FluxSwapRouter: EXPIRED"));
        router.swapExactTokensForTokens(amountIn, 0, _twoHopPath(address(tokenA), address(tokenB)), recipientToken, deadline);

        _assertStateHash(snapshot);
    }

    function failHighMinOutTokenSwap(uint256 rawAmountIn) external {
        (uint256 reserveA, ) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountIn = bound(rawAmountIn, 1, (reserveA / 20) + 1);

        _mintTokenA(traderToken, amountIn);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        uint256[] memory amounts = router.getAmountsOut(amountIn, _twoHopPath(address(tokenA), address(tokenB)));
        if (amounts[1] == 0) {
            return;
        }

        bytes32 snapshot = _globalStateHash();

        vm.prank(traderToken);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(
            amountIn, amounts[1] + 1, _twoHopPath(address(tokenA), address(tokenB)), recipientToken, _deadline()
        );

        _assertStateHash(snapshot);
    }

    function failLowMaxInTokenSwap(uint256 rawAmountOut) external {
        (, uint256 reserveB) = _reservesFor(address(tokenA), address(tokenB), tokenPair);
        uint256 amountOut = bound(rawAmountOut, 1, (reserveB / 20) + 1);
        uint256[] memory amounts = router.getAmountsIn(amountOut, _twoHopPath(address(tokenA), address(tokenB)));
        if (amounts[0] <= 1) {
            return;
        }

        _mintTokenA(traderToken, amounts[0]);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        bytes32 snapshot = _globalStateHash();

        vm.prank(traderToken);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(
            amountOut, amounts[0] - 1, _twoHopPath(address(tokenA), address(tokenB)), recipientToken, _deadline()
        );

        _assertStateHash(snapshot);
    }

    function failMissingPair(uint256 rawAmountIn) external {
        uint256 amountIn = bound(rawAmountIn, 1, MAX_TOKEN_AMOUNT);

        _mintTokenB(traderToken, amountIn);
        vm.prank(traderToken);
        tokenB.approve(address(router), type(uint256).max);

        bytes32 snapshot = _globalStateHash();

        vm.prank(traderToken);
        vm.expectRevert(bytes("FluxSwapRouter: PAIR_NOT_FOUND"));
        router.swapExactTokensForTokens(amountIn, 0, _twoHopPath(address(tokenB), address(tokenC)), recipientToken, _deadline());

        _assertStateHash(snapshot);
    }

    function failInvalidSupportingPath(uint256 rawAmountIn) external {
        uint256 amountIn = bound(rawAmountIn, 1, MAX_TOKEN_AMOUNT);

        _mintTokenA(traderToken, amountIn);
        vm.prank(traderToken);
        tokenA.approve(address(router), type(uint256).max);

        address[] memory invalidPath = new address[](1);
        invalidPath[0] = address(tokenA);
        bytes32 snapshot = _globalStateHash();

        vm.prank(traderToken);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, invalidPath, recipientToken, _deadline());

        _assertStateHash(snapshot);
    }

    function failInvalidEthPath(uint256 rawEthAmount) external {
        uint256 ethAmount = bound(rawEthAmount, 1, MAX_ETH_AMOUNT);
        vm.deal(traderEth, traderEth.balance + ethAmount);

        bytes32 snapshot = _globalStateHash();

        vm.prank(traderEth);
        vm.expectRevert(bytes("FluxSwapRouter: INVALID_PATH"));
        router.swapExactETHForTokens{value: ethAmount}(1, _twoHopPath(address(tokenA), address(tokenB)), recipientToken, _deadline());

        _assertStateHash(snapshot);
    }

    function failUnderfundedExactEthOut(uint256 rawAmountOut) external {
        (, uint256 reserveTokenA) = _reservesFor(address(weth), address(tokenA), tokenWethPair);
        uint256 amountOut = bound(rawAmountOut, 1, (reserveTokenA / 20) + 1);
        uint256[] memory amounts = router.getAmountsIn(amountOut, _twoHopPath(address(weth), address(tokenA)));
        if (amounts[0] <= 1) {
            return;
        }

        vm.deal(traderEth, traderEth.balance + amounts[0] - 1);
        bytes32 snapshot = _globalStateHash();

        vm.prank(traderEth);
        vm.expectRevert(bytes("FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"));
        router.swapETHForExactTokens{value: amounts[0] - 1}(
            amountOut, _twoHopPath(address(weth), address(tokenA)), recipientToken, _deadline()
        );

        _assertStateHash(snapshot);
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

        bytes32 snapshot = _globalStateHash();
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_B_AMOUNT"));
        router.addLiquidity(address(tokenA), address(tokenB), desiredA, desiredB, desiredA, desiredB, lpB, _deadline());
        vm.stopPrank();

        _assertStateHash(snapshot);
    }

    function failRemoveLiquidityTokenPairMinConstraint(uint16 rawShareBps) external {
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

        bytes32 snapshot = _globalStateHash();

        vm.prank(lpA);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_A_AMOUNT"));
        router.removeLiquidity(
            address(tokenA), address(tokenB), liquidityToRemove, expectedA + 1, expectedB, recipientToken, _deadline()
        );

        _assertStateHash(snapshot);
    }

    function failRemoveLiquidityEthPairMinConstraint(uint16 rawShareBps) external {
        uint256 lpBalance = tokenWethPair.balanceOf(lpA);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        uint256 pairBalanceA = tokenA.balanceOf(address(tokenWethPair));
        uint256 pairBalanceWeth = weth.balanceOf(address(tokenWethPair));
        uint256 totalSupply = tokenWethPair.totalSupply();
        uint256 expectedA = (liquidityToRemove * pairBalanceA) / totalSupply;
        uint256 expectedEth = (liquidityToRemove * pairBalanceWeth) / totalSupply;
        if (expectedA == 0 || expectedEth == 0) {
            return;
        }

        vm.prank(lpA);
        tokenWethPair.approve(address(router), type(uint256).max);

        bytes32 snapshot = _globalStateHash();

        vm.prank(lpA);
        vm.expectRevert(bytes("FluxSwapRouter: INSUFFICIENT_A_AMOUNT"));
        router.removeLiquidityETH(
            address(tokenA), liquidityToRemove, expectedA + 1, expectedEth, recipientEth, _deadline()
        );

        _assertStateHash(snapshot);
    }

    function trackedTokenASum() external view returns (uint256) {
        return tokenA.balanceOf(lpA)
            + tokenA.balanceOf(lpB)
            + tokenA.balanceOf(traderToken)
            + tokenA.balanceOf(traderEth)
            + tokenA.balanceOf(recipientToken)
            + tokenA.balanceOf(recipientEth)
            + tokenA.balanceOf(address(tokenPair))
            + tokenA.balanceOf(address(tokenWethPair))
            + tokenA.balanceOf(treasury)
            + tokenA.balanceOf(address(router));
    }

    function trackedTokenBSum() external view returns (uint256) {
        return tokenB.balanceOf(lpA)
            + tokenB.balanceOf(lpB)
            + tokenB.balanceOf(traderToken)
            + tokenB.balanceOf(traderEth)
            + tokenB.balanceOf(recipientToken)
            + tokenB.balanceOf(recipientEth)
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

    function _globalStateHash() private view returns (bytes32) {
        (uint112 tokenPairReserve0, uint112 tokenPairReserve1, ) = tokenPair.getReserves();
        (uint112 ethPairReserve0, uint112 ethPairReserve1, ) = tokenWethPair.getReserves();

        return keccak256(
            abi.encode(
                _reserveAndSupplyHash(tokenPairReserve0, tokenPairReserve1, ethPairReserve0, ethPairReserve1),
                _ethStateHash(),
                _tokenAStateHash(),
                _tokenBStateHash(),
                _wethStateHash(),
                _lpStateHash()
            )
        );
    }

    function _reserveAndSupplyHash(uint112 tokenPairReserve0, uint112 tokenPairReserve1, uint112 ethPairReserve0, uint112 ethPairReserve1)
        private
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                tokenPairReserve0,
                tokenPairReserve1,
                ethPairReserve0,
                ethPairReserve1,
                tokenPair.totalSupply(),
                tokenWethPair.totalSupply(),
                weth.totalSupply()
            )
        );
    }

    function _ethStateHash() private view returns (bytes32) {
        return keccak256(
            abi.encode(lpA.balance, lpB.balance, traderEth.balance, recipientEth.balance, address(router).balance)
        );
    }

    function _tokenAStateHash() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tokenA.balanceOf(lpA),
                tokenA.balanceOf(lpB),
                tokenA.balanceOf(traderToken),
                tokenA.balanceOf(traderEth),
                tokenA.balanceOf(recipientToken),
                tokenA.balanceOf(recipientEth),
                tokenA.balanceOf(address(tokenPair)),
                tokenA.balanceOf(address(tokenWethPair)),
                tokenA.balanceOf(treasury),
                tokenA.balanceOf(address(router))
            )
        );
    }

    function _tokenBStateHash() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tokenB.balanceOf(lpA),
                tokenB.balanceOf(lpB),
                tokenB.balanceOf(traderToken),
                tokenB.balanceOf(traderEth),
                tokenB.balanceOf(recipientToken),
                tokenB.balanceOf(recipientEth),
                tokenB.balanceOf(address(tokenPair)),
                tokenB.balanceOf(treasury),
                tokenB.balanceOf(address(router))
            )
        );
    }

    function _wethStateHash() private view returns (bytes32) {
        return keccak256(
            abi.encode(weth.balanceOf(address(tokenWethPair)), weth.balanceOf(treasury), weth.balanceOf(address(router)))
        );
    }

    function _lpStateHash() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tokenPair.balanceOf(lpA),
                tokenPair.balanceOf(lpB),
                tokenPair.balanceOf(address(0)),
                tokenPair.balanceOf(address(router)),
                tokenWethPair.balanceOf(lpA),
                tokenWethPair.balanceOf(lpB),
                tokenWethPair.balanceOf(address(0)),
                tokenWethPair.balanceOf(address(router))
            )
        );
    }

    function _assertStateHash(bytes32 snapshot) private view {
        assertEq(_globalStateHash(), snapshot);
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

contract FluxSwapRouterMixedExceptionInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockERC20 private tokenA;
    MockERC20 private tokenB;
    MockERC20 private tokenC;
    MockWETH private weth;
    FluxSwapPair private tokenPair;
    FluxSwapPair private tokenWethPair;
    FluxSwapRouterMixedExceptionInvariantHandler private handler;

    address private treasury;

    function setUp() public {
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);

        router = new FluxSwapRouter(address(factory), address(weth));
        tokenA = new MockERC20("Mixed Exception Token A", "META", 18);
        tokenB = new MockERC20("Mixed Exception Token B", "METB", 18);
        tokenC = new MockERC20("Mixed Exception Token C", "METC", 18);

        factory.createPair(address(tokenA), address(tokenB));
        tokenPair = FluxSwapPair(factory.getPair(address(tokenA), address(tokenB)));
        factory.createPair(address(tokenA), address(weth));
        tokenWethPair = FluxSwapPair(factory.getPair(address(tokenA), address(weth)));

        handler = new FluxSwapRouterMixedExceptionInvariantHandler(
            factory, router, tokenPair, tokenWethPair, tokenA, tokenB, tokenC, weth, treasury
        );

        handler.seedInitialLiquidity(8e18, 11e18, 7e18, 4e18);
        targetContract(address(handler));
    }

    // 不变量 1：共享 tokenA 的 token-token / token-WETH 两个 Pair，reserve 都必须始终等于真实余额。
    function invariant_pairReservesMatchObservedBalances() public view {
        _assertPairReserves(tokenPair);
        _assertPairReserves(tokenWethPair);
    }

    // 不变量 2：成功路径与失败路径长序列混排时，Router 不得残留 token / WETH / ETH / LP。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(tokenA.balanceOf(address(router)), 0);
        assertEq(tokenB.balanceOf(address(router)), 0);
        assertEq(tokenC.balanceOf(address(router)), 0);
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
        assertEq(tokenPair.balanceOf(address(router)), 0);
        assertEq(tokenWethPair.balanceOf(address(router)), 0);
    }

    // 不变量 3：三类协议费余额必须始终和成功 swap 路径累计出来的模型一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(tokenA.balanceOf(treasury), handler.expectedTreasuryTokenA());
        assertEq(tokenB.balanceOf(treasury), handler.expectedTreasuryTokenB());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 4：共享 tokenA / 独立 tokenB 的总量必须都能被双 Pair 与参与账户完整解释。
    function invariant_underlyingTokenConservation() public view {
        assertEq(tokenA.totalSupply(), handler.trackedTokenASum());
        assertEq(tokenB.totalSupply(), handler.trackedTokenBSum());
        assertEq(tokenA.totalSupply(), handler.totalMintedTokenA());
        assertEq(tokenB.totalSupply(), handler.totalMintedTokenB());
    }

    // 不变量 5：WETH 总供应量只能由 tokenA-WETH Pair + treasury + router 中的 WETH 余额解释。
    function invariant_wethSupplyClosesToObservedBalances() public view {
        assertEq(
            weth.totalSupply(),
            weth.balanceOf(address(tokenWethPair)) + weth.balanceOf(treasury) + weth.balanceOf(address(router))
        );
    }

    // 不变量 6：两个 Pair 的 LP 总供应量都必须闭合到 LP 持仓 + address(0) + Router。
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
