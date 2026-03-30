// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MockERC20.sol";

contract MockFeeOnTransferERC20 is MockERC20 {
    uint256 public immutable feeBps;

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _feeBps)
        MockERC20(_name, _symbol, _decimals)
    {
        require(_feeBps < 10000, "Invalid fee");
        feeBps = _feeBps;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        require(balanceOf[from] >= amount, "Insufficient balance");
        uint256 fee = (amount * feeBps) / 10000;
        uint256 amountAfterFee = amount - fee;

        balanceOf[from] -= amount;
        balanceOf[to] += amountAfterFee;
        totalSupply -= fee;

        emit Transfer(from, to, amountAfterFee);
        if (fee > 0) {
            emit Transfer(from, address(0), fee);
        }
    }
}
