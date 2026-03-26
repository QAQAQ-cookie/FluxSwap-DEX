// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library SafeMath {
    function min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y == 0) return 0;
        uint256 x = y;
        uint256 yShift = y;
        while (yShift > 0) {
            yShift >>= 1;
            x >>= 1;
        }
        z = x > 0 ? x : 1;
        for (uint256 i = 0; i < 256; i++) {
            z = (z + y / z) / 2;
        }
        return z;
    }
}