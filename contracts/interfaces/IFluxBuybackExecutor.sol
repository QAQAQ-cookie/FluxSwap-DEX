// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxBuybackExecutor {
    function treasury() external view returns (address);
    function buyToken() external view returns (address);

    function executeBuyback(
        address spendToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut);
}
