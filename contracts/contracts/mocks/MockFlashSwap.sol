// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IFluxSwapPair.sol";
import "../../interfaces/IERC20.sol";

contract MockFlashSwap {
    address public pair;
    address public token0;
    address public token1;

    constructor(address _pair) {
        pair = _pair;
        token0 = IFluxSwapPair(_pair).token0();
        token1 = IFluxSwapPair(_pair).token1();
    }

    function onFlashSwap(
        address,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata
    ) external {
        require(msg.sender == pair, "Only pair");

        uint256 amountOut = amount0Out > 0 ? amount0Out : amount1Out;
        address tokenOut = amount0Out > 0 ? token0 : token1;

        uint256 balance = IERC20(tokenOut).balanceOf(address(this));
        uint256 repayAmount = amountOut + (amountOut * 3) / 1000;

        require(balance >= repayAmount, "Insufficient balance for repay");
        IERC20(tokenOut).transfer(pair, repayAmount);
    }

    function executeFlashSwap(uint256 amount0Out, uint256 amount1Out) external {
        IFluxSwapPair(pair).flashSwap(address(this), amount0Out, amount1Out, "");
    }
}
