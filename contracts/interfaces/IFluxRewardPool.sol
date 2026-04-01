// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxRewardPool {
    function notifyRewardAmount(uint256 reward) external;
}
