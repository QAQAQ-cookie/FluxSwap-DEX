// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";

import {FluxMultiPoolManager} from "../../contracts/FluxMultiPoolManager.sol";
import {FluxPoolFactory} from "../../contracts/FluxPoolFactory.sol";
import {FluxRevenueDistributor} from "../../contracts/FluxRevenueDistributor.sol";
import {FluxSwapFactory} from "../../contracts/FluxSwapFactory.sol";
import {FluxSwapLPStakingPool} from "../../contracts/FluxSwapLPStakingPool.sol";
import {FluxSwapStakingRewards} from "../../contracts/FluxSwapStakingRewards.sol";
import {MockERC20} from "../../contracts/mocks/MockERC20.sol";

contract FluxRevenueManagedPoolsInvariantBurnableMockERC20 is MockERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) MockERC20(name_, symbol_, decimals_) {}

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}

contract FluxRevenueManagedPoolsInvariantTreasuryMock {
    FluxRevenueManagedPoolsInvariantBurnableMockERC20 public immutable rewardToken;
    uint256 public totalBurned;
    bool public paused;

    constructor(FluxRevenueManagedPoolsInvariantBurnableMockERC20 rewardToken_) {
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

contract FluxRevenueManagedPoolsInvariantBuybackExecutorMock {
    address public treasury;
    address public buyToken;
    uint256 public amountOutBps;

    FluxRevenueManagedPoolsInvariantBurnableMockERC20 private immutable rewardToken;

    constructor(
        address treasury_,
        FluxRevenueManagedPoolsInvariantBurnableMockERC20 rewardToken_,
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

contract FluxRevenueManagedPoolsInvariantHandler is Test {
    uint256 private constant MAX_AMOUNT = 1e24;
    uint256 private constant MAX_ALLOC = 1_000_000;

    FluxRevenueDistributor public immutable distributor;
    FluxMultiPoolManager public immutable manager;
    FluxPoolFactory public immutable poolFactory;
    FluxRevenueManagedPoolsInvariantTreasuryMock public immutable treasury;
    FluxRevenueManagedPoolsInvariantBurnableMockERC20 public immutable rewardToken;
    MockERC20 public immutable spendToken;

    address public immutable distributorOwner;
    address public immutable distributorOperator;
    address public immutable recipient;
    address public immutable newOwner;

    address public singlePool;
    address public currentLpPool;
    address public previousLpPool;
    address public immutable pair;

    uint256 public totalBuybackInflows;
    uint256 public totalDirectInflows;
    uint256 public frozenPreviousLpPending;
    bool public lpRecreated;

    constructor(
        FluxRevenueDistributor distributor_,
        FluxMultiPoolManager manager_,
        FluxPoolFactory poolFactory_,
        FluxRevenueManagedPoolsInvariantTreasuryMock treasury_,
        FluxRevenueManagedPoolsInvariantBurnableMockERC20 rewardToken_,
        MockERC20 spendToken_,
        address distributorOwner_,
        address distributorOperator_,
        address recipient_,
        address newOwner_,
        address singlePool_,
        address lpPool_
    ) {
        distributor = distributor_;
        manager = manager_;
        poolFactory = poolFactory_;
        treasury = treasury_;
        rewardToken = rewardToken_;
        spendToken = spendToken_;
        distributorOwner = distributorOwner_;
        distributorOperator = distributorOperator_;
        recipient = recipient_;
        newOwner = newOwner_;
        singlePool = singlePool_;
        currentLpPool = lpPool_;
        pair = FluxSwapLPStakingPool(lpPool_).lpToken();
    }

    function executeBuyback(uint256 rawRevenueAmount) external {
        uint256 revenueAmount = bound(rawRevenueAmount, 10_000, MAX_AMOUNT);
        vm.prank(distributorOperator);
        (bool success, bytes memory data) = address(distributor).call(
            abi.encodeCall(
                FluxRevenueDistributor.executeBuybackAndDistribute,
                (address(spendToken), revenueAmount, 0, _buybackPath(), block.timestamp + 1 hours)
            )
        );

        if (success) {
            totalBuybackInflows += abi.decode(data, (uint256));
        }
    }

    function distributeTreasuryRewards(uint256 rawAmount) external {
        uint256 amount = bound(rawAmount, 1, MAX_AMOUNT);
        rewardToken.mint(address(treasury), amount);
        totalDirectInflows += amount;

        vm.prank(distributorOperator);
        (bool success, ) =
            address(distributor).call(abi.encodeCall(FluxRevenueDistributor.distributeTreasuryRewards, (amount)));
        if (!success) {
            return;
        }
    }

    function syncSinglePool() external {
        FluxSwapStakingRewards(singlePool).syncRewards();
    }

    function recoverSinglePool() external {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(singlePool);
        if (pool.rewardReserve() == 0) {
            return;
        }

        poolFactory.recoverManagedPoolUnallocatedRewards(singlePool, recipient);
    }

    function syncCurrentLpPool() external {
        FluxSwapStakingRewards(currentLpPool).syncRewards();
    }

    function recoverCurrentLpPool() external {
        FluxSwapStakingRewards pool = FluxSwapStakingRewards(currentLpPool);
        if (pool.rewardReserve() == 0) {
            return;
        }

        poolFactory.recoverManagedPoolUnallocatedRewards(currentLpPool, recipient);
    }

    function toggleTreasuryPause() external {
        treasury.setPaused(!treasury.paused());
    }

    function toggleDistributorPause() external {
        if (distributor.paused()) {
            vm.prank(distributorOwner);
            distributor.unpause();
            return;
        }

        vm.prank(distributorOwner);
        distributor.pause();
    }

    function recreateLpPool(uint256 rawAllocPoint) external {
        if (lpRecreated) {
            return;
        }

        uint256 allocPoint = bound(rawAllocPoint, 1, MAX_ALLOC);

        FluxSwapStakingRewards(currentLpPool).syncRewards();
        FluxSwapStakingRewards lpPool = FluxSwapStakingRewards(currentLpPool);
        if (lpPool.rewardReserve() > 0) {
            poolFactory.recoverManagedPoolUnallocatedRewards(currentLpPool, recipient);
        }

        previousLpPool = currentLpPool;
        poolFactory.transferManagedPoolOwnership(currentLpPool, newOwner);
        frozenPreviousLpPending = manager.pendingPoolRewards(previousLpPool);
        currentLpPool = poolFactory.createLPPool(pair, allocPoint, true);
        lpRecreated = true;
    }

    function managedPoolBalances() external view returns (uint256) {
        uint256 balance = rewardToken.balanceOf(singlePool) + rewardToken.balanceOf(currentLpPool);
        if (previousLpPool != address(0)) {
            balance += rewardToken.balanceOf(previousLpPool);
        }
        return balance;
    }

    function totalInflows() external view returns (uint256) {
        return totalBuybackInflows + totalDirectInflows;
    }

    function _buybackPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(spendToken);
        path[1] = address(rewardToken);
    }
}

contract FluxRevenueManagedPoolsInvariantTest is StdInvariant, Test {
    FluxRevenueManagedPoolsInvariantBurnableMockERC20 private rewardToken;
    MockERC20 private spendToken;
    MockERC20 private stakingToken;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    FluxRevenueManagedPoolsInvariantTreasuryMock private treasury;
    FluxMultiPoolManager private manager;
    FluxRevenueManagedPoolsInvariantBuybackExecutorMock private buybackExecutor;
    FluxRevenueDistributor private distributor;
    FluxSwapFactory private dexFactory;
    FluxPoolFactory private poolFactory;
    FluxRevenueManagedPoolsInvariantHandler private handler;

    address private managerOwner;
    address private distributorOwner;
    address private distributorOperator;
    address private managerBootstrapOperator;
    address private recipient;
    address private newOwner;

    function setUp() public {
        managerOwner = makeAddr("managerOwner");
        distributorOwner = makeAddr("distributorOwner");
        distributorOperator = makeAddr("distributorOperator");
        managerBootstrapOperator = makeAddr("managerBootstrapOperator");
        recipient = makeAddr("recipient");
        newOwner = makeAddr("newOwner");

        rewardToken = new FluxRevenueManagedPoolsInvariantBurnableMockERC20("Reward Token", "RWD", 18);
        spendToken = new MockERC20("Spend Token", "SPEND", 18);
        stakingToken = new MockERC20("Stake Token", "STK", 18);
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        treasury = new FluxRevenueManagedPoolsInvariantTreasuryMock(rewardToken);
        manager = new FluxMultiPoolManager(managerOwner, address(treasury), managerBootstrapOperator, address(rewardToken));
        dexFactory = new FluxSwapFactory(address(this));
        poolFactory = new FluxPoolFactory(address(this), address(manager), address(dexFactory), address(rewardToken));

        vm.prank(managerOwner);
        manager.setPoolFactory(address(poolFactory));

        buybackExecutor = new FluxRevenueManagedPoolsInvariantBuybackExecutorMock(address(treasury), rewardToken, 12_000);
        distributor = new FluxRevenueDistributor(
            distributorOwner,
            distributorOperator,
            address(buybackExecutor),
            address(manager),
            6_000,
            2_500
        );

        vm.prank(managerOwner);
        manager.setOperator(address(distributor));

        address pairAddress = dexFactory.createPair(address(tokenA), address(tokenB));
        address singlePoolAddress = poolFactory.createSingleTokenPool(address(stakingToken), 1_000, true);
        address lpPoolAddress = poolFactory.createLPPool(pairAddress, 2_000, true);

        handler = new FluxRevenueManagedPoolsInvariantHandler(
            distributor,
            manager,
            poolFactory,
            treasury,
            rewardToken,
            spendToken,
            distributorOwner,
            distributorOperator,
            recipient,
            newOwner,
            singlePoolAddress,
            lpPoolAddress
        );

        targetContract(address(handler));
    }

    // 不变量 1：真实 managed pool 流水线里的总 inflow 必须始终由
    // burned + treasury + manager + managed pools + recipient 完整解释。
    function invariant_revenuePipelineConservation() public view {
        uint256 totalInflows = handler.totalInflows();
        uint256 systemBalances =
            treasury.totalBurned()
            + rewardToken.balanceOf(address(treasury))
            + rewardToken.balanceOf(address(manager))
            + handler.managedPoolBalances()
            + rewardToken.balanceOf(recipient);

        assertEq(totalInflows, systemBalances);
    }

    // 不变量 2：manager 余额必须始终覆盖 pending + undistributed。
    function invariant_managerBalanceCoversReservedRewards() public view {
        uint256 reservedBalance = manager.totalPendingRewards() + manager.undistributedRewards();
        assertGe(rewardToken.balanceOf(address(manager)), reservedBalance);
    }

    // 不变量 3：一旦 LP managed pool 被重建，旧池必须退出 managed 注册，pair 映射必须指向新池。
    function invariant_recreatedLpPoolKeepsFactoryMappingIsolated() public view {
        if (!handler.lpRecreated()) {
            return;
        }

        address previousLpPool = handler.previousLpPool();
        address currentLpPool = handler.currentLpPool();
        address pair = handler.pair();

        assertFalse(poolFactory.managedPools(previousLpPool));
        assertEq(poolFactory.lpTokenPools(pair), currentLpPool);
        assertEq(poolFactory.managedPoolStakingAsset(currentLpPool), pair);
        assertTrue(poolFactory.managedPoolIsLP(currentLpPool));
    }

    // 不变量 4：LP 重建后，旧池 pending 必须冻结，后续奖励不能再流回旧池。
    function invariant_oldLpPendingFreezesAfterRecreation() public view {
        if (!handler.lpRecreated()) {
            return;
        }

        assertEq(
            manager.pendingPoolRewards(handler.previousLpPool()),
            handler.frozenPreviousLpPending()
        );
    }
}
