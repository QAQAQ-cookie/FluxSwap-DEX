// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title UQ112x112 - 无符号 Q112.112 定点数库
 * @notice 用于 TWAP 时间加权平均价格计算
 * @dev Q112 = 2^112，提供了约 5.19×10^33 的范围，远超任何实际市场需求
 *      使用 assembly 优化乘除运算，降低 gas 消耗
 */
library UQ112x112 {
    /** @notice Q112 = 2^112定点数缩放因子 */
    uint256 constant Q112 = 0x10000000000000000000000000000;

    /**
     * @notice 将一个数编码为 Q112.112 格式
     * @param y 要编码的数
     * @return z 编码后的 Q112.112 格式数
     */
    function encode(uint256 y) internal pure returns (uint256 z) {
        assembly {
            z := mul(y, Q112)
        }
    }

    /**
     * @notice Q112.112 格式的除法
     * @param x 被除数（Q112.112 格式）
     * @param y 除数
     * @return z 结果（Q112.112 格式）
     */
    function uqdiv(uint256 x, uint256 y) internal pure returns (uint256 z) {
        assembly {
            if iszero(y) {
                mstore(0x00, 0x20)
                mstore(0x20, 0x1b) // "UQ112x112: DIVISION_BY_ZERO"
                revert(0x00, 0x40)
            }
            z := div(mul(x, Q112), y)
        }
    }

    /**
     * @notice 计算分数的 Q112.112 表示
     * @param numerator 分子
     * @param denominator 分母
     * @return z 结果（Q112.112 格式）
     */
    function fraction(uint256 numerator, uint256 denominator) internal pure returns (uint256 z) {
        z = uqdiv(numerator, denominator);
    }
}