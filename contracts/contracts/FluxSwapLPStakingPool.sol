// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapPair.sol";
import "./FluxSwapStakingRewards.sol";

/**
 * @title Flux LP 质押池
 * @notice 基于通用质押池扩展而来，专门用于验证和服务 LP Token 质押。
 * @dev 构造时会校验 LP Token 的工厂归属和底层交易对信息，防止误接入伪造 LP。
 */
contract FluxSwapLPStakingPool is FluxSwapStakingRewards {
    // 该 LP 必须归属的 Pair 工厂地址。
    address public immutable factory;
    // 作为质押资产的 LP Token 地址。
    address public immutable lpToken;
    // LP 对应的底层 `token0`。
    address public immutable token0;
    // LP 对应的底层 `token1`。
    address public immutable token1;

    /**
     * @notice 初始化 LP 质押池并校验 LP Token 合法性。
     * @param _owner 池所有者地址。
     * @param _factory 合法 Pair 所属工厂地址。
     * @param _lpToken 作为质押资产的 LP Token 地址。
     * @param _rewardsToken 奖励代币地址。
     * @param _rewardSource 奖励来源地址。
     * @param _rewardNotifier 奖励通知者地址。
     */
    constructor(
        address _owner,
        address _factory,
        address _lpToken,
        address _rewardsToken,
        address _rewardSource,
        address _rewardNotifier
    )
        FluxSwapStakingRewards(
            _owner,
            _lpToken,
            _rewardsToken,
            _rewardSource,
            _rewardNotifier
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
