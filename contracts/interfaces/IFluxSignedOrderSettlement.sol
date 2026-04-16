// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFluxSignedOrderSettlement {
    struct SignedOrder {
        address maker;
        address inputToken;
        address outputToken;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 triggerPriceX18;
        uint256 expiry;
        uint256 nonce;
        address recipient;
    }

    event OrderExecuted(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed executor,
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );
    event NonceInvalidated(address indexed maker, uint256 nonce);
    event ExecutorPolicyUpdated(bool restricted, address indexed executor);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    function router() external view returns (address);
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function paused() external view returns (bool);
    function restrictedExecutor() external view returns (address);
    function onlyRestrictedExecutor() external view returns (bool);
    function orderExecuted(bytes32 orderHash) external view returns (bool);
    function invalidatedNonce(address maker, uint256 nonce) external view returns (bool);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function hashOrder(SignedOrder calldata order) external view returns (bytes32);

    function executeOrder(
        SignedOrder calldata order,
        bytes calldata signature,
        uint256 deadline
    ) external returns (uint256 amountOut);

    function invalidateNoncesBySig(
        address maker,
        uint256[] calldata nonces,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function canExecuteOrder(SignedOrder calldata order) external view returns (bool executable, string memory reason);
    function getOrderQuote(SignedOrder calldata order) external view returns (uint256 amountOut);

    function setRestrictedExecutor(address executor) external;
    function setExecutorRestriction(bool restricted) external;
    function pause() external;
    function unpause() external;
}
