// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxSwapTreasury {
    function isFluxSwapTreasury() external pure returns (bool);
    function pullApprovedToken(address token, uint256 amount) external;
    function burnApprovedToken(address token, uint256 amount) external;
}
