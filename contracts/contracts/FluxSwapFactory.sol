// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";

contract FluxSwapFactory is IFluxSwapFactory {
    address public override feeTo;
    address public override feeToSetter;
    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _feeToSetter) {
        require(_feeToSetter != address(0), "FluxSwap: ZERO_ADDRESS");
        feeToSetter = _feeToSetter;
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(tokenA != tokenB, "FluxSwap: IDENTICAL_ADDRESSES");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "FluxSwap: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "FluxSwap: PAIR_EXISTS");

        bytes memory bytecode = type(FluxSwapPair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));

        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), "FluxSwap: CREATE2_FAILED");

        FluxSwapPair(payable(pair)).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "FluxSwap: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "FluxSwap: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}
