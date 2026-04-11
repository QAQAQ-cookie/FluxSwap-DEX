// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxMultiPoolManager.sol";
import "../../contracts/FluxRevenueDistributor.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxRevenuePipelineBurnableMockERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxRevenuePipelineTreasuryMock {
    FluxRevenuePipelineBurnableMockERC20 public immutable rewardToken;
    bool public paused;
    uint256 public totalBurned;

    constructor(FluxRevenuePipelineBurnableMockERC20 rewardToken_) {
        rewardToken = rewardToken_;
    }

    function setPaused(bool paused_) external {
        paused = paused_;
    }

    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }

    function burnApprovedToken(address token, uint256 amount) external {
        require(token == address(rewardToken), "INVALID_TOKEN");
        rewardToken.burn(amount);
        totalBurned += amount;
    }

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxRevenuePipelineBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;
    uint256 public totalAmountOut;

    FluxRevenuePipelineBurnableMockERC20 private immutable rewardToken;

    constructor(address treasury_, FluxRevenuePipelineBurnableMockERC20 rewardToken_, uint256 amountOutBps_) {
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

contract FluxRevenuePipelinePoolMock {
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

contract FluxRevenuePipelineStatefulFuzzTest is Test {
    uint256 private constant MAX_AMOUNT = 1e24;
    uint256 private constant MAX_BPS = 10_000;

    struct PipelineParams {
        uint256 buybackBps;
        uint256 burnBps;
        uint256 amountOutBps;
        uint256 allocA;
        uint256 allocB;
        uint256 revenueOne;
        uint256 revenueTwo;
        uint256 revenueThree;
        uint256 treasuryRewardAmount;
    }

    FluxRevenuePipelineBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    FluxRevenuePipelineTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenuePipelineBuybackExecutorMock private buybackExecutor;
    FluxRevenueDistributor private distributor;
    FluxRevenuePipelinePoolMock[2] private pools;

    address private managerOwner;
    address private distributorOwner;
    address private distributorOperator;
    address private managerBootstrapOperator;

    function setUp() public {
        managerOwner = makeAddr("managerOwner");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");

        rewardToken = new FluxRevenuePipelineBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
    }

    // 这一组 fuzz 把 RevenueDistributor -> Treasury -> MultiPoolManager -> Pool claim 串成一条流水线：
    // 1. 多轮 buyback / distribute 中间穿插 claim 后，系统总账必须守恒。
    // 2. 所有 pool 最终 sync 完后，manager 只能剩未分尽的 undistributed dust，不能有悬空 pending。
    // 3. pause / unpause 插入到序列里后，失败操作不能污染后续会计，恢复后仍要继续自洽。
    function testFuzz_threeBuybackRoundsWithInterleavedClaims_preserveGlobalConservation(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRevenueOne,
        uint96 rawRevenueTwo,
        uint96 rawRevenueThree,
        uint8 claimSeedOne,
        uint8 claimSeedTwo,
        uint8 claimSeedThree
    ) public {
        PipelineParams memory params = _boundPipelineParams(
            rawBuybackBps,
            rawBurnBps,
            rawAmountOutBps,
            rawAllocA,
            rawAllocB,
            rawRevenueOne,
            rawRevenueTwo,
            rawRevenueThree,
            0
        );

        _deployPipeline(params.buybackBps, params.burnBps, params.amountOutBps, params.allocA, params.allocB);

        uint256 totalAmountOut;
        totalAmountOut += _executeOptionalBuybackRound(params.revenueOne, claimSeedOne % 2);
        totalAmountOut += _executeOptionalBuybackRound(params.revenueTwo, claimSeedTwo % 2);
        totalAmountOut += _executeOptionalBuybackRound(params.revenueThree, claimSeedThree % 2);

        _syncAllPools();
        _assertPipelineConservation(totalAmountOut, 0);
    }

    function testFuzz_pauseThenResume_pipelineStaysConsistent(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRevenueAmount,
        uint96 rawTreasuryRewardAmount
    ) public {
        PipelineParams memory params = _boundPipelineParams(
            rawBuybackBps,
            rawBurnBps,
            rawAmountOutBps,
            rawAllocA,
            rawAllocB,
            rawRevenueAmount,
            0,
            0,
            rawTreasuryRewardAmount
        );
        if (params.treasuryRewardAmount == 0) {
            params.treasuryRewardAmount = 1;
        }

        _deployPipeline(params.buybackBps, params.burnBps, params.amountOutBps, params.allocA, params.allocB);

        uint256 totalAmountOut = _executeBuybackRound(params.revenueOne, 0);

        vm.prank(distributorOwner);
        distributor.pause();

        vm.prank(distributorOperator);
        vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
        distributor.executeBuybackAndDistribute(
            address(spendToken), params.revenueOne, 0, _buybackPath(), block.timestamp + 1 hours
        );

        rewardToken.mint(address(treasury), params.treasuryRewardAmount);

        vm.prank(distributorOperator);
        vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
        distributor.distributeTreasuryRewards(params.treasuryRewardAmount);

        vm.prank(distributorOwner);
        distributor.unpause();

        vm.prank(distributorOperator);
        distributor.distributeTreasuryRewards(params.treasuryRewardAmount);

        _syncAllPools();
        _assertPipelineConservation(totalAmountOut, params.treasuryRewardAmount);
    }

    function _boundPipelineParams(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint96 rawRevenueOne,
        uint96 rawRevenueTwo,
        uint96 rawRevenueThree,
        uint96 rawTreasuryRewardAmount
    ) private pure returns (PipelineParams memory params) {
        params.buybackBps = bound(uint256(rawBuybackBps), 1, MAX_BPS);
        params.burnBps = bound(uint256(rawBurnBps), 0, MAX_BPS);
        params.amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        params.allocA = bound(uint256(rawAllocA), 1, 1_000_000);
        params.allocB = bound(uint256(rawAllocB), 1, 1_000_000);
        params.revenueOne = bound(uint256(rawRevenueOne), 10_000, MAX_AMOUNT);
        params.revenueTwo = rawRevenueTwo == 0 ? 0 : bound(uint256(rawRevenueTwo), 10_000, MAX_AMOUNT);
        params.revenueThree = rawRevenueThree == 0 ? 0 : bound(uint256(rawRevenueThree), 10_000, MAX_AMOUNT);
        params.treasuryRewardAmount =
            rawTreasuryRewardAmount == 0 ? 0 : bound(uint256(rawTreasuryRewardAmount), 1, MAX_AMOUNT);
    }

    function _deployPipeline(
        uint256 buybackBps,
        uint256 burnBps,
        uint256 amountOutBps,
        uint256 allocA,
        uint256 allocB
    ) private {
        treasury = new FluxRevenuePipelineTreasuryMock(rewardToken);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));

        pools[0] = new FluxRevenuePipelinePoolMock(manager);
        pools[1] = new FluxRevenuePipelinePoolMock(manager);

        vm.startPrank(managerOwner);
        manager.addPool(address(pools[0]), allocA, true);
        manager.addPool(address(pools[1]), allocB, true);
        vm.stopPrank();

        buybackExecutor = new FluxRevenuePipelineBuybackExecutorMock(address(treasury), rewardToken, amountOutBps);
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
            address(spendToken), revenueAmount, 0, _buybackPath(), block.timestamp + 1 hours
        );

        pools[poolIndex].syncFromManager();
    }

    function _executeOptionalBuybackRound(uint256 revenueAmount, uint256 poolIndex) private returns (uint256 amountOut) {
        if (revenueAmount == 0) {
            return 0;
        }

        return _executeBuybackRound(revenueAmount, poolIndex);
    }

    function _syncAllPools() private {
        for (uint256 round = 0; round < 3; round++) {
            for (uint256 i = 0; i < pools.length; i++) {
                pools[i].syncFromManager();
            }
        }
    }

    function _assertPipelineConservation(uint256 totalBuybackAmountOut, uint256 totalDirectTreasuryRewards) private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 treasuryBalance = rewardToken.balanceOf(address(treasury));
        uint256 poolBalances;
        uint256 totalClaimed;
        uint256 totalPending = manager.totalPendingRewards();
        uint256 undistributed = manager.undistributedRewards();

        for (uint256 i = 0; i < pools.length; i++) {
            poolBalances += rewardToken.balanceOf(address(pools[i]));
            totalClaimed += pools[i].totalClaimed();
        }

        uint256 totalInflows = totalBuybackAmountOut + totalDirectTreasuryRewards;
        uint256 totalBurned = treasury.totalBurned();

        assertEq(totalInflows, totalBurned + treasuryBalance + managerBalance + poolBalances);
        assertEq(poolBalances, totalClaimed);
        assertGe(managerBalance, totalPending + undistributed);
        assertLe(managerBalance - (totalPending + undistributed), 1);
        assertLe(totalPending, pools.length);
        assertLe(treasuryBalance, 1);
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}
