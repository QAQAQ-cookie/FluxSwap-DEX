// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxRevenueDistributor} from "../../contracts/FluxRevenueDistributor.sol";
import {FluxSwapTreasury} from "../../contracts/FluxSwapTreasury.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueTreasuryManagerBurnableMockERC20 is MockERC20 {
    uint256 public totalBurned;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        totalBurned += amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxRevenueTreasuryManagerBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;
    uint256 public totalAmountOut;

    FluxRevenueTreasuryManagerBurnableMockERC20 private immutable rewardToken;

    constructor(address treasury_, FluxRevenueTreasuryManagerBurnableMockERC20 rewardToken_, uint256 amountOutBps_) {
        treasury = treasury_;
        buyToken = address(rewardToken_);
        rewardToken = rewardToken_;
        amountOutBps = amountOutBps_;
    }

    function executeBuyback(
        address,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata,
        address,
        uint256
    ) external returns (uint256 amountOut) {
        amountOut = (amountIn * amountOutBps) / 10_000;
        require(amountOut >= amountOutMin, "BUYBACK_SLIPPAGE");
        rewardToken.mint(treasury, amountOut);
        totalAmountOut += amountOut;
    }
}

contract FluxRevenueTreasuryManagerPoolMock {
    FluxMultiPoolManager public immutable manager;
    uint256 public totalClaimed;

    constructor(FluxMultiPoolManager manager_) {
        manager = manager_;
    }

    function syncFromManager() external returns (uint256 reward) {
        reward = manager.claimPoolRewards(address(this));
        totalClaimed += reward;
    }
}

