// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";

import "../../contracts/FluxToken.sol";

contract FluxTokenFuzzTest is Test {
    uint256 private constant MAX_CAP = 1e27;

    address private owner;
    address private newOwner;
    address private initialRecipient;
    address private minter;
    address private user;

    function setUp() public {
        owner = makeAddr("owner");
        newOwner = makeAddr("newOwner");
        initialRecipient = makeAddr("initialRecipient");
        minter = makeAddr("minter");
        user = makeAddr("user");
    }

    // 这一组 fuzz 锁定 FluxToken 的三条硬约束：
    // 1. 总供应量任何时候都不能越过 cap。
    // 2. burn 之后释放出来的 headroom 可以重新 mint，但上限仍是 cap。
    // 3. ownership 迁移后，旧 owner 的 admin / minter 权限必须同步撤掉。
    function testFuzz_mintWithinCap_tracksTotalSupplyExactly(uint96 rawInitialSupply, uint96 rawMintAmount) public {
        uint256 initialSupply = bound(uint256(rawInitialSupply), 0, MAX_CAP - 1);
        uint256 mintAmount = bound(uint256(rawMintAmount), 1, MAX_CAP - initialSupply);

        FluxToken token = new FluxToken("Flux Token", "FLUX", owner, initialRecipient, initialSupply, MAX_CAP);

        vm.prank(owner);
        bool minted = token.mint(user, mintAmount);

        assertTrue(minted);
        assertEq(token.totalSupply(), initialSupply + mintAmount);
        assertEq(token.balanceOf(user), mintAmount);
        assertLe(token.totalSupply(), token.cap());
    }

    function testFuzz_burnRestoresMintHeadroomWithoutBreakingCap(
        uint96 rawInitialSupply,
        uint96 rawBurnAmount,
        uint96 rawRemintAmount
    ) public {
        uint256 initialSupply = bound(uint256(rawInitialSupply), 2, MAX_CAP);
        uint256 burnAmount = bound(uint256(rawBurnAmount), 1, initialSupply);

        FluxToken token = new FluxToken("Flux Token", "FLUX", owner, initialRecipient, initialSupply, MAX_CAP);

        vm.prank(initialRecipient);
        token.burn(burnAmount);

        uint256 remintAmount = bound(uint256(rawRemintAmount), 1, MAX_CAP - token.totalSupply());

        vm.prank(owner);
        token.mint(user, remintAmount);

        assertEq(token.totalSupply(), initialSupply - burnAmount + remintAmount);
        assertEq(token.balanceOf(initialRecipient), initialSupply - burnAmount);
        assertEq(token.balanceOf(user), remintAmount);
        assertLe(token.totalSupply(), token.cap());
    }

    function testFuzz_mintAboveCapAlwaysReverts(uint96 rawInitialSupply, uint96 rawOverflowAmount) public {
        uint256 initialSupply = bound(uint256(rawInitialSupply), 1, MAX_CAP - 1);
        uint256 remainingHeadroom = MAX_CAP - initialSupply;
        uint256 overflowAmount = bound(uint256(rawOverflowAmount), remainingHeadroom + 1, MAX_CAP);

        FluxToken token = new FluxToken("Flux Token", "FLUX", owner, initialRecipient, initialSupply, MAX_CAP);

        vm.prank(owner);
        vm.expectRevert(bytes("FluxToken: CAP_EXCEEDED"));
        token.mint(user, overflowAmount);
    }

    function testFuzz_transferOwnership_revokesOldOwnerAndLetsNewOwnerRestoreMinterRights(uint96 rawMintAmount) public {
        uint256 mintAmount = bound(uint256(rawMintAmount), 1, MAX_CAP / 10);
        FluxToken token = new FluxToken("Flux Token", "FLUX", owner, initialRecipient, 0, MAX_CAP);

        vm.prank(owner);
        token.transferOwnership(newOwner);

        assertEq(token.owner(), newOwner);
        assertFalse(token.hasRole(bytes32(0), owner));
        assertTrue(token.hasRole(bytes32(0), newOwner));
        assertFalse(token.isMinter(owner));

        vm.prank(owner);
        vm.expectRevert(bytes("FluxToken: FORBIDDEN"));
        token.mint(user, mintAmount);

        vm.prank(owner);
        vm.expectRevert(bytes("FluxToken: FORBIDDEN"));
        token.setMinter(minter, true);

        vm.prank(newOwner);
        token.setMinter(minter, true);

        vm.prank(minter);
        token.mint(user, mintAmount);

        assertTrue(token.isMinter(minter));
        assertEq(token.balanceOf(user), mintAmount);
    }
}
