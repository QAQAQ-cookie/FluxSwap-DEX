// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import "./FluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";

contract FluxSwapFactory is IFluxSwapFactory, AccessControl {
    bytes32 public constant TREASURY_SETTER_ROLE = keccak256("TREASURY_SETTER_ROLE");

    address public override treasury;
    address public override treasurySetter;
    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _treasurySetter) {
        require(_treasurySetter != address(0), "FluxSwap: ZERO_ADDRESS");
        _grantRole(DEFAULT_ADMIN_ROLE, _treasurySetter);
        _grantRole(TREASURY_SETTER_ROLE, _treasurySetter);
        treasurySetter = _treasurySetter;
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

    function setTreasury(address _treasury) external override {
        require(hasRole(TREASURY_SETTER_ROLE, msg.sender), "FluxSwap: FORBIDDEN");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setTreasurySetter(address _treasurySetter) external override {
        require(_treasurySetter != address(0), "FluxSwap: ZERO_ADDRESS");
        require(hasRole(TREASURY_SETTER_ROLE, msg.sender), "FluxSwap: FORBIDDEN");
        require(_treasurySetter != treasurySetter, "FluxSwap: SAME_TREASURY_SETTER");

        address previousTreasurySetter = treasurySetter;
        _grantRole(DEFAULT_ADMIN_ROLE, _treasurySetter);
        _grantRole(TREASURY_SETTER_ROLE, _treasurySetter);
        _revokeRole(TREASURY_SETTER_ROLE, previousTreasurySetter);
        _revokeRole(DEFAULT_ADMIN_ROLE, previousTreasurySetter);
        treasurySetter = _treasurySetter;
        emit TreasurySetterUpdated(_treasurySetter);
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.renounceRole(role, callerConfirmation);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
