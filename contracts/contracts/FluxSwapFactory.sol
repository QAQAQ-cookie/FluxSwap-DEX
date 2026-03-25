// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";

/**
 * @title FluxSwapFactory - 工厂合约
 * @notice 用于创建和管理交易对（Pair）
 * @dev 使用 CREATE2 部署，确保相同 token 对生成相同的 Pair 地址
 */
contract FluxSwapFactory is IFluxSwapFactory {
    // ==================== 状态变量 ====================
    /** @notice 手续费接收地址（协议费用） */
    address public override feeTo;

    /** @notice feeTo 设置者地址，用于权限控制 */
    address public override feeToSetter;

    /** @notice token 对到 Pair 地址的映射 */
    mapping(address => mapping(address => address)) public override getPair;

    /** @notice 所有交易对的数组 */
    address[] public override allPairs;

    // ==================== 构造函数 ====================
    /** @notice 构造函数，设置 feeToSetter */
    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    // ==================== 只读函数 ====================
    /** @notice 获取所有交易对的数量 */
    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    // ==================== 交易对创建 ====================
    /**
     * @notice 创建新的交易对
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @return pair 新创建的 Pair 合约地址
     * @dev 使用 CREATE2 部署，确保确定性地址
     */
    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        // 1. 检查两个代币地址不同
        require(tokenA != tokenB, "FluxSwap: IDENTICAL_ADDRESSES");

        // 2. 确保 token0 < token1（统一顺序，便于查找）
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        // 3. 检查 token0 不是零地址
        require(token0 != address(0), "FluxSwap: ZERO_ADDRESS");

        // 4. 检查交易对不存在
        require(getPair[token0][token1] == address(0), "FluxSwap: PAIR_EXISTS");

        // 5. 获取 Pair 的创建字节码
        bytes memory bytecode = type(FluxSwapPair).creationCode;

        // 6. 使用 token0 和 token1 计算盐值
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));

        // 7. 使用 CREATE2 部署 Pair 合约
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        // 8. 初始化 Pair，设置 token0 和 token1
        FluxSwapPair(payable(pair)).initialize(token0, token1);

        // 9. 更新映射，双向存储（token0-token1 和 token1-token0）
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;

        // 10. 将新 Pair 添加到数组
        allPairs.push(pair);

        // 11. 触发交易对创建事件
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    // ==================== 手续费设置 ====================
    /**
     * @notice 设置手续费接收地址
     * @param _feeTo 新的手续费接收地址
     * @dev 只有 feeToSetter 才能调用
     */
    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "FluxSwap: FORBIDDEN");
        feeTo = _feeTo;
    }

    /**
     * @notice 设置 feeToSetter（管理员）
     * @param _feeToSetter 新的 feeToSetter 地址
     * @dev 只有当前的 feeToSetter 才能调用，用于管理员变更
     */
    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "FluxSwap: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}
