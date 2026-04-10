// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFluxSwapTreasury.sol";
import "../interfaces/IFluxSwapRouter.sol";
import "../libraries/TransferHelper.sol";

contract FluxBuybackExecutor is Ownable, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    address public immutable router;
    address public immutable buyToken;
    address public treasury;
    address public operator;
    address public defaultRecipient;
    bool public paused;

    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event DefaultRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event BuybackExecuted(
        address indexed spendToken,
        uint256 amountIn,
        uint256 amountOut,
        address indexed recipient,
        address indexed executor
    );
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    error InvalidRecipient(address recipient);

    modifier onlyOperatorOrOwner() {
        require(hasRole(OPERATOR_ROLE, msg.sender) || msg.sender == owner(), "FluxBuybackExecutor: FORBIDDEN");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "FluxBuybackExecutor: PAUSED");
        _;
    }

    constructor(
        address _owner,
        address _treasury,
        address _operator,
        address _router,
        address _buyToken,
        address _defaultRecipient
    ) Ownable(_owner) {
        require(_treasury != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_operator != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_router != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_buyToken != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_defaultRecipient != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(_defaultRecipient == _treasury, "FluxBuybackExecutor: INVALID_RECIPIENT");

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(PAUSER_ROLE, _owner);
        _grantRole(OPERATOR_ROLE, _operator);

        treasury = _treasury;
        operator = _operator;
        router = _router;
        buyToken = _buyToken;
        defaultRecipient = _defaultRecipient;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        emit TreasuryUpdated(treasury, newTreasury);
        emit DefaultRecipientUpdated(defaultRecipient, newTreasury);
        treasury = newTreasury;
        defaultRecipient = newTreasury;
    }

    function setOperator(address newOperator) external onlyOwner {
        require(newOperator != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(newOperator != operator, "FluxBuybackExecutor: SAME_OPERATOR");
        _grantRole(OPERATOR_ROLE, newOperator);
        _revokeRole(OPERATOR_ROLE, operator);
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function setDefaultRecipient(address newDefaultRecipient) external onlyOwner {
        require(newDefaultRecipient != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(newDefaultRecipient == treasury, "FluxBuybackExecutor: INVALID_RECIPIENT");
        emit DefaultRecipientUpdated(defaultRecipient, newDefaultRecipient);
        defaultRecipient = newDefaultRecipient;
    }

    function pause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxBuybackExecutor: FORBIDDEN");
        require(!paused, "FluxBuybackExecutor: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(hasRole(PAUSER_ROLE, msg.sender), "FluxBuybackExecutor: FORBIDDEN");
        require(paused, "FluxBuybackExecutor: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }


    function executeBuyback(
        address spendToken,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external onlyOperatorOrOwner whenNotPaused returns (uint256 amountOut) {
        require(spendToken != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(amountIn > 0, "FluxBuybackExecutor: ZERO_AMOUNT");
        require(path.length >= 2, "FluxBuybackExecutor: INVALID_PATH");
        require(path[0] == spendToken, "FluxBuybackExecutor: INVALID_PATH");
        require(path[path.length - 1] == buyToken, "FluxBuybackExecutor: INVALID_PATH");

        address finalRecipient = recipient == address(0) ? defaultRecipient : recipient;
        if (finalRecipient != treasury) {
            revert InvalidRecipient(finalRecipient);
        }

        _requireSourceNotPaused(treasury, "FluxBuybackExecutor: TREASURY_PAUSED");
        IFluxSwapTreasury(treasury).pullApprovedToken(spendToken, amountIn);
        _safeApprove(spendToken, router, 0);
        _safeApprove(spendToken, router, amountIn);

        uint256[] memory amounts = IFluxSwapRouter(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            finalRecipient,
            deadline
        );

        _safeApprove(spendToken, router, 0);
        amountOut = amounts[amounts.length - 1];

        emit BuybackExecuted(spendToken, amountIn, amountOut, finalRecipient, msg.sender);
    }

    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        require(to != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");
        TransferHelper.safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "FluxBuybackExecutor: ZERO_ADDRESS");

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
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override onlyRole(getRoleAdmin(role)) {
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.revokeRole(role, account);
    }

    function renounceRole(bytes32 role, address callerConfirmation) public override {
        require(role != OPERATOR_ROLE, "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR");
        super.renounceRole(role, callerConfirmation);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _safeApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "FluxBuybackExecutor: APPROVE_FAILED"
        );
    }

    function _requireSourceNotPaused(address source, string memory errorMessage) private view {
        (bool success, bytes memory data) = source.staticcall(abi.encodeWithSignature("paused()"));
        if (success && data.length >= 32) {
            require(!abi.decode(data, (bool)), errorMessage);
        }
    }


}
