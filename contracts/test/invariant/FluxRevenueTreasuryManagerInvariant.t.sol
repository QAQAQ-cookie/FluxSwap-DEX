// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxRevenueDistributor} from "../../contracts/FluxRevenueDistributor.sol";
import {FluxSwapTreasury} from "../../contracts/FluxSwapTreasury.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueTreasuryManagerInvariantBurnableMockERC20 is MockERC20 {
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

contract FluxRevenueTreasuryManagerInvariantBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;

    FluxRevenueTreasuryManagerInvariantBurnableMockERC20 private immutable rewardToken;

    constructor(
        address treasury_,
        FluxRevenueTreasuryManagerInvariantBurnableMockERC20 rewardToken_,
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

contract FluxRevenueTreasuryManagerInvariantPoolMock {
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

contract FluxRevenueTreasuryManagerInvariantHandler is Test {
    uint256 private constant BPS_BASE = 10_000;
    uint256 private constant MIN_DELAY = 1 hours;
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxSwapTreasury public immutable treasury;
    FluxMultiPoolManager public immutable manager;
    FluxRevenueDistributor public immutable distributor;
    FluxRevenueTreasuryManagerInvariantBurnableMockERC20 public immutable rewardToken;
    MockERC20 public immutable spendToken;

    FluxRevenueTreasuryManagerInvariantPoolMock public immutable pool0;
    FluxRevenueTreasuryManagerInvariantPoolMock public immutable pool1;

    uint256 public immutable approvalLimit;
    uint256 public immutable amountOutBps;

    uint256 public totalBuybackOut;
    uint256 public totalDirectMinted;
    uint256 public expectedDistributorSpend;
    uint256 public expectedManagerSpend;
    uint256 public modeledRewardSpentToday;
    uint256 public modeledRewardLastSpendDay;

    constructor(
        FluxSwapTreasury treasury_,
        FluxMultiPoolManager manager_,
        FluxRevenueDistributor distributor_,
        FluxRevenueTreasuryManagerInvariantBurnableMockERC20 rewardToken_,
        MockERC20 spendToken_,
        FluxRevenueTreasuryManagerInvariantPoolMock pool0_,
        FluxRevenueTreasuryManagerInvariantPoolMock pool1_,
        uint256 approvalLimit_,
        uint256 amountOutBps_
    ) {
        treasury = treasury_;
        manager = manager_;
        distributor = distributor_;
        rewardToken = rewardToken_;
        spendToken = spendToken_;
        pool0 = pool0_;
        pool1 = pool1_;
        approvalLimit = approvalLimit_;
        amountOutBps = amountOutBps_;
    }

    function executeBuyback(uint256 rawRevenueAmount) external {
        uint256 revenueAmount = bound(rawRevenueAmount, 1e8, MAX_AMOUNT);
        uint256 expectedAmountOut = _expectedAmountOut(revenueAmount);
        uint256 burnedAmount = (expectedAmountOut * distributor.burnBps()) / BPS_BASE;
        uint256 distributedAmount = expectedAmountOut - burnedAmount;

        vm.prank(distributor.operator());
        (bool success, bytes memory data) = address(distributor).call(
            abi.encodeCall(
                FluxRevenueDistributor.executeBuybackAndDistribute,
                (address(spendToken), revenueAmount, 0, _buybackPath(), block.timestamp + 1 hours)
            )
        );

        if (!success) {
            return;
        }

        uint256 actualAmountOut = abi.decode(data, (uint256));
        assertEq(actualAmountOut, expectedAmountOut);

        totalBuybackOut += actualAmountOut;
        expectedDistributorSpend += burnedAmount;
        expectedManagerSpend += distributedAmount;
        _modelConsumeCapIfConfigured(actualAmountOut);
    }

    function distributeDirectReward(uint256 rawAmount) external {
        uint256 amount = bound(rawAmount, 1, MAX_AMOUNT);
        rewardToken.mint(address(treasury), amount);
        totalDirectMinted += amount;

        vm.prank(distributor.operator());
        (bool success, ) =
            address(distributor).call(abi.encodeCall(FluxRevenueDistributor.distributeTreasuryRewards, (amount)));

        if (!success) {
            return;
        }

        expectedManagerSpend += amount;
        _modelConsumeCapIfConfigured(amount);
    }

    function claimPool(uint8 poolSeed) external {
        if (poolSeed % 2 == 0) {
            pool0.syncFromManager();
            return;
        }

        pool1.syncFromManager();
    }

    function toggleTreasuryPause() external {
        if (treasury.paused()) {
            vm.prank(treasury.multisig());
            treasury.unpause();
            return;
        }

        vm.prank(treasury.guardian());
        treasury.pause();
    }

    function toggleManagerPause() external {
        if (manager.paused()) {
            vm.prank(manager.owner());
            manager.unpause();
            return;
        }

        vm.prank(manager.owner());
        manager.pause();
    }

    function toggleDistributorPause() external {
        if (distributor.paused()) {
            vm.prank(distributor.owner());
            distributor.unpause();
            return;
        }

        vm.prank(distributor.owner());
        distributor.pause();
    }

    function updateRewardTokenDailyCap(uint256 rawCap) external {
        uint256 newCap = bound(rawCap, 0, approvalLimit);
        bytes32 operationId = treasury.hashSetDailySpendCap(address(rewardToken), newCap);

        vm.prank(treasury.multisig());
        treasury.scheduleOperation(operationId, MIN_DELAY);

        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeSetDailySpendCap(address(rewardToken), newCap, operationId);
    }

    function advanceTime(uint32 rawSeconds) external {
        uint256 secondsToSkip = bound(uint256(rawSeconds), 1, 3 days);
        vm.warp(block.timestamp + secondsToSkip);
    }

    function poolBalances() external view returns (uint256) {
        return rewardToken.balanceOf(address(pool0)) + rewardToken.balanceOf(address(pool1));
    }

    function totalClaimedByPools() external view returns (uint256) {
        return pool0.totalClaimed() + pool1.totalClaimed();
    }

    function _modelConsumeCapIfConfigured(uint256 amount) private {
        if (treasury.dailySpendCap(address(rewardToken)) == 0) {
            return;
        }

        uint256 currentDay = block.timestamp / 1 days;
        if (modeledRewardLastSpendDay != currentDay) {
            modeledRewardLastSpendDay = currentDay;
            modeledRewardSpentToday = 0;
        }

        modeledRewardSpentToday += amount;
    }

    function _expectedAmountOut(uint256 revenueAmount) private view returns (uint256 amountOut) {
        uint256 buybackAmountIn = (revenueAmount * distributor.buybackBps()) / BPS_BASE;
        amountOut = (buybackAmountIn * amountOutBps) / BPS_BASE;
        require(amountOut > 0, "EXPECTED_AMOUNT_OUT_ZERO");
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}

contract FluxRevenueTreasuryManagerInvariantTest is StdInvariant, Test {
    uint256 private constant MIN_DELAY = 1 hours;
    uint256 private constant APPROVAL_LIMIT = 1e36;
    uint256 private constant BUYBACK_BPS = 6_000;
    uint256 private constant BURN_BPS = 2_500;
    uint256 private constant AMOUNT_OUT_BPS = 12_000;

    FluxRevenueTreasuryManagerInvariantBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    FluxSwapTreasury private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenueDistributor private distributor;
    FluxRevenueTreasuryManagerInvariantPoolMock private pool0;
    FluxRevenueTreasuryManagerInvariantPoolMock private pool1;
    FluxRevenueTreasuryManagerInvariantHandler private handler;

    address private multisig;
    address private guardian;
    address private treasuryOperator;
    address private managerOwner;
    address private managerBootstrapOperator;
    address private distributorOwner;
    address private distributorOperator;

    function setUp() public {
        multisig = makeAddr("multisig");
        guardian = makeAddr("guardian");
        treasuryOperator = makeAddr("treasuryOperator");
        managerOwner = makeAddr("managerOwner");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");

        rewardToken = new FluxRevenueTreasuryManagerInvariantBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);

        treasury = new FluxSwapTreasury(multisig, guardian, treasuryOperator, MIN_DELAY);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));

        pool0 = new FluxRevenueTreasuryManagerInvariantPoolMock(manager);
        pool1 = new FluxRevenueTreasuryManagerInvariantPoolMock(manager);

        vm.startPrank(managerOwner);
        manager.addPool(address(pool0), 1_000, true);
        manager.addPool(address(pool1), 2_000, true);
        vm.stopPrank();

        distributor = new FluxRevenueDistributor(
            distributorOwner,
            distributorOperator,
            address(new FluxRevenueTreasuryManagerInvariantBuybackExecutorMock(address(treasury), rewardToken, AMOUNT_OUT_BPS)),
            address(manager),
            BUYBACK_BPS,
            BURN_BPS
        );

        vm.prank(managerOwner);
        manager.setOperator(address(distributor));

        _approveTreasurySpender(address(distributor), APPROVAL_LIMIT);
        _approveTreasurySpender(address(manager), APPROVAL_LIMIT);
        _setDailySpendCap(APPROVAL_LIMIT);

        handler = new FluxRevenueTreasuryManagerInvariantHandler(
            treasury,
            manager,
            distributor,
            rewardToken,
            spendToken,
            pool0,
            pool1,
            APPROVAL_LIMIT,
            AMOUNT_OUT_BPS
        );

        targetContract(address(handler));
    }

    // 不变量 1：真实 revenue pipeline 的总 inflow 必须始终由 burned + treasury + manager + pools 完整解释。
    function invariant_revenuePipelineConservation() public view {
        uint256 totalInflows = handler.totalBuybackOut() + handler.totalDirectMinted();
        uint256 systemBalances =
            rewardToken.totalBurned()
            + rewardToken.balanceOf(address(treasury))
            + rewardToken.balanceOf(address(manager))
            + handler.poolBalances();

        assertEq(totalInflows, systemBalances);
    }

    // 不变量 2：pool 的累计 claim 必须与 pool 实际到账余额一致，避免 manager -> pool 转账和内部记账漂移。
    function invariant_poolClaimsMatchObservedBalances() public view {
        assertEq(handler.totalClaimedByPools(), handler.poolBalances());
    }

    // 不变量 3：manager 余额必须始终覆盖 totalPendingRewards + undistributedRewards。
    function invariant_managerBalanceCoversReservedRewards() public view {
        uint256 reservedBalance = manager.totalPendingRewards() + manager.undistributedRewards();
        assertGe(rewardToken.balanceOf(address(manager)), reservedBalance);
    }

    // 不变量 4：treasury 对 distributor / manager 的 approved allowance 必须与真实成功支出完全一致。
    function invariant_approvedSpenderAllowanceMatchesModel() public view {
        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(distributor)),
            handler.approvalLimit() - handler.expectedDistributorSpend()
        );
        assertEq(
            treasury.approvedSpendRemaining(address(rewardToken), address(manager)),
            handler.approvalLimit() - handler.expectedManagerSpend()
        );
    }

    // 不变量 5：rewardToken 的 daily cap 统计必须与参考模型一致，跨天后也不能串账。
    function invariant_rewardTokenDailyCapAccountingMatchesModel() public view {
        assertEq(treasury.spentToday(address(rewardToken)), handler.modeledRewardSpentToday());
        assertEq(treasury.lastSpendDay(address(rewardToken)), handler.modeledRewardLastSpendDay());
    }

    function _approveTreasurySpender(address spender, uint256 amount) private {
        bytes32 operationId = treasury.hashApproveSpender(address(rewardToken), spender, amount);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, MIN_DELAY);

        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeApproveSpender(address(rewardToken), spender, amount, operationId);
    }

    function _setDailySpendCap(uint256 newCap) private {
        bytes32 operationId = treasury.hashSetDailySpendCap(address(rewardToken), newCap);

        vm.prank(multisig);
        treasury.scheduleOperation(operationId, MIN_DELAY);

        vm.warp(block.timestamp + MIN_DELAY);
        treasury.executeSetDailySpendCap(address(rewardToken), newCap, operationId);
    }
}
