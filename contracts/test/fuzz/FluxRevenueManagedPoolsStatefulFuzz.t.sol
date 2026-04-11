// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxPoolFactory} from "../../contracts/FluxPoolFactory.sol";
import {FluxRevenueDistributor} from "../../contracts/FluxRevenueDistributor.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapLPStakingPool} from "../../contracts/FluxSwapLPStakingPool.sol";
import {FluxSwapStakingRewards} from "../../contracts/FluxSwapStakingRewards.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueManagedPoolsBurnableMockERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxRevenueManagedPoolsTreasuryMock {
    FluxRevenueManagedPoolsBurnableMockERC20 public immutable rewardToken;
    uint256 public totalBurned;
    bool public paused;

    constructor(FluxRevenueManagedPoolsBurnableMockERC20 rewardToken_) {
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

contract FluxRevenueManagedPoolsBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;
    uint256 public totalAmountOut;

    FluxRevenueManagedPoolsBurnableMockERC20 private immutable rewardToken;

    constructor(address treasury_, FluxRevenueManagedPoolsBurnableMockERC20 rewardToken_, uint256 amountOutBps_) {
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

contract FluxRevenueManagedPoolsStatefulFuzzTest is Test {
    uint256 private constant MAX_AMOUNT = 1e24;

    FluxRevenueManagedPoolsBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    MockERC20 private stakingToken;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    FluxRevenueManagedPoolsTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenueManagedPoolsBuybackExecutorMock private buybackExecutor;
    FluxRevenueDistributor private distributor;
    FluxSwapFactory private dexFactory;
    FluxPoolFactory private poolFactory;

    address private managerOwner;
    address private distributorOwner;
    address private distributorOperator;
    address private managerBootstrapOperator;
    address private recipient;
    address private newOwner;

    struct ManagedSequenceState {
        address singlePool;
        address currentLpPool;
        address previousLpPool;
        address pair;
        uint256 totalInflows;
        uint256 lpPendingFrozenAtRecreation;
        bool lpRecreated;
    }

    function setUp() public {
        managerOwner = makeAddr("managerOwner");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");
        recipient = makeAddr("recipient");
        newOwner = makeAddr("newOwner");

        rewardToken = new FluxRevenueManagedPoolsBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
        stakingToken = new MockERC20("Stake Token", "STK", 18);
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);
    }

    // 这一组 stateful fuzz 把 RevenueDistributor 串到真实 managed pools 上：
    // 1. buyback round 和 direct treasury round 都走真实 distributor / manager / poolFactory / pool.sync。
    // 2. single / LP pool 在无 staker 状态下通过 sync + recover 把奖励完整回收到 recipient。
    // 3. 最终校验 inflow = burned + treasury/manager 残余 + recipient 回收，补上 mock pool 到真实 pool 的断层。
    function testFuzz_buybackAndDirectRounds_withRealManagedPools_preserveGlobalConservation(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawSingleAlloc,
        uint32 rawLpAlloc,
        uint96 rawRevenueAmount,
        uint96 rawDirectTreasuryReward
    ) public {
        uint256 buybackBps = bound(uint256(rawBuybackBps), 1, 10_000);
        uint256 burnBps = bound(uint256(rawBurnBps), 0, 10_000);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 lpAlloc = bound(uint256(rawLpAlloc), 1, 1_000_000);
        uint256 revenueAmount = bound(uint256(rawRevenueAmount), 10_000, MAX_AMOUNT);
        uint256 directTreasuryReward = bound(uint256(rawDirectTreasuryReward), 1, MAX_AMOUNT);

        (address singlePoolAddress, address lpPoolAddress) =
            _deployRealManagedPipeline(buybackBps, burnBps, amountOutBps, singleAlloc, lpAlloc);

        uint256 buybackAmountOut = _executeBuybackRound(revenueAmount);
        uint256 singleClaimRoundOne = _syncPoolClaim(singlePoolAddress);
        uint256 lpClaimRoundOne = _syncPoolClaim(lpPoolAddress);

        rewardToken.mint(address(treasury), directTreasuryReward);
        vm.prank(distributorOperator);
        distributor.distributeTreasuryRewards(directTreasuryReward);

        uint256 singleClaimRoundTwo = _syncPoolClaim(singlePoolAddress);
        uint256 lpClaimRoundTwo = _syncPoolClaim(lpPoolAddress);

        uint256 recipientBeforeRecover = rewardToken.balanceOf(recipient);
        uint256 singleRecovered = _recoverIfAny(singlePoolAddress);
        uint256 lpRecovered = _recoverIfAny(lpPoolAddress);

        uint256 totalInflows = buybackAmountOut + directTreasuryReward;
        uint256 totalBurned = treasury.totalBurned();
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 treasuryBalance = rewardToken.balanceOf(address(treasury));
        uint256 recipientRecovered = rewardToken.balanceOf(recipient) - recipientBeforeRecover;

        assertGe(singleClaimRoundOne + singleClaimRoundTwo, singleRecovered);
        assertGe(lpClaimRoundOne + lpClaimRoundTwo, lpRecovered);
        assertEq(recipientRecovered, singleRecovered + lpRecovered);
        assertEq(totalInflows, totalBurned + treasuryBalance + managerBalance + recipientRecovered);
        _assertManagerDustBounded();
    }

    // 这一组 stateful fuzz 把 distributor 路径和“移交后重建 LP pool”串起来：
    // 1. 旧 LP pool 先吃一轮 buyback 分发，然后 ownership 移交并退出工厂管理。
    // 2. 同一 pair 上立即重建新 LP pool，后续 direct treasury reward 只能流向新池。
    // 3. 旧池 pending 不得再增长，新池映射/allocPoint/claim-recover 都必须重新闭合。
    function testFuzz_recreateLpPoolAfterDistributorRound_routesFutureRewardsOnlyToNewManagedLpPool(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawSingleAlloc,
        uint32 rawOldLpAlloc,
        uint32 rawNewLpAlloc,
        uint96 rawRevenueAmount,
        uint96 rawDirectTreasuryReward
    ) public {
        uint256 buybackBps = bound(uint256(rawBuybackBps), 1, 10_000);
        uint256 burnBps = bound(uint256(rawBurnBps), 0, 10_000);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 oldLpAlloc = bound(uint256(rawOldLpAlloc), 1, 1_000_000);
        uint256 newLpAlloc = bound(uint256(rawNewLpAlloc), 1, 1_000_000);
        uint256 revenueAmount = bound(uint256(rawRevenueAmount), 10_000, MAX_AMOUNT);
        uint256 directTreasuryReward = bound(uint256(rawDirectTreasuryReward), 1, MAX_AMOUNT);

        (address singlePoolAddress, address oldLpPoolAddress) =
            _deployRealManagedPipeline(buybackBps, burnBps, amountOutBps, singleAlloc, oldLpAlloc);
        address pairAddress = FluxSwapLPStakingPool(oldLpPoolAddress).lpToken();

        _executeBuybackRound(revenueAmount);
        _syncPoolClaim(singlePoolAddress);
        _syncPoolClaim(oldLpPoolAddress);
        _recoverIfAny(singlePoolAddress);
        _recoverIfAny(oldLpPoolAddress);

        uint256 oldLpPendingBeforeTransfer = manager.pendingPoolRewards(oldLpPoolAddress);

        poolFactory.transferManagedPoolOwnership(oldLpPoolAddress, newOwner);

        assertFalse(poolFactory.managedPools(oldLpPoolAddress));
        assertEq(poolFactory.lpTokenPools(pairAddress), address(0));
        assertEq(manager.totalAllocPoint(), singleAlloc);

        address newLpPoolAddress = poolFactory.createLPPool(pairAddress, newLpAlloc, true);

        assertEq(poolFactory.lpTokenPools(pairAddress), newLpPoolAddress);
        assertTrue(poolFactory.managedPools(newLpPoolAddress));
        assertEq(poolFactory.managedPoolStakingAsset(newLpPoolAddress), pairAddress);
        assertTrue(poolFactory.managedPoolIsLP(newLpPoolAddress));
        assertEq(manager.totalAllocPoint(), singleAlloc + newLpAlloc);

        rewardToken.mint(address(treasury), directTreasuryReward);
        vm.prank(distributorOperator);
        distributor.distributeTreasuryRewards(directTreasuryReward);

        assertEq(manager.pendingPoolRewards(oldLpPoolAddress), oldLpPendingBeforeTransfer);

        uint256 expectedNewLp = manager.pendingPoolRewards(newLpPoolAddress);
        uint256 actualNewLp = _syncPoolClaim(newLpPoolAddress);

        assertGe(expectedNewLp, actualNewLp);
        assertLe(expectedNewLp - actualNewLp, 1);

        uint256 recipientBeforeRecover = rewardToken.balanceOf(recipient);
        uint256 recovered = _recoverIfAny(newLpPoolAddress);

        assertEq(recovered, actualNewLp);
        assertEq(rewardToken.balanceOf(recipient) - recipientBeforeRecover, recovered);
    }

    // 这一组 stateful fuzz 把真实 managed pools 提升到“多步混排”的长序列：
    // 1. buyback、direct reward、sync、recover、treasury pause/unpause、LP 重建按 selector 混排执行。
    // 2. LP 重建后，旧池 pending 必须被冻结，后续奖励只能继续流向新池。
    // 3. 任意中间态都持续校验 inflow = burned + treasury/manager/pool/recipient 持仓。
    function testFuzz_mixedManagedPoolSequence_preservesConservationAndLpRecreationIsolation(
        uint16 rawBuybackBps,
        uint16 rawBurnBps,
        uint16 rawAmountOutBps,
        uint32 rawSingleAlloc,
        uint32 rawLpAlloc,
        uint32 rawRecreatedLpAlloc,
        uint8[8] memory selectors,
        uint96[8] memory rawAmounts
    ) public {
        uint256 buybackBps = bound(uint256(rawBuybackBps), 1, 10_000);
        uint256 burnBps = bound(uint256(rawBurnBps), 0, 10_000);
        uint256 amountOutBps = bound(uint256(rawAmountOutBps), 1, 20_000);
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 lpAlloc = bound(uint256(rawLpAlloc), 1, 1_000_000);
        uint256 recreatedLpAlloc = bound(uint256(rawRecreatedLpAlloc), 1, 1_000_000);

        (address singlePoolAddress, address lpPoolAddress) =
            _deployRealManagedPipeline(buybackBps, burnBps, amountOutBps, singleAlloc, lpAlloc);

        ManagedSequenceState memory state;
        state.singlePool = singlePoolAddress;
        state.currentLpPool = lpPoolAddress;
        state.pair = FluxSwapLPStakingPool(lpPoolAddress).lpToken();

        for (uint256 i = 0; i < selectors.length; i++) {
            uint256 amount = bound(uint256(rawAmounts[i]), 10_000, MAX_AMOUNT);
            _executeManagedSequenceStep(state, selectors[i] % 8, amount, recreatedLpAlloc);
            _assertManagedSequenceState(state, false);
        }

        _syncManagedSequencePools(state);
        _assertManagedSequenceState(state, true);
    }

    function _deployRealManagedPipeline(
        uint256 buybackBps,
        uint256 burnBps,
        uint256 amountOutBps,
        uint256 singleAlloc,
        uint256 lpAlloc
    ) private returns (address singlePoolAddress, address lpPoolAddress) {
        treasury = new FluxRevenueManagedPoolsTreasuryMock(rewardToken);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));
        dexFactory = new FluxSwapFactory(address(this));
        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));

        vm.prank(managerOwner);
        manager.setPoolFactory(address(poolFactory));

        buybackExecutor = new FluxRevenueManagedPoolsBuybackExecutorMock(address(treasury), rewardToken, amountOutBps);
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

        address pairAddress = dexFactory.createPair(address(tokenA), address(tokenB));
        singlePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), singleAlloc, true);
        lpPoolAddress = poolFactory.createLPPool(pairAddress, lpAlloc, true);
    }

    function _executeManagedSequenceStep(
        ManagedSequenceState memory state,
        uint256 selector,
        uint256 amount,
        uint256 recreatedLpAlloc
    ) private {
        if (selector == 0) {
            _stepManagedBuyback(state, amount);
            return;
        }
        if (selector == 1) {
            _stepManagedDirectReward(state, amount);
            return;
        }
        if (selector == 2) {
            _syncPoolClaim(state.singlePool);
            return;
        }
        if (selector == 3) {
            _recoverIfAny(state.singlePool);
            return;
        }
        if (selector == 4) {
            _syncPoolClaim(state.currentLpPool);
            return;
        }
        if (selector == 5) {
            _recoverIfAny(state.currentLpPool);
            return;
        }
        if (selector == 6) {
            treasury.setPaused(!treasury.paused());
            return;
        }

        _recreateManagedLpIfNeeded(state, recreatedLpAlloc);
    }

    function _stepManagedBuyback(ManagedSequenceState memory state, uint256 revenueAmount) private {
        if (distributor.paused()) {
            vm.prank(distributorOwner);
            distributor.unpause();
        }

        vm.prank(distributorOperator);
        (bool success, bytes memory data) = address(distributor).call(
            abi.encodeCall(
                FluxRevenueDistributor.executeBuybackAndDistribute,
                (address(spendToken), revenueAmount, 0, _buybackPath(), block.timestamp + 1 hours)
            )
        );

        if (!success) {
            return;
        }

        uint256 amountOut = abi.decode(data, (uint256));
        state.totalInflows += amountOut;
    }

    function _stepManagedDirectReward(ManagedSequenceState memory state, uint256 rewardAmount) private {
        rewardToken.mint(address(treasury), rewardAmount);
        state.totalInflows += rewardAmount;

        if (distributor.paused()) {
            vm.prank(distributorOwner);
            distributor.unpause();
        }

        vm.prank(distributorOperator);
        (bool success, ) = address(distributor).call(
            abi.encodeCall(FluxRevenueDistributor.distributeTreasuryRewards, (rewardAmount))
        );
        if (!success) {
            return;
        }
    }

    function _recreateManagedLpIfNeeded(ManagedSequenceState memory state, uint256 recreatedLpAlloc) private {
        if (state.lpRecreated) {
            return;
        }

        _syncPoolClaim(state.currentLpPool);
        _recoverIfAny(state.currentLpPool);

        poolFactory.transferManagedPoolOwnership(state.currentLpPool, newOwner);
        state.previousLpPool = state.currentLpPool;
        state.lpPendingFrozenAtRecreation = manager.pendingPoolRewards(state.previousLpPool);
        state.currentLpPool = poolFactory.createLPPool(state.pair, recreatedLpAlloc, true);
        state.lpRecreated = true;
    }

    function _executeBuybackRound(uint256 revenueAmount) private returns (uint256 amountOut) {
        vm.prank(distributorOperator);
        amountOut = distributor.executeBuybackAndDistribute(
            address(spendToken),
            revenueAmount,
            0,
            _buybackPath(),
            block.timestamp + 1 hours
        );
    }

    function _syncPoolClaim(address poolAddress) private returns (uint256 actualClaimed) {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(poolAddress);
        uint256 reserveBefore = pool.rewardReserve();
        pool.syncRewards();
        actualClaimed = pool.rewardReserve() - reserveBefore;
    }

    function _recoverIfAny(address poolAddress) private returns (uint256 recovered) {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(poolAddress);
        uint256 reserve = pool.rewardReserve();
        if (reserve == 0) {
            return 0;
        }

        recovered = poolFactory.recoverManagedPoolUnallocatedRewards(poolAddress, recipient);
        assertEq(pool.rewardReserve(), 0);
    }

    function _syncManagedSequencePools(ManagedSequenceState memory state) private {
        _syncPoolClaim(state.singlePool);
        _syncPoolClaim(state.currentLpPool);
        if (state.previousLpPool != address(0)) {
            _syncPoolClaim(state.previousLpPool);
        }
    }

    function _assertManagedSequenceState(ManagedSequenceState memory state, bool requireTightReservedCoverage) private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 treasuryBalance = rewardToken.balanceOf(address(treasury));
        uint256 recipientBalance = rewardToken.balanceOf(recipient);
        uint256 poolBalances =
            rewardToken.balanceOf(state.singlePool) + rewardToken.balanceOf(state.currentLpPool);

        if (state.previousLpPool != address(0)) {
            poolBalances += rewardToken.balanceOf(state.previousLpPool);
            assertEq(manager.pendingPoolRewards(state.previousLpPool), state.lpPendingFrozenAtRecreation);
            assertFalse(poolFactory.managedPools(state.previousLpPool));
            assertEq(poolFactory.lpTokenPools(state.pair), state.currentLpPool);
        }

        assertEq(state.totalInflows, treasury.totalBurned() + treasuryBalance + managerBalance + recipientBalance + poolBalances);
        assertGe(managerBalance, manager.totalPendingRewards() + manager.undistributedRewards());
        if (requireTightReservedCoverage) {
            assertLe(managerBalance - (manager.totalPendingRewards() + manager.undistributedRewards()), 1);
        }
    }

    function _assertManagerDustBounded() private view {
        uint256 managerBalance = rewardToken.balanceOf(address(manager));
        uint256 reservedBalance = manager.totalPendingRewards() + manager.undistributedRewards();

        assertGe(managerBalance, reservedBalance);
        assertLe(managerBalance - reservedBalance, 1);
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}
