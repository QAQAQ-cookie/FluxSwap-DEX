// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxSwapFactory.sol";
import "../../contracts/FluxSwapPair.sol";
import "../../contracts/mocks/MockERC20.sol";

contract FluxSwapFactoryFuzzTest is Test {
    FluxSwapFactory private factory;

    address private treasurySetter;

    function setUp() public {
        treasurySetter = makeAddr("treasurySetter");
        factory = new FluxSwapFactory(treasurySetter);
    }

    // 这一组 fuzz 关注工厂侧的 pair 注册与 treasury setter 治理语义：
    // 1. createPair 后双向映射、pair 元数据、allPairs 长度必须同时成立。
    // 2. 多个不同 pair 创建后，allPairs 序列必须稳定增长，不能覆盖前值。
    // 3. treasury setter 迁移后，旧 setter 必须立刻失权，新 setter 必须能接管 treasury 更新。
    function testFuzz_createPair_registersSymmetricMappingsAndCanonicalTokens(bool reverseOrder) public {
        MockERC20 tokenA = new MockERC20("Token A", "TKNA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKNB", 18);

        address first = reverseOrder ? address(tokenB) : address(tokenA);
        address second = reverseOrder ? address(tokenA) : address(tokenB);

        address pairAddress = factory.createPair(first, second);
        FluxSwapPair pair = FluxSwapPair(pairAddress);
        (address expectedToken0, address expectedToken1) =
            address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));

        assertEq(factory.getPair(address(tokenA), address(tokenB)), pairAddress);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pairAddress);
        assertEq(factory.allPairsLength(), 1);
        assertEq(factory.allPairs(0), pairAddress);
        assertEq(pair.factory(), address(factory));
        assertEq(pair.token0(), expectedToken0);
        assertEq(pair.token1(), expectedToken1);
    }

    function testFuzz_createMultiplePairs_growsAllPairsWithoutOverwriting(bool reverseFirst, bool reverseSecond) public {
        MockERC20 tokenA = new MockERC20("Token A", "TKNA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKNB", 18);
        MockERC20 tokenC = new MockERC20("Token C", "TKNC", 18);
        MockERC20 tokenD = new MockERC20("Token D", "TKND", 18);

        address firstA = reverseFirst ? address(tokenB) : address(tokenA);
        address firstB = reverseFirst ? address(tokenA) : address(tokenB);
        address secondA = reverseSecond ? address(tokenD) : address(tokenC);
        address secondB = reverseSecond ? address(tokenC) : address(tokenD);

        address pairOne = factory.createPair(firstA, firstB);
        address pairTwo = factory.createPair(secondA, secondB);

        assertEq(factory.allPairsLength(), 2);
        assertEq(factory.allPairs(0), pairOne);
        assertEq(factory.allPairs(1), pairTwo);
        assertTrue(pairOne != pairTwo);
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pairOne);
        assertEq(factory.getPair(address(tokenC), address(tokenD)), pairTwo);
    }

    function testFuzz_setTreasurySetter_migratesAuthority(uint160 rawNewSetter, uint160 rawTreasury) public {
        address newSetter = address(uint160(bound(uint256(rawNewSetter), 1, type(uint160).max)));
        address newTreasury = address(uint160(bound(uint256(rawTreasury), 1, type(uint160).max)));
        vm.assume(newSetter != treasurySetter);

        vm.prank(treasurySetter);
        factory.setTreasurySetter(newSetter);

        assertEq(factory.treasurySetter(), newSetter);
        assertFalse(factory.hasRole(factory.TREASURY_SETTER_ROLE(), treasurySetter));
        assertTrue(factory.hasRole(factory.TREASURY_SETTER_ROLE(), newSetter));

        vm.prank(treasurySetter);
        vm.expectRevert(bytes("FluxSwap: FORBIDDEN"));
        factory.setTreasury(newTreasury);

        vm.prank(newSetter);
        factory.setTreasury(newTreasury);

        assertEq(factory.treasury(), newTreasury);
    }
}
