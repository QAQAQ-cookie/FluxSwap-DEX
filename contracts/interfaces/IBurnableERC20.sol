// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBurnableERC20 {
    function burnFrom(address account, uint256 amount) external;
}
