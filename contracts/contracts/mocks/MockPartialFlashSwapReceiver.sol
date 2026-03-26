// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IFluxSwapPair.sol";
import "../../interfaces/IERC20.sol";

contract MockPartialFlashSwapReceiver {
    function onFlashSwap(
        address,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata
    ) external {
        if (amount0Out > 0) {
            IERC20(IFluxSwapPair(msg.sender).token0()).transfer(msg.sender, amount0Out);
        }
        if (amount1Out > 0) {
            IERC20(IFluxSwapPair(msg.sender).token1()).transfer(msg.sender, amount1Out);
        }
    }

    receive() external payable {}
}