// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../interfaces/IFluxSwapPair.sol";
import "../../interfaces/IFluxSwapFactory.sol";
import "../../interfaces/IERC20.sol";

contract MockFlashSwapReceiver {
    address public immutable factory;
    address public immutable weth;

    event Received(address token, uint256 amount, uint256 fee);

    constructor(address _factory, address _weth) {
        factory = _factory;
        weth = _weth;
    }

    function onFlashSwap(
        address,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external {
        address pair = IFluxSwapFactory(factory).getPair(
            IFluxSwapPair(msg.sender).token0(),
            IFluxSwapPair(msg.sender).token1()
        );
        require(msg.sender == pair, "Only pair can call");

        (address tokenOut, uint256 repayAmount) = abi.decode(data, (address, uint256));

        if (amount0Out > 0) {
            IERC20(IFluxSwapPair(msg.sender).token0()).transfer(msg.sender, repayAmount);
        }
        if (amount1Out > 0) {
            IERC20(IFluxSwapPair(msg.sender).token1()).transfer(msg.sender, repayAmount);
        }

        emit Received(tokenOut, amount0Out + amount1Out, repayAmount - (amount0Out + amount1Out));
    }

    receive() external payable {}
}