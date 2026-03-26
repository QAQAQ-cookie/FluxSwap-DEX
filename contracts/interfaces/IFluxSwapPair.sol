// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxSwapPair {
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event FlashSwap(
        address indexed sender,
        uint256 amount0Out,
        uint256 amount1Out,
        uint256 amount0In,
        uint256 amount1In
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1);
    function price(address token, uint256 timeframeSeconds) external view returns (uint256);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
    function kLast() external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function PERMIT_TYPEHASH() external view returns (bytes32);
    function nonces(address owner) external view returns (uint256);

    function initialize(address token0, address token1) external;
    function mint(address to) external returns (uint256 liquidity);
    function burn(address to) external returns (uint256 amount0, uint256 amount1);
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;
    function flashSwap(address recipient, uint256 amount0Out, uint256 amount1Out, bytes calldata data) external;
    function skim(address to) external;
    function sync() external;
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;

    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}
