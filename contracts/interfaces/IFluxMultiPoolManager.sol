// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxMultiPoolManager {
    function treasury() external view returns (address);
    function rewardToken() external view returns (address);
    function addPool(address pool, uint256 allocPoint, bool active) external;
    function distributeRewards(uint256 totalReward) external;
    function claimPoolRewards(address pool) external returns (uint256);
    function pendingPoolRewards(address pool) external view returns (uint256);
}
