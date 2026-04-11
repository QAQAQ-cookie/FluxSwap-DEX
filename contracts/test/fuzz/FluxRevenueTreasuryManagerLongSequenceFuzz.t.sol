// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxRevenueDistributor} from "../../contracts/FluxRevenueDistributor.sol";
import {FluxSwapTreasury} from "../../contracts/FluxSwapTreasury.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueTreasuryManagerLongSequenceBurnableMockERC20 is MockERC20 {
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

contract FluxRevenueTreasuryManagerLongSequenceBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;

    FluxRevenueTreasuryManagerLongSequenceBurnableMockERC20 private immutable rewardToken;

    constructor(
        address treasury_,
        FluxRevenueTreasuryManagerLongSequenceBurnableMockERC20 rewardToken_,
        uint256 amountOutBps_
    ) {
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
    }
}

contract FluxRevenueTreasuryManagerLongSequencePoolMock {
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

contract FluxRevenueTreasuryManagerLongSequenceFuzzTest is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant MIN_DELAY = 1 hours;
    uint256 private constant MAX_AMOUNT = 1e24;
    uint256 private constant APPROVAL_LIMIT = 1e30;

    FluxRevenueTreasuryManagerLongSequenceBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    FluxSwapTreasury private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenueDistributor private distributor;
    FluxRevenueTreasuryManagerLongSequencePoolMock[2] private pools;

    address private multisig;
    address private guardian;
    address private treasuryOperator;
    address private managerOwner;
    address private managerBootstrapOperator;
    address private distributorOwner;
    address private distributorOperator;

    uint256 private buybackBpsConfig;
    uint256 private burnBpsConfig;
    uint256 private amountOutBpsConfig;
    uint256 private totalBuybackOut;
    uint256 private totalDirectMinted;
    uint256 private expectedDistributorSpend;
    uint256 private expectedManagerSpend;

    function setUp() public {
        multisig = makeAddr("multisig");
        guardian = makeAddr("guardian");
        treasuryOperator = makeAddr("treasuryOperator");
        managerOwner = makeAddr("managerOwner");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");

        rewardToken = new FluxRevenueTreasuryManagerLongSequenceBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
    }

    // 这一组 fuzz 不再固定脚本化顺序，而是把 revenue pipeline 拉成 8 步随机序列：
    // 1. buyback、direct reward、claim、pause/unpause、时间推进会按 selector 混排执行。
    // 2. 失败的分发操作必须整笔回退或把资金留在 treasury，不能污染 allowance / manager 会计。
    // 3. 任意步之后都持续校验全链路守恒、reserved 覆盖关系、approved allowance 精确递减。
    function testFuzz_eightStepMixedSequence_preservesRevenuePipelineAccounting(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawAllocA,
        uint32 rawAllocB,
        uint8[8] memory selectors,
        uint96[8] memory rawAmounts
    ) public {
        buybackBpsConfig = bound(uint256(rawBuybackBps), 1, BPS_BASE);
        burnBpsConfig = bound(uint256(rawBurnBps), 0, BPS_BASE - 1);
        amountOutBpsConfig = bound(uint256(rawAmountOutBps), 1, 20_000);

        _deployPipeline(
            bound(uint256(rawAllocA), 1, 1_000_000),
            bound(uint256(rawAllocB), 1, 1_000_000)
        );
        _approveTreasurySpender(address(distributor), APPROVAL_LIMIT);
        _approveTreasurySpender(address(manager), APPROVAL_LIMIT);
        _setDailySpendCap(APPROVAL_LIMIT);

        for (uint256 i = 0; i < selectors.length; i++) {
            uint256 amount = bound(uint256(rawAmounts[i]), 1e8, MAX_AMOUNT);
            _executeStep(selectors[i] % 8, amount);
            _assertPipelineState(false);
        }

        _syncAllPools();
        _assertPipelineState(true);
    }

    function _deployPipeline(uint256 allocA, uint256 allocB) private {
        treasury = new FluxSwapTreasury(multisig, guardian, treasuryOperator, MIN_DELAY);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));

        pools[0] = new FluxRevenueTreasuryManagerLongSequencePoolMock(manager);
        pools[1] = new FluxRevenueTreasuryManagerLongSequencePoolMock(manager);

        vm.startPrank(managerOwner);
        manager.addPool(address(pools[0]), allocA, true);
        manager.addPool(address(pools[1]), allocB, true);
        vm.stopPrank();

        distributor = new FluxRevenueDistributor(
            distributorOwner,
            distributorOperator,
            address(
                new FluxRevenueTreasuryManagerLongSequenceBuybackExecutorMock(
                    address(treasury), rewardToken, amountOutBpsConfig
                )
            ),
            address(manager),
            buybackBpsConfig,
            burnBpsConfig
        );

        vm.prank(managerOwner);
        manager.setOperator(address(distributor));
    }

    function _executeStep(uint256 selector, uint256 amount) private {
        if (selector == 0) {
            _stepBuyback(amount);
            return;
        }
        if (selector == 1) {
            _stepDirectReward(amount);
            return;
        }
        if (selector == 2) {
            _toggleTreasuryPause();
            return;
        }
        if (selector == 3) {
            _toggleManagerPause();
            return;
        }
        if (selector == 4) {
            _toggleDistributorPause();
            return;
        }
        if (selector == 5) {
            pools[0].syncFromManager();
            return;
        }
        if (selector == 6) {
            pools[1].syncFromManager();
            return;
        }

        vm.warp(block.timestamp + (amount % 2 days) + 1);
    }

    function _stepBuyback(uint256 revenueAmount) private {
        (uint256 amountOut, uint256 burnedAmount, uint256 distributedAmount) = _expectedBuybackSplit(revenueAmount);

        if (distributor.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
            distributor.executeBuybackAndDistribute(
                address(spendToken),
                revenueAmount,
                0,
                _buybackPath(),
                block.timestamp + 1 hours
            );
            return;
        }

        if (manager.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert();
            distributor.executeBuybackAndDistribute(
                address(spendToken),
                revenueAmount,
                0,
                _buybackPath(),
                block.timestamp + 1 hours
            );
            return;
        }

        if (treasury.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert();
            distributor.executeBuybackAndDistribute(
                address(spendToken),
                revenueAmount,
                0,
                _buybackPath(),
                block.timestamp + 1 hours
            );
            return;
        }

        vm.prank(distributorOperator);
        uint256 actualAmountOut = distributor.executeBuybackAndDistribute(
            address(spendToken),
            revenueAmount,
            0,
            _buybackPath(),
            block.timestamp + 1 hours
        );

        assertEq(actualAmountOut, amountOut);
        totalBuybackOut += amountOut;
        expectedDistributorSpend += burnedAmount;
        expectedManagerSpend += distributedAmount;
    }

    function _stepDirectReward(uint256 amount) private {
        rewardToken.mint(address(treasury), amount);
        totalDirectMinted += amount;

        if (distributor.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert(bytes("FluxRevenueDistributor: PAUSED"));
            distributor.distributeTreasuryRewards(amount);
            return;
        }

        if (manager.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert();
            distributor.distributeTreasuryRewards(amount);
            return;
        }

        if (treasury.paused()) {
            vm.prank(distributorOperator);
            vm.expectRevert();
            distributor.distributeTreasuryRewards(amount);
            return;
        }

        vm.prank(distributorOperator);
        distributor.distributeTreasuryRewards(amount);
        expectedManagerSpend += amount;
    }

    function _toggleTreasuryPause() private {
        if (treasury.paused()) {
            vm.prank(multisig);
            treasury.unpause();
            return;
        }

        vm.prank(guardian);
        treasury.pause();
    }

    function _toggleManagerPause() private {
        if (manager.paused()) {
            vm.prank(managerOwner);
            manager.unpause();
            return;
        }

        vm.prank(managerOwner);
        manager.pause();
    }

    function _toggleDistributorPause() private {
        if (distributor.paused()) {
            vm.prank(distributorOwner);
            distributor.unpause();
            return;
        }

        vm.prank(distributorOwner);
        distributor.pause();
    }

    function _approveTreasurySpender(address spender, uint256 amount) private {
        bytes32 operationId = treasury.hashApproveSpender(address(rewardToken), spender, amount);
        _scheduleOperation(operationId);
        treasury.executeApproveSpender(address(rewardToken), spender, amount, operationId);
    }

    function _setDailySpendCap(uint256 amount) private {
        bytes32 operationId = treasury.hashSetDailySpendCap(address(rewardToken), amount);
        _scheduleOperation(operationId);
        treasury.executeSetDailySpendCap(address(rewardToken), amount, operationId);
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

    function _assertPipelineState(bool requireTightReservedCoverage) private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 treasuryBalance = rewardToken.balanceOf(address(treasury));
        uint256 poolBalances;
        uint256 totalClaimed;

        for (uint256 i = 0; i < pools.length; i++) {
            poolBalances += rewardToken.balanceOf(address(pools[i]));
            totalClaimed += pools[i].totalClaimed();
        }

        assertEq(poolBalances, totalClaimed);
        assertEq(
            totalBuybackOut + totalDirectMinted,
            rewardToken.totalBurned() + treasuryBalance + managerBalance + poolBalances
        );
        assertGe(managerBalance, manager.totalPendingRewards() + manager.undistributedRewards());
        if (requireTightReservedCoverage) {
            assertLe(managerBalance - (manager.totalPendingRewards() + manager.undistributedRewards()), 1);
        }
        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(distributor)),
            APPROVAL_LIMIT - expectedDistributorSpend
        );
        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(manager)),
            APPROVAL_LIMIT - expectedManagerSpend
        );
    }

    function _expectedBuybackSplit(uint256 revenueAmount)
        private
        view
        returns (uint256 amountOut, uint256 burnedAmount, uint256 distributedAmount)
    {
        uint256 buybackAmountIn = (revenueAmount * buybackBpsConfig) / BPS_BASE;
        amountOut = (buybackAmountIn * amountOutBpsConfig) / BPS_BASE;
        require(amountOut > 0, "EXPECTED_AMOUNT_OUT_ZERO");
        burnedAmount = (amountOut * burnBpsConfig) / BPS_BASE;
        distributedAmount = amountOut - burnedAmount;
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}