contract FluxRevenueTreasuryManagerStatefulFuzzTest is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant MIN_DELAY = 1 hours;
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxRevenueTreasuryManagerBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    FluxSwapTreasury private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenueTreasuryManagerBuybackExecutorMock private buybackExecutor;
    FluxRevenueDistributor private distributor;
    FluxRevenueTreasuryManagerPoolMock[2] private pools;

    address private multisig;
    address private guardian;
    address private treasuryOperator;
    address private managerOwner;
    address private managerBootstrapOperator;
    address private distributorOwner;
    address private distributorOperator;

    struct RevenueScenario {
        uint256 buybackBps;
        uint256 burnBps;
        uint256 amountOutBps;
        uint256 allocA;
        uint256 allocB;
        uint256 revenueOne;
        uint256 revenueTwo;
        uint256 directReward;
        uint256 amountOutOne;
        uint256 amountOutTwo;
        uint256 burnedOne;
        uint256 burnedTwo;
        uint256 distributedOne;
        uint256 distributedTwo;
        uint256 distributorAllowance;
        uint256 managerAllowance;
        uint256 dayOneCap;
        uint256 dayTwoCap;
    }

    function setUp() public {
        multisig = makeAddr("multisig");
        guardian = makeAddr("guardian");
        treasuryOperator = makeAddr("treasuryOperator");
        managerOwner = makeAddr("managerOwner");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");

        rewardToken = new FluxRevenueTreasuryManagerBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
    }

    // 这一组 stateful fuzz 用真实 Treasury + Manager + Distributor 把长链路串起来：
    // 1. buyback、直接分发、treasury pause、manager pause、跨天 cap 重置都插进同一条序列里。
    // 2. distributor burn 与 manager pull 都会消耗 treasury 的 approved allowance / daily cap，不能串账。
    // 3. 恢复执行后，全链路仍要满足 inflow = burned + treasury/manager/pool 持仓 的总账守恒。
    function testFuzz_buybackDirectPauseAndDayRollover_preserveAccountingAndTreasuryCaps(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRevenueOne,
        uint96 rawRevenueTwo,
        uint96 rawDirectReward
    ) public {
        RevenueScenario memory scenario = _boundScenario(
            rawBuybackBps,
            rawBurnBps,
            rawAmountOutBps,
            rawAllocA,
            rawAllocB,
            rawRevenueOne,
            rawRevenueTwo,
            rawDirectReward
        );

        _deployPipeline(
            scenario.allocA, scenario.allocB, scenario.buybackBps, scenario.burnBps, scenario.amountOutBps
        );
        _approveTreasurySpender(address(distributor), scenario.distributorAllowance);
        _approveTreasurySpender(address(manager), scenario.managerAllowance);
        _setDailySpendCap(scenario.dayOneCap);

        uint256 buybackOneAmountOut = _executeBuybackRound(scenario.revenueOne, 0);
        assertEq(buybackOneAmountOut, scenario.amountOutOne);
        assertEq(treasury.spentToday(address(rewardToken)), scenario.amountOutOne);

        rewardToken.mint(address(treasury), scenario.directReward);

        vm.prank(guardian);
        treasury.pause();

        vm.prank(distributorOperator);
        vm.expectRevert(bytes("FluxMultiPoolManager: TREASURY_PAUSED"));
        distributor.distributeTreasuryRewards(scenario.directReward);

        vm.prank(multisig);
        treasury.unpause();

        vm.prank(distributorOperator);
        vm.expectRevert(bytes("FluxSwapTreasury: DAILY_CAP_EXCEEDED"));
        distributor.distributeTreasuryRewards(scenario.directReward);

        assertEq(treasury.spentToday(address(rewardToken)), scenario.amountOutOne);

        vm.warp(block.timestamp + 1 days + 1);
        _setDailySpendCap(scenario.dayTwoCap);

        vm.prank(distributorOperator);
        distributor.distributeTreasuryRewards(scenario.directReward);
        pools[1].syncFromManager();

        assertEq(treasury.spentToday(address(rewardToken)), scenario.directReward);

        vm.prank(managerOwner);
        manager.pause();

        vm.prank(distributorOperator);
        vm.expectRevert(bytes("FluxMultiPoolManager: PAUSED"));
        distributor.executeBuybackAndDistribute(
            address(spendToken),
            scenario.revenueTwo,
            0,
            _buybackPath(),
            block.timestamp + 1 hours
        );

        vm.prank(managerOwner);
        manager.unpause();

        uint256 buybackTwoAmountOut = _executeBuybackRound(scenario.revenueTwo, 1);
        assertEq(buybackTwoAmountOut, scenario.amountOutTwo);
        assertEq(treasury.spentToday(address(rewardToken)), scenario.directReward + scenario.amountOutTwo);

        _syncAllPools();

        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(distributor)),
            scenario.distributorAllowance - rewardToken.totalBurned()
        );
        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(manager)),
            scenario.managerAllowance - (scenario.distributedOne + scenario.directReward + scenario.distributedTwo)
        );

        _assertPipelineConservation(scenario.amountOutOne + scenario.directReward + scenario.amountOutTwo);
    }

    function _boundScenario(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRevenueOne,
        uint96 rawRevenueTwo,
        uint96 rawDirectReward
    ) private pure returns (RevenueScenario memory scenario) {
        scenario.buybackBps = bound(uint256(rawBuybackBps), 1, BPS_BASE);
        scenario.burnBps = bound(uint256(rawBurnBps), 0, BPS_BASE - 1);
        scenario.amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        scenario.allocA = bound(uint256(rawAllocA), 1, 1_000_000);
        scenario.allocB = bound(uint256(rawAllocB), 1, 1_000_000);
        scenario.revenueOne = bound(uint256(rawRevenueOne), 1e8, MAX_AMOUNT);
        scenario.revenueTwo = bound(uint256(rawRevenueTwo), 1e8, MAX_AMOUNT);
        scenario.directReward = bound(uint256(rawDirectReward), 2, MAX_AMOUNT);
        scenario.amountOutOne =
            _expectedAmountOut(scenario.revenueOne, scenario.buybackBps, scenario.amountOutBps);
        scenario.amountOutTwo =
            _expectedAmountOut(scenario.revenueTwo, scenario.buybackBps, scenario.amountOutBps);
        scenario.burnedOne = (scenario.amountOutOne * scenario.burnBps) / BPS_BASE;
        scenario.burnedTwo = (scenario.amountOutTwo * scenario.burnBps) / BPS_BASE;
        scenario.distributedOne = scenario.amountOutOne - scenario.burnedOne;
        scenario.distributedTwo = scenario.amountOutTwo - scenario.burnedTwo;
        scenario.distributorAllowance = scenario.burnedOne + scenario.burnedTwo;
        scenario.managerAllowance =
            scenario.distributedOne + scenario.directReward + scenario.distributedTwo;
        scenario.dayOneCap = scenario.amountOutOne + scenario.directReward - 1;
        scenario.dayTwoCap = scenario.directReward + scenario.amountOutTwo;
    }

    function _deployPipeline(
        uint256 allocA,
        uint256 allocB,
        uint256 buybackBps,
        uint256 burnBps,
        uint256 amountOutBps
    ) private {
        treasury = new FluxSwapTreasury(multisig, guardian, treasuryOperator, MIN_DELAY);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));

        pools[0] = new FluxRevenueTreasuryManagerPoolMock(manager);
        pools[1] = new FluxRevenueTreasuryManagerPoolMock(manager);

        vm.startPrank(managerOwner);
        manager.addPool(address(pools[0]), allocA, true);
        manager.addPool(address(pools[1]), allocB, true);
        vm.stopPrank();

        buybackExecutor = new FluxRevenueTreasuryManagerBuybackExecutorMock(address(treasury), rewardToken, amountOutBps);
        distributor = new FluxRevenueDistributor(
            distributorOwner,
            distributorOperator,
            address(buybackExecutor),
            address(manager),
            buybackBps,
            burnBps
        );

        vm.prank(managerOwner);
        manager.setOperator(address(distributor));
    }

    function _executeBuybackRound(uint256 revenueAmount, uint256 poolIndex) private returns (uint256 amountOut) {
        vm.prank(distributorOperator);
        amountOut = distributor.executeBuybackAndDistribute(
            address(spendToken),
            revenueAmount,
            0,
            _buybackPath(),
            block.timestamp + 1 hours
        );

        pools[poolIndex].syncFromManager();
    }

    function _approveTreasurySpender(address spender, uint256 amount) private {
        bytes32 operationId = treasury.hashApproveSpender(address(rewardToken), spender, amount);
        _scheduleOperation(operationId);
        treasury.executeApproveSpender(address(rewardToken), spender, amount, operationId);
    }

    function _setDailySpendCap(uint256 newCap) private {
        bytes32 operationId = treasury.hashSetDailySpendCap(address(rewardToken), newCap);
        _scheduleOperation(operationId);
        treasury.executeSetDailySpendCap(address(rewardToken), newCap, operationId);
    }

    function _scheduleOperation(bytes32 operationId) private {
        vm.prank(multisig);
        treasury.scheduleOperation(operationId, MIN_DELAY);
        vm.warp(block.timestamp + MIN_DELAY);
    }

    function _syncAllPools() private {
        for (uint256 round = 0; round < 3; round++) {
            for (uint256 i = 0; i < pools.length; i++) {
                pools[i].syncFromManager();
            }
        }
    }

    function _assertPipelineConservation(uint256 totalInflows) private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 treasuryBalance = rewardToken.balanceOf(address(treasury));
        uint256 poolBalances;
        uint256 totalClaimed;

        for (uint256 i = 0; i < pools.length; i++) {
            poolBalances += rewardToken.balanceOf(address(pools[i]));
            totalClaimed += pools[i].totalClaimed();
        }

        assertEq(poolBalances, totalClaimed);
        assertEq(totalInflows, rewardToken.totalBurned() + treasuryBalance + managerBalance + poolBalances);
        assertGe(managerBalance, manager.totalPendingRewards() + manager.undistributedRewards());
        assertLe(managerBalance - (manager.totalPendingRewards() + manager.undistributedRewards()), 1);
        assertLe(treasuryBalance, 1);
    }

    function _expectedAmountOut(uint256 revenueAmount, uint256 buybackBps, uint256 amountOutBps)
        private
        pure
        returns (uint256 amountOut)
    {
        uint256 buybackAmountIn = (revenueAmount * buybackBps) / BPS_BASE;
        amountOut = (buybackAmountIn * amountOutBps) / BPS_BASE;
        require(amountOut > 0, "EXPECTED_AMOUNT_OUT_ZERO");
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}
