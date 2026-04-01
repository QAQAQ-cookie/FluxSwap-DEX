// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapPair.sol";
import "./FluxSwapStakingRewards.sol";

contract FluxSwapLPStakingPool is FluxSwapStakingRewards {
    address public immutable factory;
    address public immutable lpToken;
    address public immutable token0;
    address public immutable token1;

    constructor(
        address _owner,
        address _factory,
        address _lpToken,
        address _rewardsToken,
        address _rewardSource,
        address _rewardNotifier,
        uint256 _rewardsDuration
    )
        FluxSwapStakingRewards(
            _owner,
            _lpToken,
            _rewardsToken,
            _rewardSource,
            _rewardNotifier,
            _rewardsDuration
        )
    {
        require(_factory != address(0), "FluxSwapLPStakingPool: ZERO_ADDRESS");
        require(_lpToken != address(0), "FluxSwapLPStakingPool: ZERO_ADDRESS");

        address pairFactory = IFluxSwapPair(_lpToken).factory();
        require(pairFactory == _factory, "FluxSwapLPStakingPool: INVALID_FACTORY");

        address _token0 = IFluxSwapPair(_lpToken).token0();
        address _token1 = IFluxSwapPair(_lpToken).token1();
        require(_token0 != address(0) && _token1 != address(0), "FluxSwapLPStakingPool: INVALID_PAIR");
        require(
            IFluxSwapFactory(_factory).getPair(_token0, _token1) == _lpToken,
            "FluxSwapLPStakingPool: INVALID_PAIR"
        );

        factory = _factory;
        lpToken = _lpToken;
        token0 = _token0;
        token1 = _token1;
    }
}
