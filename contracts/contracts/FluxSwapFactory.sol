// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import "./FluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";

/**
 * @title Flux Pair 工厂
 * @notice 负责创建交易对合约，并维护协议费金库与 Pair 索引。
 * @dev `TREASURY_SETTER_ROLE` 由单独流程管理，避免普通管理员直接改写金库设置权限。
 */
contract FluxSwapFactory is IFluxSwapFactory, AccessControl {
    // 允许修改协议费金库配置的角色标识。
    bytes32 public constant TREASURY_SETTER_ROLE = keccak256("TREASURY_SETTER_ROLE");

    // 当前协议费金库地址。
    address public override treasury;
    // 当前金库设置权限持有人地址。
    address public override treasurySetter;
    // 任意两种代币到 Pair 地址的双向索引。
    mapping(address => mapping(address => address)) public override getPair;
    // 已创建 Pair 的顺序列表。
    address[] public override allPairs;

    /**
     * @notice 初始化工厂并指定首个金库设置权限持有人。
     * @param _treasurySetter 初始金库设置者地址。
     */
    constructor(address _treasurySetter) {
        require(_treasurySetter != address(0), "FluxSwap: ZERO_ADDRESS");
        _grantRole(DEFAULT_ADMIN_ROLE, _treasurySetter);
        _grantRole(TREASURY_SETTER_ROLE, _treasurySetter);
        treasurySetter = _treasurySetter;
    }

    /**
     * @notice 为一对代币创建唯一的 Pair 合约。
     * @param tokenA 交易对代币 A。
     * @param tokenB 交易对代币 B。
     * @return pair 新创建 Pair 的地址。
     */
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

    /**
     * @notice 设置协议费金库地址。
     * @param _treasury 新的金库地址。
     */
    function setTreasury(address _treasury) external override {
        require(hasRole(TREASURY_SETTER_ROLE, msg.sender), "FluxSwap: FORBIDDEN");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice 迁移金库设置权限持有人。
     * @param _treasurySetter 新的金库设置者地址。
     */
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

    /**
     * @notice 返回已创建 Pair 的总数量。
     * @return length Pair 总数。
     */
    function allPairsLength() external view override returns (uint256 length) {
        length = allPairs.length;
    }

    /**
     * @notice 授予访问控制角色。
     * @dev `TREASURY_SETTER_ROLE` 只能通过 `setTreasurySetter` 迁移。
     * @param role 待授予角色。
     * @param account 待授予账户。
     */
    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.grantRole(role, account);
    }

    /**
     * @notice 撤销访问控制角色。
     * @dev `TREASURY_SETTER_ROLE` 只能通过 `setTreasurySetter` 迁移。
     * @param role 待撤销角色。
     * @param account 待撤销账户。
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.revokeRole(role, account);
    }

    /**
     * @notice 放弃访问控制角色。
     * @dev `TREASURY_SETTER_ROLE` 不允许直接放弃。
     * @param role 待放弃角色。
     * @param callerConfirmation 放弃确认地址。
     */
    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != TREASURY_SETTER_ROLE, "FluxSwap: ROLE_MANAGED_BY_SETTER");
        super.renounceRole(role, callerConfirmation);
    }

    /**
     * @notice 查询接口支持情况。
     * @param interfaceId 待查询接口标识。
     * @return supported 若支持则返回 `true`。
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool supported) {
        supported = super.supportsInterface(interfaceId);
    }
}
