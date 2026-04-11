// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxRevenueDistributor.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueDistributorTreasuryMock {
    address public lastBurnToken;
    uint256 public totalBurned;

    function pullApprovedToken(address, uint256) external pure {}

    function burnApprovedToken(address token, uint256 amount) external {
        lastBurnToken = token;
        totalBurned += amount;
    }

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxRevenueDistributorManagerMock {
    address public treasury;
    address public rewardToken;
    uint256 public totalDistributed;

    constructor(address treasury_, address rewardToken_) {
        treasury = treasury_;
        rewardToken = rewardToken_;
    }

    function addPool(address, uint256, bool) external pure {}

    function deactivatePool(address) external pure {}

    function distributeRewards(uint256 totalReward) external {
        totalDistributed += totalReward;
    }

    function claimPoolRewards(address) external pure returns (uint256) {
        return 0;
    }

    function pendingPoolRewards(address) external pure returns (uint256) {
        return 0;
    }
}

contract FluxRevenueDistributorBuybackExecutorMock {
    address public buyToken;
    address public treasury;
    uint256 public amountOutBps;

    address public lastSpendToken;
    uint256 public lastAmountIn;
    uint256 public lastAmountOutMin;
    address public lastRecipient;
    uint256 public lastDeadline;

    constructor(address treasury_, address buyToken_, uint256 amountOutBps_) {
        treasury = treasury_;
        buyToken = buyToken_;
        amountOutBps = amountOutBps_;
    }

    function executeBuyback(
        address spendToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        lastSpendToken = spendToken;
        lastAmountIn = amountIn;
        lastAmountOutMin = amountOutMin;
        lastRecipient = recipient;
        lastDeadline = deadline;

        amountOut = (amountIn * amountOutBps) / 10_000;
        require(amountOut >= amountOutMin, "BUYBACK_SLIPPAGE");
    }
}

contract FluxRevenueDistributorFuzzTest is Test {
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxRevenueDistributor private distributor;
    FluxRevenueDistributorTreasuryMock private treasury;
    FluxRevenueDistributorManagerMock private manager;
    FluxRevenueDistributorBuybackExecutorMock private buybackExecutor;
    MockERC20 private rewardToken;
    MockERC20 private spendToken;

    address private owner;
    address private operator;

    function setUp() public {
        owner = makeAddr("owner");
        operator = makeAddr("operator");

        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
    }

    // 这一组 fuzz 验证分红分发器最核心的金额拆分语义：
    // 1. revenueAmount 先按 buybackBps 切出买回金额。
    // 2. 买回得到的 rewardToken 再按 burnBps 切出 burn 与 distribute。
    // 3. pause 之后，两条对外资金路径都必须立即停住。
    function testFuzz_executeBuybackAndDistribute_splitsBuybackBurnAndDistribution(
        uint96 rawRevenueAmount,
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps
    ) public {
        uint256 buybackBps = bound(uint256(rawBuybackBps), 1, 10_000);
        uint256 burnBps = bound(uint256(rawBurnBps), 0, 10_000);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 revenueAmount = bound(uint256(rawRevenueAmount), 10_000, MAX_AMOUNT);

        _deployDistributor(buybackBps, burnBps, amountOutBps);

        address[] memory path = _buybackPath();
        uint256 expectedBuybackAmountIn = (revenueAmount * buybackBps) / 10_000;
        uint256 expectedAmountOut = (expectedBuybackAmountIn * amountOutBps) / 10_000;
        uint256 expectedBurned = (expectedAmountOut * burnBps) / 10_000;
        uint256 expectedDistributed = expectedAmountOut - expectedBurned;

        vm.prank(operator);
        uint256 actualAmountOut = distributor.executeBuybackAndDistribute(
            address(spendToken), revenueAmount, 0, path, block.timestamp + 1 hours
        );

        assertEq(actualAmountOut, expectedAmountOut);
        assertEq(buybackExecutor.lastSpendToken(), address(spendToken));
        assertEq(buybackExecutor.lastAmountIn(), expectedBuybackAmountIn);
        assertEq(buybackExecutor.lastRecipient(), address(0));
        assertEq(treasury.totalBurned(), expectedBurned);
        assertEq(manager.totalDistributed(), expectedDistributed);

        if (expectedBurned > 0) {
            assertEq(treasury.lastBurnToken(), address(rewardToken));
        } else {
            assertEq(treasury.lastBurnToken(), address(0));
        }
    }

    function testFuzz_distributeTreasuryRewards_forwardsExactAmount(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, MAX_AMOUNT);
        _deployDistributor(6_000, 2_500, 10_000);

        vm.prank(operator);
        distributor.distributeTreasuryRewards(amount);

        assertEq(manager.totalDistributed(), amount);
        assertEq(treasury.totalBurned(), 0);
    }

    function testFuzz_pause_blocksBothDistributionPaths(uint96 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 10_000, MAX_AMOUNT);
        _deployDistributor(5_000, 1_000, 10_000);

        vm.prank(owner);
        distributor.pause();

        vm.prank(operator);
        vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
        distributor.distributeTreasuryRewards(amount);

        vm.prank(operator);
        vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
        distributor.executeBuybackAndDistribute(
            address(spendToken), amount, 0, _buybackPath(), block.timestamp + 1 hours
        );
    }

    function _deployDistributor(uint256 buybackBps, uint256 burnBps, uint256 amountOutBps) private {
        treasury = new FluxRevenueDistributorTreasuryMock();
        manager = new FluxRevenueDistributorManagerMock(address(treasury), address(rewardToken));
        buybackExecutor =
            new FluxRevenueDistributorBuybackExecutorMock(address(treasury), address(rewardToken), amountOutBps);

        distributor = new FluxRevenueDistributor(
            owner,
            operator,
            address(buybackExecutor),
            address(manager),
            buybackBps,
            burnBps
        );
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}
