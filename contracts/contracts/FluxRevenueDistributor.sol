// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxBuybackExecutor.sol";
import "../interfaces/IFluxMultiPoolManager.sol";
import "../interfaces/IFluxSwapTreasury.sol";
import "../libraries/TransferHelper.sol";

contract FluxRevenueDistributor is Ownable, AccessControl {
    uint256 private constant BPS_BASE = 10000;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address public immutable rewardToken;
    address public operator;
    address public buybackExecutor;
    address public manager;
    uint256 public buybackBps;
    uint256 public burnBps;
    bool public paused;

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event BuybackExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event ManagerUpdated(address indexed previousManager, address indexed newManager);
    event RevenueConfigurationUpdated(uint256 previousBuybackBps, uint256 newBuybackBps, uint256 previousBurnBps, uint256 newBurnBps);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event RevenueBuybackAndDistributionExecuted(
        address indexed spendToken,
        uint256 revenueAmount,
        uint256 buybackAmountIn,
        uint256 buybackAmountOut,
        uint256 burnedAmount,
        uint256 distributedAmount,
        address indexed executor
    );
    event TreasuryRewardsDistributed(uint256 amount, address indexed executor);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxRevenueDistributor: FORBIDDEN");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "FluxRevenueDistributor: PAUSED");
        _;
    }

    constructor(
        address _owner,
        address _operator,
        address _buybackExecutor,
        address _manager,
        uint256 _buybackBps,
        uint256 _burnBps
    ) Ownable(_owner) {
        require(_operator != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_buybackExecutor != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_manager != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(_buybackBps > 0 && _buybackBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");
        require(_burnBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");

        address _rewardToken = IFluxMultiPoolManager(_manager).rewardToken();
        require(_rewardToken != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(IFluxBuybackExecutor(_buybackExecutor).buyToken() == _rewardToken, "FluxRevenueDistributor: INVALID_REWARD_TOKEN");
        require(
            IFluxBuybackExecutor(_buybackExecutor).treasury() == IFluxMultiPoolManager(_manager).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(OPERATOR_ROLE, _operator);

        operator = _operator;
        buybackExecutor = _buybackExecutor;
        manager = _manager;
        rewardToken = _rewardToken;
        buybackBps = _buybackBps;
        burnBps = _burnBps;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newOperator != operator, "FluxRevenueDistributor: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function setBuybackExecutor(address newBuybackExecutor) external onlyOwner {
        require(newBuybackExecutor != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newBuybackExecutor != buybackExecutor, "FluxRevenueDistributor: SAME_EXECUTOR");
        require(
            IFluxBuybackExecutor(newBuybackExecutor).buyToken() == rewardToken,
            "FluxRevenueDistributor: INVALID_REWARD_TOKEN"
        );
        require(
            IFluxBuybackExecutor(newBuybackExecutor).treasury() == IFluxMultiPoolManager(manager).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );
        emit BuybackExecutorUpdated(buybackExecutor, newBuybackExecutor);
        buybackExecutor = newBuybackExecutor;
    }

    function setManager(address newManager) external onlyOwner {
        require(newManager != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(newManager != manager, "FluxRevenueDistributor: SAME_MANAGER");
        require(IFluxMultiPoolManager(newManager).rewardToken() == rewardToken, "FluxRevenueDistributor: INVALID_REWARD_TOKEN");
        require(
            IFluxMultiPoolManager(newManager).treasury() == IFluxBuybackExecutor(buybackExecutor).treasury(),
            "FluxRevenueDistributor: TREASURY_MISMATCH"
        );
        emit ManagerUpdated(manager, newManager);
        manager = newManager;
    }

    function setRevenueConfiguration(uint256 newBuybackBps, uint256 newBurnBps) external onlyOwner {
        require(newBuybackBps > 0 && newBuybackBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");
        require(newBurnBps <= BPS_BASE, "FluxRevenueDistributor: INVALID_BPS");

        emit RevenueConfigurationUpdated(buybackBps, newBuybackBps, burnBps, newBurnBps);
        buybackBps = newBuybackBps;
        burnBps = newBurnBps;
    }

    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxRevenueDistributor: FORBIDDEN");
        require(!paused, "FluxRevenueDistributor: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxRevenueDistributor: FORBIDDEN");
        require(paused, "FluxRevenueDistributor: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    function executeBuybackAndDistribute(
        address spendToken,
        uint256 revenueAmount,
        uint256 amountOutMin,
        address[] calldata path,
        uint256 deadline
    ) external onlyOperatorOrOwner whenNotPaused returns (uint256 amountOut) {
        require(spendToken != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(revenueAmount > 0, "FluxRevenueDistributor: ZERO_AMOUNT");
        require(path.length >= 2, "FluxRevenueDistributor: INVALID_PATH");
        require(path[0] == spendToken, "FluxRevenueDistributor: INVALID_PATH");
        require(path[path.length - 1] == rewardToken, "FluxRevenueDistributor: INVALID_PATH");

        address treasury = _requireTreasuryMatch();

        uint256 buybackAmountIn = (revenueAmount * buybackBps) / BPS_BASE;
        require(buybackAmountIn > 0, "FluxRevenueDistributor: BUYBACK_TOO_SMALL");

        amountOut = IFluxBuybackExecutor(buybackExecutor).executeBuyback(
            spendToken,
            buybackAmountIn,
            amountOutMin,
            path,
            address(0),
            deadline
        );

        uint256 burnedAmount = (amountOut * burnBps) / BPS_BASE;
        if (burnedAmount > 0) {
            IFluxSwapTreasury(treasury).burnApprovedToken(rewardToken, burnedAmount);
        }

        uint256 distributedAmount = amountOut - burnedAmount;
        if (distributedAmount > 0) {
            IFluxMultiPoolManager(manager).distributeRewards(distributedAmount);
        }

        emit RevenueBuybackAndDistributionExecuted(
            spendToken,
            revenueAmount,
            buybackAmountIn,
            amountOut,
            burnedAmount,
            distributedAmount,
            msg.sender
        );
    }

    function distributeTreasuryRewards(uint256 amount) external onlyOperatorOrOwner whenNotPaused {
        require(amount > 0, "FluxRevenueDistributor: ZERO_AMOUNT");
        _requireTreasuryMatch();
        IFluxMultiPoolManager(manager).distributeRewards(amount);
        emit TreasuryRewardsDistributed(amount, msg.sender);
    }

    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        require(to != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxRevenueDistributor: ZERO_ADDRESS");

        address previousOwner = owner();
        super.transferOwnership(newOwner);

        if (newOwner != previousOwner) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
            _grantRole(PAUSER_ROLE, newOwner);
            _revokeRole(PAUSER_ROLE, previousOwner);
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);

            if (hasRole(OPERATOR_ROLE, previousOwner)) {
                _revokeRole(OPERATOR_ROLE, previousOwner);
            }
            if (operator == previousOwner) {
                emit OperatorUpdated(previousOwner, address(0));
                operator = address(0);
            }
        }
    }

    function grantRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxRevenueDistributor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.renounceRole(role, callerConfirmation);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireTreasuryMatch() private view returns (address treasury) {
        treasury = IFluxMultiPoolManager(manager).treasury();
        require(IFluxBuybackExecutor(buybackExecutor).treasury() == treasury, "FluxRevenueDistributor: TREASURY_MISMATCH");
    }
}
