// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxMultiPoolManager {
    function addPool(address pool, uint256 allocPoint, bool active) external;
    function claimPoolRewards(address pool) external returns (uint256);
    function pendingPoolRewards(address pool) external view returns (uint256);
}
