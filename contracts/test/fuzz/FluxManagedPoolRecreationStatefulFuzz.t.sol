// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxPoolFactory} from "../../contracts/FluxPoolFactory.sol";
import {FluxSwapPair} from "../../contracts/FluxSwapPair.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapLPStakingPool} from "../../contracts/FluxSwapLPStakingPool.sol";
import {FluxSwapStakingRewards} from "../../contracts/FluxSwapStakingRewards.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxManagedPoolRecreationTreasuryMock {
    function pullApprovedToken(address token, uint256 amount) external {
        MockERC20(token).transfer(msg.sender, amount);
    }

    function burnApprovedToken(address, uint256) external pure {}

    function isFluxSwapTreasury() external pure returns (bool) {
        return true;
    }
}

contract FluxManagedPoolRecreationStatefulFuzzTest is Test {
    uint256 private constant MIN_REWARD = 1e12;
    uint256 private constant MAX_REWARD = 1e24;

    MockERC20 private rewardToken;
    MockERC20 private stakingToken;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    FluxManagedPoolRecreationTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxSwapFactory private dexFactory;
    FluxPoolFactory private poolFactory;

    address private recipient;
    address private newOwner;

    function setUp() public {
        rewardToken = new MockERC20("Reward Token", "RWD", 18);
        stakingToken = new MockERC20("Stake Token", "STK", 18);
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        treasury = new FluxManagedPoolRecreationTreasuryMock();
        manager = new FluxMultiPoolManager(address(this), address(treasury), address(this), address(rewardToken));
        dexFactory = new FluxSwapFactory(address(this));
        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));

        recipient = makeAddr("recipient");
        newOwner = makeAddr("newOwner");

        manager.setPoolFactory(address(poolFactory));
    }

    // 这一组 stateful fuzz 专门补“managed pool 转移后，同资产重建新池”的状态机：
    // 1. 旧 single pool 先参与一轮分发并结清，随后移交 ownership，工厂映射必须清空。
    // 2. 同一个 staking token 上重建新的 managed single pool 后，映射必须指向新池。
    // 3. 后续奖励只能继续流向新池，旧池不得再因为同资产重建而恢复 accrual。
    function testFuzz_recreateSinglePoolAfterTransfer_keepsFactoryMappingsAndRewardsIsolated(
        uint32 rawOldSingleAlloc,
        uint32 rawLpAlloc,
        uint32 rawNewSingleAlloc,
        uint96 rawRewardRoundOne,
        uint96 rawRewardRoundTwo
    ) public {
        uint256 oldSingleAlloc = bound(uint256(rawOldSingleAlloc), 1, 1_000_000);
        uint256 lpAlloc = bound(uint256(rawLpAlloc), 1, 1_000_000);
        uint256 newSingleAlloc = bound(uint256(rawNewSingleAlloc), 1, 1_000_000);
        uint256 rewardRoundOne = bound(uint256(rawRewardRoundOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardRoundTwo = bound(uint256(rawRewardRoundTwo), MIN_REWARD, MAX_REWARD);

        address oldSinglePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), oldSingleAlloc, true);
        address lpPoolAddress = poolFactory.createLPPool(_createPair(), lpAlloc, true);

        FluxSwapStakingRewards oldSinglePool = FluxSwapStakingRewards(oldSinglePoolAddress);
        _injectAndDistribute(rewardRoundOne);
        _syncAndRecoverAll(oldSinglePoolAddress, lpPoolAddress);
        uint256 recipientBeforeRoundTwoRecovery = rewardToken.balanceOf(recipient);

        uint256 oldSinglePendingBeforeTransfer = manager.pendingPoolRewards(oldSinglePoolAddress);

        poolFactory.transferManagedPoolOwnership(oldSinglePoolAddress, newOwner);

        assertEq(oldSinglePool.owner(), newOwner);
        assertFalse(poolFactory.managedPools(oldSinglePoolAddress));
        assertEq(poolFactory.singleTokenPools(address(stakingToken)), address(0));
        assertEq(poolFactory.managedPoolStakingAsset(oldSinglePoolAddress), address(0));
        assertFalse(poolFactory.managedPoolIsLP(oldSinglePoolAddress));
        assertEq(manager.totalAllocPoint(), lpAlloc);

        address newSinglePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), newSingleAlloc, true);
        FluxSwapStakingRewards newSinglePool = FluxSwapStakingRewards(newSinglePoolAddress);

        assertEq(poolFactory.singleTokenPools(address(stakingToken)), newSinglePoolAddress);
        assertTrue(poolFactory.managedPools(newSinglePoolAddress));
        assertEq(poolFactory.managedPoolStakingAsset(newSinglePoolAddress), address(stakingToken));
        assertFalse(poolFactory.managedPoolIsLP(newSinglePoolAddress));
        assertEq(manager.totalAllocPoint(), lpAlloc + newSingleAlloc);

        _injectAndDistribute(rewardRoundTwo);

        assertEq(manager.pendingPoolRewards(oldSinglePoolAddress), oldSinglePendingBeforeTransfer);

        uint256 expectedNewSingleRoundTwo = manager.pendingPoolRewards(newSinglePoolAddress);
        uint256 actualNewSingleRoundTwo = _syncPoolClaim(address(newSinglePool));

        assertGe(expectedNewSingleRoundTwo, actualNewSingleRoundTwo);
        assertLe(expectedNewSingleRoundTwo - actualNewSingleRoundTwo, 1);
        assertGt(actualNewSingleRoundTwo, 0);

        uint256 recovered = poolFactory.recoverManagedPoolUnallocatedRewards(newSinglePoolAddress, recipient);
        assertEq(recovered, actualNewSingleRoundTwo);
        assertEq(rewardToken.balanceOf(recipient) - recipientBeforeRoundTwoRecovery, recovered);
    }

    // 这一组 stateful fuzz 把同样的“移交后重建”路径压到 LP pool 上：
    // 1. 旧 LP pool 移交后，lpToken -> pool 映射必须清空，manager allocPoint 也必须同步扣减。
    // 2. 对同一 pair 重建新的 managed LP pool 后，pair 元数据和工厂映射都必须重新指向新池。
    // 3. 新一轮奖励只能继续流向新 LP pool，旧 LP pool 的 pending 不得继续增长。
    function testFuzz_recreateLpPoolAfterTransfer_keepsPairRegistrationAndAllocAccountingConsistent(
        uint32 rawSingleAlloc,
        uint32 rawOldLpAlloc,
        uint32 rawNewLpAlloc,
        uint96 rawRewardRoundOne,
        uint96 rawRewardRoundTwo
    ) public {
        uint256 singleAlloc = bound(uint256(rawSingleAlloc), 1, 1_000_000);
        uint256 oldLpAlloc = bound(uint256(rawOldLpAlloc), 1, 1_000_000);
        uint256 newLpAlloc = bound(uint256(rawNewLpAlloc), 1, 1_000_000);
        uint256 rewardRoundOne = bound(uint256(rawRewardRoundOne), MIN_REWARD, MAX_REWARD);
        uint256 rewardRoundTwo = bound(uint256(rawRewardRoundTwo), MIN_REWARD, MAX_REWARD);

        address pairAddress = _createPair();
        address singlePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), singleAlloc, true);
        address oldLpPoolAddress = poolFactory.createLPPool(pairAddress, oldLpAlloc, true);

        FluxSwapLPStakingPool oldLpPool = FluxSwapLPStakingPool(oldLpPoolAddress);

        _injectAndDistribute(rewardRoundOne);
        _syncAndRecoverAll(singlePoolAddress, oldLpPoolAddress);
        uint256 recipientBeforeRoundTwoRecovery = rewardToken.balanceOf(recipient);

        uint256 oldLpPendingBeforeTransfer = manager.pendingPoolRewards(oldLpPoolAddress);

        poolFactory.transferManagedPoolOwnership(oldLpPoolAddress, newOwner);

        assertEq(oldLpPool.owner(), newOwner);
        assertFalse(poolFactory.managedPools(oldLpPoolAddress));
        assertEq(poolFactory.lpTokenPools(pairAddress), address(0));
        assertEq(poolFactory.managedPoolStakingAsset(oldLpPoolAddress), address(0));
        assertFalse(poolFactory.managedPoolIsLP(oldLpPoolAddress));
        assertEq(manager.totalAllocPoint(), singleAlloc);

        address newLpPoolAddress = poolFactory.createLPPool(pairAddress, newLpAlloc, true);
        FluxSwapLPStakingPool newLpPool = FluxSwapLPStakingPool(newLpPoolAddress);

        assertEq(poolFactory.lpTokenPools(pairAddress), newLpPoolAddress);
        assertTrue(poolFactory.managedPools(newLpPoolAddress));
        assertEq(poolFactory.managedPoolStakingAsset(newLpPoolAddress), pairAddress);
        assertTrue(poolFactory.managedPoolIsLP(newLpPoolAddress));
        assertEq(newLpPool.lpToken(), pairAddress);
        assertEq(newLpPool.token0(), FluxSwapPair(pairAddress).token0());
        assertEq(newLpPool.token1(), FluxSwapPair(pairAddress).token1());
        assertEq(manager.totalAllocPoint(), singleAlloc + newLpAlloc);

        _injectAndDistribute(rewardRoundTwo);

        assertEq(manager.pendingPoolRewards(oldLpPoolAddress), oldLpPendingBeforeTransfer);

        uint256 expectedNewLpRoundTwo = manager.pendingPoolRewards(newLpPoolAddress);
        uint256 actualNewLpRoundTwo = _syncPoolClaim(address(newLpPool));

        assertGe(expectedNewLpRoundTwo, actualNewLpRoundTwo);
        assertLe(expectedNewLpRoundTwo - actualNewLpRoundTwo, 1);
        assertGt(actualNewLpRoundTwo, 0);

        uint256 recovered = poolFactory.recoverManagedPoolUnallocatedRewards(newLpPoolAddress, recipient);
        assertEq(recovered, actualNewLpRoundTwo);
        assertEq(rewardToken.balanceOf(recipient) - recipientBeforeRoundTwoRecovery, recovered);
    }

    function _syncAndRecoverAll(address singlePoolAddress, address lpPoolAddress) private {
        uint256 singleActual = _syncPoolClaim(singlePoolAddress);
        uint256 lpActual = _syncPoolClaim(lpPoolAddress);

        if (singleActual > 0) {
            poolFactory.recoverManagedPoolUnallocatedRewards(singlePoolAddress, recipient);
        }
        if (lpActual > 0) {
            poolFactory.recoverManagedPoolUnallocatedRewards(lpPoolAddress, recipient);
        }
    }

    function _syncPoolClaim(address poolAddress) private returns (uint256 actualClaimed) {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(poolAddress);
        uint256 reserveBefore = pool.rewardReserve();
        pool.syncRewards();
        actualClaimed = pool.rewardReserve() - reserveBefore;
    }

    function _createPair() private returns (address pairAddress) {
        pairAddress = dexFactory.createPair(address(tokenA), address(tokenB));
    }

    function _injectAndDistribute(uint256 rewardAmount) private {
        rewardToken.mint(address(treasury), rewardAmount);
        manager.distributeRewards(rewardAmount);
    }
}
