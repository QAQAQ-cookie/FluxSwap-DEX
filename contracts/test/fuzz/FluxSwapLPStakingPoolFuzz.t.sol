// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapLPStakingPool.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapLPStakingPoolFactoryMock {
    address public registeredPair;

    constructor(address registeredPair_) {
        registeredPair = registeredPair_;
    }

    function getPair(address, address) external view returns (address) {
        return registeredPair;
    }
}

contract FluxSwapLPStakingPoolPairMock {
    address public factory;
    address public token0;
    address public token1;

    constructor(address factory_, address token0_, address token1_) {
        factory = factory_;
        token0 = token0_;
        token1 = token1_;
    }
}

contract FluxSwapLPStakingPoolFuzzTest is Test {
    uint256 private constant MIN_LIQUIDITY = 1e12;
    uint256 private constant MAX_LIQUIDITY = 1e24;
    uint256 private constant MAX_REWARD = 1e24;

    FluxSwapFactory private factory;
    MockERC20 private rewardToken;

    address private owner;
    address private rewardSource;
    address private rewardNotifier;
    address private liquidityProvider;

    function setUp() public {
        owner = makeAddr("owner");
        rewardSource = makeAddr("rewardSource");
        rewardNotifier = makeAddr("rewardNotifier");
        liquidityProvider = makeAddr("liquidityProvider");

        factory = new FluxSwapFactory(address(this));
        rewardToken = new MockERC20("Reward Token", "RWD", 18);
    }

    // 这一组 fuzz 关注 LP 质押池对底层 pair 元数据的绑定，以及它继承的奖励分发语义：
    // 1. 构造完成后，factory / lpToken / token0 / token1 / stakingToken 必须全部和底层 pair 对齐。
    // 2. 真实 LP 质押后，单用户单批奖励的 earned / claim 必须与输入奖励一一对应。
    // 3. 传入错误 factory 或未被 factory 注册的假 pair 时，构造必须拒绝。
    function testFuzz_constructor_cachesPairMetadata(bool reverseOrder) public {
        (MockERC20 tokenA, MockERC20 tokenB, address pairAddress) = _createPair(reverseOrder);

        FluxSwapLPStakingPool pool = new FluxSwapLPStakingPool(
            owner,
            address(factory),
            pairAddress,
            address(rewardToken),
            rewardSource,
            rewardNotifier
        );

        FluxSwapPair pair = FluxSwapPair(pairAddress);

        assertEq(pool.factory(), address(factory));
        assertEq(pool.lpToken(), pairAddress);
        assertEq(pool.token0(), pair.token0());
        assertEq(pool.token1(), pair.token1());
        assertEq(pool.stakingToken(), pairAddress);
        assertEq(pool.rewardsToken(), address(rewardToken));
        assertTrue(pool.token0() == address(tokenA) || pool.token0() == address(tokenB));
        assertTrue(pool.token1() == address(tokenA) || pool.token1() == address(tokenB));
    }

    function testFuzz_singleStakerLpRewardFlow_matchesNotifiedReward(
        bool reverseOrder,
        uint96 rawAmountA,
        uint96 rawAmountB,
        uint96 rawReward
    ) public {
        uint256 amountA = bound(uint256(rawAmountA), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 amountB = bound(uint256(rawAmountB), MIN_LIQUIDITY, MAX_LIQUIDITY);
        uint256 reward = bound(uint256(rawReward), 1, MAX_REWARD);

        (, , address pairAddress) = _createPair(reverseOrder);
        FluxSwapLPStakingPool pool = new FluxSwapLPStakingPool(
            owner,
            address(factory),
            pairAddress,
            address(rewardToken),
            rewardSource,
            rewardNotifier
        );

        uint256 liquidity = _mintLiquidity(pairAddress, amountA, amountB);
        rewardToken.mint(rewardSource, reward);

        vm.prank(liquidityProvider);
        FluxSwapPair(pairAddress).approve(address(pool), type(uint256).max);

        vm.prank(liquidityProvider);
        pool.stake(liquidity);

        vm.prank(rewardSource);
        rewardToken.approve(address(pool), type(uint256).max);

        vm.prank(rewardNotifier);
        pool.notifyRewardAmount(reward);

        uint256 expectedEarned = reward - pool.queuedRewards();
        assertEq(pool.earned(liquidityProvider), expectedEarned);
        assertEq(pool.rewardReserve(), reward);

        vm.prank(liquidityProvider);
        pool.getReward();

        assertEq(rewardToken.balanceOf(liquidityProvider), expectedEarned);
        assertEq(pool.rewardReserve(), reward - expectedEarned);
        assertEq(pool.balanceOf(liquidityProvider), liquidity);
    }

    function testFuzz_constructor_rejectsWrongFactoryOrUnregisteredPair(bool reverseOrder) public {
        (MockERC20 tokenA, MockERC20 tokenB, address realPair) = _createPair(reverseOrder);

        FluxSwapFactory wrongFactory = new FluxSwapFactory(address(this));
        vm.expectRevert(bytes("FluxSwapLPStakingPool: INVALID_FACTORY"));
        new FluxSwapLPStakingPool(
            owner,
            address(wrongFactory),
            realPair,
            address(rewardToken),
            rewardSource,
            rewardNotifier
        );

        FluxSwapLPStakingPoolPairMock pairMock =
            new FluxSwapLPStakingPoolPairMock(address(0), address(tokenA), address(tokenB));
        FluxSwapLPStakingPoolFactoryMock factoryMock =
            new FluxSwapLPStakingPoolFactoryMock(address(0));

        pairMock = new FluxSwapLPStakingPoolPairMock(address(factoryMock), address(tokenA), address(tokenB));

        vm.expectRevert(bytes("FluxSwapLPStakingPool: INVALID_PAIR"));
        new FluxSwapLPStakingPool(
            owner,
            address(factoryMock),
            address(pairMock),
            address(rewardToken),
            rewardSource,
            rewardNotifier
        );
    }

    function _createPair(bool reverseOrder) private returns (MockERC20 tokenA, MockERC20 tokenB, address pairAddress) {
        tokenA = new MockERC20("Token A", "TKNA", 18);
        tokenB = new MockERC20("Token B", "TKNB", 18);

        address first = reverseOrder ? address(tokenB) : address(tokenA);
        address second = reverseOrder ? address(tokenA) : address(tokenB);

        pairAddress = factory.createPair(first, second);
    }

    function _mintLiquidity(address pairAddress, uint256 amountA, uint256 amountB) private returns (uint256 liquidity) {
        FluxSwapPair pair = FluxSwapPair(pairAddress);
        MockERC20 token0 = MockERC20(pair.token0());
        MockERC20 token1 = MockERC20(pair.token1());

        token0.mint(liquidityProvider, amountA);
        token1.mint(liquidityProvider, amountB);

        vm.startPrank(liquidityProvider);
        token0.transfer(pairAddress, amountA);
        token1.transfer(pairAddress, amountB);
        liquidity = pair.mint(liquidityProvider);
        vm.stopPrank();
    }
}
