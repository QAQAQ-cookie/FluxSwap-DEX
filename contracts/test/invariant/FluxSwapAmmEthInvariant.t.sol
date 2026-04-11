// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapRouter} from "../../contracts/FluxSwapRouter.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";
import {MockWETH} from "../../contracts/mocks/MockWETH.sol";

contract FluxSwapAmmEthInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant PROTOCOL_FEE_BPS = 5;
    uint256 private constant MAX_TOKEN_AMOUNT = 1e24;
    uint256 private constant MAX_ETH_AMOUNT = 5e21;

    FluxSwapFactory public immutable factory;
    FluxSwapRouter public immutable router;
    FluxSwapPair public immutable pair;
    MockERC20 public immutable token;
    MockWETH public immutable weth;

    address public immutable lpA;
    address public immutable lpB;
    address public immutable traderEthToToken;
    address public immutable traderTokenToEth;
    address public immutable recipientToken;
    address public immutable recipientEth;
    address public immutable treasury;

    uint256 public totalMintedToken;
    uint256 public expectedTreasuryToken;
    uint256 public expectedTreasuryWeth;

    constructor(
        FluxSwapFactory factory_,
        FluxSwapRouter router_,
        FluxSwapPair pair_,
        MockERC20 token_,
        MockWETH weth_,
        address lpA_,
        address lpB_,
        address traderEthToToken_,
        address traderTokenToEth_,
        address recipientToken_,
        address recipientEth_,
        address treasury_
    ) {
        factory = factory_;
        router = router_;
        pair = pair_;
        token = token_;
        weth = weth_;
        lpA = lpA_;
        lpB = lpB_;
        traderEthToToken = traderEthToToken_;
        traderTokenToEth = traderTokenToEth_;
        recipientToken = recipientToken_;
        recipientEth = recipientEth_;
        treasury = treasury_;
    }

    function seedInitialLiquidity(uint256 rawTokenAmount, uint256 rawEthAmount) external {
        if (pair.totalSupply() != 0) {
            return;
        }

        uint256 tokenAmount = bound(rawTokenAmount, 1e12, MAX_TOKEN_AMOUNT);
        uint256 ethAmount = bound(rawEthAmount, 1e10, MAX_ETH_AMOUNT);

        token.mint(lpA, tokenAmount);
        totalMintedToken += tokenAmount;
        vm.deal(lpA, ethAmount);

        vm.startPrank(lpA);
        token.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(token), tokenAmount, 0, 0, lpA, _deadline());
        vm.stopPrank();
    }

    function addLiquidityETH(uint8 actorSeed, uint256 rawTokenAmount, uint256 rawEthAmount) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        uint256 tokenAmount = bound(rawTokenAmount, 1, MAX_TOKEN_AMOUNT);
        uint256 ethAmount = bound(rawEthAmount, 1, MAX_ETH_AMOUNT);

        token.mint(actor, tokenAmount);
        totalMintedToken += tokenAmount;
        vm.deal(actor, actor.balance + ethAmount);

        vm.startPrank(actor);
        token.approve(address(router), type(uint256).max);
        router.addLiquidityETH{value: ethAmount}(address(token), tokenAmount, 0, 0, actor, _deadline());
        vm.stopPrank();
    }

    function swapExactETHForTokens(uint256 rawEthAmount) external {
        (, uint256 reserveEth) = _orderedReserves();
        uint256 ethAmount = bound(rawEthAmount, 1, (reserveEth / 20) + 1);

        vm.deal(traderEthToToken, traderEthToToken.balance + ethAmount);

        address[] memory path = _path(address(weth), address(token));
        uint256[] memory amounts = router.getAmountsOut(ethAmount, path);
        vm.assume(amounts[1] > 0);

        vm.prank(traderEthToToken);
        router.swapExactETHForTokens{value: ethAmount}(amounts[1], path, recipientToken, _deadline());

        expectedTreasuryWeth += (ethAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function swapExactTokensForETH(uint256 rawTokenAmount) external {
        (uint256 reserveToken, ) = _orderedReserves();
        uint256 tokenAmount = bound(rawTokenAmount, 1, (reserveToken / 20) + 1);

        token.mint(traderTokenToEth, tokenAmount);
        totalMintedToken += tokenAmount;

        vm.prank(traderTokenToEth);
        token.approve(address(router), type(uint256).max);

        address[] memory path = _path(address(token), address(weth));
        uint256[] memory amounts = router.getAmountsOut(tokenAmount, path);
        vm.assume(amounts[1] > 0);

        vm.prank(traderTokenToEth);
        router.swapExactTokensForETH(tokenAmount, amounts[1], path, recipientEth, _deadline());

        expectedTreasuryToken += (tokenAmount * PROTOCOL_FEE_BPS) / BPS_BASE;
    }

    function removeLiquidityETH(uint8 actorSeed, uint16 rawShareBps) external {
        address actor = actorSeed % 2 == 0 ? lpA : lpB;
        uint256 lpBalance = pair.balanceOf(actor);
        if (lpBalance == 0) {
            return;
        }

        uint256 shareBps = bound(uint256(rawShareBps), 1, BPS_BASE);
        uint256 liquidityToRemove = (lpBalance * shareBps) / BPS_BASE;
        if (liquidityToRemove == 0) {
            return;
        }

        vm.prank(actor);
        pair.approve(address(router), type(uint256).max);

        vm.prank(actor);
        router.removeLiquidityETH(address(token), liquidityToRemove, 0, 0, actor, _deadline());
    }

    function trackedTokenSum() external view returns (uint256) {
        return token.balanceOf(lpA)
            + token.balanceOf(lpB)
            + token.balanceOf(traderEthToToken)
            + token.balanceOf(traderTokenToEth)
            + token.balanceOf(recipientToken)
            + token.balanceOf(recipientEth)
            + token.balanceOf(address(pair))
            + token.balanceOf(treasury)
            + token.balanceOf(address(router));
    }

    function trackedLpSupply() external view returns (uint256) {
        return pair.balanceOf(lpA) + pair.balanceOf(lpB) + pair.balanceOf(address(0)) + pair.balanceOf(address(router));
    }

    function _orderedReserves() private view returns (uint256 reserveToken, uint256 reserveEth) {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        (reserveToken, reserveEth) = address(token) == pair.token0() ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _path(address from, address to) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = from;
        path[1] = to;
    }

    function _deadline() private view returns (uint256) {
        return block.timestamp + 1 hours;
    }
}

contract FluxSwapAmmEthInvariantTest is StdInvariant, Test {
    FluxSwapFactory private factory;
    FluxSwapRouter private router;
    MockWETH private weth;
    MockERC20 private token;
    FluxSwapPair private pair;
    FluxSwapAmmEthInvariantHandler private handler;

    address private lpA;
    address private lpB;
    address private traderEthToToken;
    address private traderTokenToEth;
    address private recipientToken;
    address private recipientEth;
    address private treasury;

    function setUp() public {
        lpA = makeAddr("lpA");
        lpB = makeAddr("lpB");
        traderEthToToken = makeAddr("traderEthToToken");
        traderTokenToEth = makeAddr("traderTokenToEth");
        recipientToken = makeAddr("recipientToken");
        recipientEth = makeAddr("recipientEth");
        treasury = makeAddr("treasury");

        weth = new MockWETH();
        factory = new FluxSwapFactory(address(this));
        factory.setTreasury(treasury);

        router = new FluxSwapRouter(address(factory), address(weth));
        token = new MockERC20("Token A", "TKNA", 18);

        factory.createPair(address(token), address(weth));
        pair = FluxSwapPair(factory.getPair(address(token), address(weth)));

        handler = new FluxSwapAmmEthInvariantHandler(
            factory,
            router,
            pair,
            token,
            weth,
            lpA,
            lpB,
            traderEthToToken,
            traderTokenToEth,
            recipientToken,
            recipientEth,
            treasury
        );

        handler.seedInitialLiquidity(1e18, 2e18);
        targetContract(address(handler));
    }

    // 不变量 1：Pair 记录的 reserve 必须始终与 Pair 当前真实 token / WETH 余额一致。
    function invariant_pairReservesMatchObservedBalances() public view {
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        assertEq(reserve0, assetBalance(pair.token0()));
        assertEq(reserve1, assetBalance(pair.token1()));
    }

    // 不变量 2：Router 不得残留 ETH / WETH / token / LP token。
    function invariant_routerDoesNotRetainAssets() public view {
        assertEq(address(router).balance, 0);
        assertEq(weth.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(pair.balanceOf(address(router)), 0);
    }

    // 不变量 3：Treasury 的协议费余额必须与成功 swap 输入额按 5 / 10000 计提后的累计值一致。
    function invariant_protocolFeeBalancesMatchModel() public view {
        assertEq(token.balanceOf(treasury), handler.expectedTreasuryToken());
        assertEq(weth.balanceOf(treasury), handler.expectedTreasuryWeth());
    }

    // 不变量 4：底层 token 总量必须能被已跟踪账户 + Pair + Treasury + Router 完整解释。
    function invariant_tokenConservation() public view {
        assertEq(token.totalSupply(), handler.trackedTokenSum());
        assertEq(token.totalSupply(), handler.totalMintedToken());
    }

    // 不变量 5：WETH 总供应量只能由 Pair + Treasury + Router 里的 WETH 余额解释。
    function invariant_wethSupplyClosesToObservedBalances() public view {
        assertEq(weth.totalSupply(), weth.balanceOf(address(pair)) + weth.balanceOf(treasury) + weth.balanceOf(address(router)));
    }

    // 不变量 6：LP 总供应量必须能被 lpA / lpB / address(0) 完整解释。
    function invariant_lpSupplyAccountingCloses() public view {
        assertEq(pair.totalSupply(), handler.trackedLpSupply());
    }

    function assetBalance(address asset) private view returns (uint256) {
        return asset == address(token) ? token.balanceOf(address(pair)) : weth.balanceOf(address(pair));
    }
}
