// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxSwapFactory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256);
    event TreasuryUpdated(address indexed treasury);
    event TreasurySetterUpdated(address indexed treasurySetter);

    function treasury() external view returns (address);
    function treasurySetter() external view returns (address);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint256) external view returns (address pair);
    function allPairsLength() external view returns (uint256);

    function createPair(address tokenA, address tokenB) external returns (address pair);
    function setTreasury(address) external;
    function setTreasurySetter(address) external;
}
