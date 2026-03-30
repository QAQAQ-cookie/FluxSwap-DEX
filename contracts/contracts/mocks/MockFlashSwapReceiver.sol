// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IFluxSwapPair.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IFluxSwapCallee.sol";

contract MockFlashSwapReceiver is IFluxSwapCallee {
    function fluxSwapCall(
        address,
        uint256,
        uint256,
        bytes calldata data
    ) external override {
        (address token, uint256 repayAmount) = abi.decode(data, (address, uint256));
        IERC20(token).transfer(msg.sender, repayAmount);
    }

    receive() external payable {}
}
