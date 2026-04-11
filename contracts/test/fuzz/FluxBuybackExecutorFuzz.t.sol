// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxBuybackExecutor.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxBuybackExecutorTreasuryMock {
    bool public paused;
    uint256 public totalPulled;

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function pullApprovedToken(address token, uint256 amount) external {
        totalPulled += amount;
        MockERC20(token).transfer(msg.sender, amount);
    }

    function burnApprovedToken(address, uint256) external pure {}

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxBuybackExecutorRouterMock {
    MockERC20 public immutable buyToken;
    uint256 public amountOutBps;

    address public lastSpendToken;
    uint256 public lastAmountIn;
    uint256 public lastAmountOutMin;
    address public lastRecipient;

    constructor(MockERC20 buyToken_, uint256 amountOutBps_) {
        buyToken = buyToken_;
        amountOutBps = amountOutBps_;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        lastSpendToken = path[0];
        lastAmountIn = amountIn;
        lastAmountOutMin = amountOutMin;
        lastRecipient = to;

        MockERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = (amountIn * amountOutBps) / 10_000;
        require(amountOut >= amountOutMin, "ROUTER_SLIPPAGE");
        buyToken.mint(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
    }
}

contract FluxBuybackExecutorFuzzTest is Test {
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxBuybackExecutor private executor;
    FluxBuybackExecutorTreasuryMock private treasury;
    FluxBuybackExecutorRouterMock private router;
    MockERC20 private spendToken;
    MockERC20 private buyToken;

    address private owner;
    address private operator;
    address private outsider;

    function setUp() public {
        owner = makeAddr("owner");
        operator = makeAddr("operator");
        outsider = makeAddr("outsider");

        spendToken = new MockERC20("Spend Token", "SPEND", 18);
        buyToken = new MockERC20("Buy Token", "BUY", 18);
    }

    // 这一组 fuzz 锁定 buyback 执行器的三件事：
    // 1. recipient 只能落到 treasury，本地默认 recipient 也不能偏离。
    // 2. 一次成功 buyback 后，executor 不应残留 spendToken，也不应残留 router allowance。
    // 3. treasury paused 或 executor paused 时，buyback 必须立即拒绝执行。
    function testFuzz_executeBuyback_zeroRecipientResolvesToTreasuryAndLeavesNoAllowance(
        uint96 rawTreasuryFunding,
        uint16 rawInputBps,
        uint16 rawAmountOutBps
    ) public {
        uint256 treasuryFunding = bound(uint256(rawTreasuryFunding), 1, MAX_AMOUNT);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 amountIn = bound((treasuryFunding * uint256(rawInputBps)) / 10_000, 1, treasuryFunding);

        _deployExecutor(amountOutBps);
        spendToken.mint(address(treasury), treasuryFunding);

        vm.prank(operator);
        uint256 amountOut = executor.executeBuyback(
            address(spendToken), amountIn, 0, _path(), address(0), block.timestamp + 1 hours
        );

        assertEq(router.lastSpendToken(), address(spendToken));
        assertEq(router.lastAmountIn(), amountIn);
        assertEq(router.lastRecipient(), address(treasury));
        assertEq(treasury.totalPulled(), amountIn);
        assertEq(spendToken.balanceOf(address(executor)), 0);
        assertEq(spendToken.allowance(address(executor), address(router)), 0);
        assertEq(buyToken.balanceOf(address(treasury)), amountOut);
    }

    function testFuzz_executeBuyback_rejectsNonTreasuryRecipient(
        uint96 rawTreasuryFunding,
        uint16 rawInputBps,
        uint16 rawAmountOutBps
    ) public {
        uint256 treasuryFunding = bound(uint256(rawTreasuryFunding), 1, MAX_AMOUNT);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 amountIn = bound((treasuryFunding * uint256(rawInputBps)) / 10_000, 1, treasuryFunding);

        _deployExecutor(amountOutBps);
        spendToken.mint(address(treasury), treasuryFunding);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(FluxBuybackExecutor.InvalidRecipient.selector, outsider));
        executor.executeBuyback(address(spendToken), amountIn, 0, _path(), outsider, block.timestamp + 1 hours);
    }

    function testFuzz_pauseGuards_blockExecutorWhenTreasuryOrExecutorPaused(
        uint96 rawTreasuryFunding,
        uint16 rawInputBps,
        uint16 rawAmountOutBps
    ) public {
        uint256 treasuryFunding = bound(uint256(rawTreasuryFunding), 1, MAX_AMOUNT);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 amountIn = bound((treasuryFunding * uint256(rawInputBps)) / 10_000, 1, treasuryFunding);

        _deployExecutor(amountOutBps);
        spendToken.mint(address(treasury), treasuryFunding);

        treasury.setPaused(true);

        vm.prank(operator);
        vm.expectRevert(bytes("FluxBuybackExecutor: TREASURY_PAUSED"));
        executor.executeBuyback(address(spendToken), amountIn, 0, _path(), address(0), block.timestamp + 1 hours);

        treasury.setPaused(false);

        vm.prank(owner);
        executor.pause();

        vm.prank(operator);
        vm.expectRevert(bytes("FluxBuybackExecutor: PAUSED"));
        executor.executeBuyback(address(spendToken), amountIn, 0, _path(), address(0), block.timestamp + 1 hours);
    }

    function _deployExecutor(uint256 amountOutBps) private {
        treasury = new FluxBuybackExecutorTreasuryMock();
        router = new FluxBuybackExecutorRouterMock(buyToken, amountOutBps);
        executor = new FluxBuybackExecutor(
            owner,
            address(treasury),
            operator,
            address(router),
            address(buyToken),
            address(treasury)
        );
    }

    function _path() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(buyToken);
    }
}
