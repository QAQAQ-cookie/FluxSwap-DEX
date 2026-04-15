// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/IFluxSignedOrderSettlement.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapRouter.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux Signed Order Settlement
 * @notice 支持链下签名订单、链上最小状态验证与 AMM 结算的限价单执行合约。
 * @dev
 * 1. Maker 在链下签名订单，由链下 watcher / executor 判断是否到达触发条件。
 * 2. 链上仅校验签名、nonce、过期时间、触发价格和最小成交量，不维护完整订单簿。
 * 3. 条件满足后，合约通过 Router 走真实 AMM 路径完成 ERC20 -> ERC20 或 ERC20 -> ETH 结算。
 * 4. 合约保留的链上状态仅包括订单是否已成交、nonce 是否失效、以及批量取消的最小有效 nonce。
 */
contract FluxSignedOrderSettlement is IFluxSignedOrderSettlement, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // EIP-712 订单结构体类型哈希。
    bytes32 private constant ORDER_TYPEHASH = keccak256(
        "SignedOrder(address maker,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 triggerPriceX18,uint256 expiry,uint256 nonce,address recipient)"
    );
    // EIP-712 域分隔符的类型哈希。
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    // 域分隔符中的 name 哈希。
    bytes32 private constant NAME_HASH = keccak256("Flux Signed Order Settlement");
    // 域分隔符中的 version 哈希。
    bytes32 private constant VERSION_HASH = keccak256("1");
    // 统一的价格精度，使用 1e18 表示 X18 定点数价格。
    uint256 private constant PRICE_SCALE = 1e18;

    // 承担真实结算动作的 Router。
    address public immutable override router;
    // 从 Router 派生出的 Factory，用于检查交易对是否存在。
    address public immutable override factory;
    // 从 Router 派生出的 WETH 地址，用于 Token -> ETH 路径转换。
    address public immutable override WETH;
    // 当前合约的 EIP-712 域分隔符。
    bytes32 public immutable override DOMAIN_SEPARATOR;

    // 全局暂停开关，暂停后任何订单都不可执行。
    bool public override paused;
    // 受限执行模式下允许执行订单的唯一执行器。
    address public override restrictedExecutor;
    // 是否启用受限执行器模式。
    bool public override onlyRestrictedExecutor;

    // 订单哈希是否已成交，防止同一订单被重复执行。
    mapping(bytes32 => bool) public override orderExecuted;
    // 记录 maker 的单个 nonce 是否已被执行或显式作废。
    mapping(address => mapping(uint256 => bool)) public override invalidatedNonce;
    // 记录 maker 当前最小有效 nonce，用于批量取消旧订单。
    mapping(address => uint256) public override minValidNonce;

    /**
     * @notice 仅允许在合约未暂停时继续执行。
     */
    modifier whenNotPaused() {
        require(!paused, "FluxSignedOrderSettlement: PAUSED");
        _;
    }

    /**
     * @notice 初始化签名订单结算合约，并绑定 Router / Factory / WETH / EIP-712 域信息。
     * @param router_ 用于后续真实 AMM 结算的 Router 地址。
     */
    constructor(address router_) Ownable(msg.sender) {
        require(router_ != address(0), "FluxSignedOrderSettlement: ZERO_ROUTER");
        router = router_;
        factory = IFluxSwapRouter(router_).factory();
        WETH = IFluxSwapRouter(router_).WETH();
        require(factory != address(0), "FluxSignedOrderSettlement: ZERO_FACTORY");
        require(WETH != address(0), "FluxSignedOrderSettlement: ZERO_WETH");

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 该哈希仅包含订单结构体字段本身，最终签名摘要会再与 DOMAIN_SEPARATOR 组合。
     */
    function hashOrder(SignedOrder calldata order) public pure override returns (bytes32) {
        return keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                order.maker,
                order.inputToken,
                order.outputToken,
                order.amountIn,
                order.minAmountOut,
                order.triggerPriceX18,
                order.expiry,
                order.nonce,
                order.recipient
            )
        );
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev
     * 执行流程为：
     * 1. 校验执行器权限、订单基本参数和执行 deadline。
     * 2. 校验订单未成交、nonce 未失效、签名有效且当前价格已满足触发条件。
     * 3. 从 maker 拉取输入资产到本合约，并授权 Router 做后续兑换。
     * 4. 通过真实 AMM 路径完成结算，同时写入最小链上状态。
     */
    function executeOrder(
        SignedOrder calldata order,
        bytes calldata signature,
        uint256 deadline
    ) external override nonReentrant whenNotPaused returns (uint256 amountOut) {
        _validateExecutor(msg.sender);
        _validateOrder(order);
        require(deadline >= block.timestamp, "FluxSignedOrderSettlement: EXPIRED");

        bytes32 orderHash = hashOrder(order);
        require(!orderExecuted[orderHash], "FluxSignedOrderSettlement: ORDER_ALREADY_EXECUTED");
        require(!_isNonceUnavailable(order.maker, order.nonce), "FluxSignedOrderSettlement: NONCE_INVALIDATED");
        _verifySignature(orderHash, order.maker, signature);

        amountOut = _getAmountOut(order.inputToken, order.outputToken, order.amountIn);
        require(amountOut >= order.minAmountOut, "FluxSignedOrderSettlement: INSUFFICIENT_OUTPUT");
        require(_meetsTrigger(order.amountIn, amountOut, order.triggerPriceX18), "FluxSignedOrderSettlement: PRICE_NOT_REACHED");

        orderExecuted[orderHash] = true;
        invalidatedNonce[order.maker][order.nonce] = true;

        TransferHelper.safeTransferFrom(order.inputToken, order.maker, address(this), order.amountIn);
        _approveIfNeeded(order.inputToken, router, order.amountIn);

        address[] memory path = _buildPath(order.inputToken, order.outputToken);
        if (order.outputToken == address(0)) {
            IFluxSwapRouter(router).swapExactTokensForETH(
                order.amountIn,
                order.minAmountOut,
                path,
                order.recipient,
                deadline
            );
        } else {
            IFluxSwapRouter(router).swapExactTokensForTokens(
                order.amountIn,
                order.minAmountOut,
                path,
                order.recipient,
                deadline
            );
        }

        emit OrderExecuted(
            orderHash,
            order.maker,
            msg.sender,
            order.inputToken,
            order.outputToken,
            order.amountIn,
            amountOut,
            order.recipient
        );
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 取消的是某一笔具体订单，对应 nonce 也会同步作废。
     */
    function cancelOrder(SignedOrder calldata order) external override {
        _cancelOrder(order, msg.sender);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev
     * 该接口适合批量撤销一组离散订单。
     * 若数组中任意一笔订单不满足 maker、成交状态或 nonce 状态校验，整笔交易会回滚。
     */
    function batchCancelOrders(SignedOrder[] calldata orders) external override {
        uint256 length = orders.length;
        require(length > 0, "FluxSignedOrderSettlement: EMPTY_BATCH");

        for (uint256 i = 0; i < length; i++) {
            _cancelOrder(orders[i], msg.sender);
        }
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 用于作废单个 nonce，而不要求链上提供完整订单内容。
     */
    function invalidateNonce(uint256 nonce) external override {
        require(!_isNonceUnavailable(msg.sender, nonce), "FluxSignedOrderSettlement: NONCE_INVALIDATED");
        invalidatedNonce[msg.sender][nonce] = true;
        emit NonceInvalidated(msg.sender, nonce);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 将 `minValidNonce` 向前推进，用于批量取消一段旧订单区间。
     */
    function cancelUpTo(uint256 newMinValidNonce) external override {
        uint256 currentMinValidNonce = minValidNonce[msg.sender];
        require(newMinValidNonce > currentMinValidNonce, "FluxSignedOrderSettlement: NONCE_TOO_LOW");
        minValidNonce[msg.sender] = newMinValidNonce;
        emit MinValidNonceUpdated(msg.sender, currentMinValidNonce, newMinValidNonce);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev
     * 该函数只返回“当前链上视角下订单是否可执行”，不会校验签名本身，
     * 适合给前端、watcher 或监控程序做 readiness 判断。
     */
    function canExecuteOrder(SignedOrder calldata order)
        external
        view
        override
        returns (bool executable, string memory reason)
    {
        if (paused) {
            return (false, "PAUSED");
        }
        if (onlyRestrictedExecutor && restrictedExecutor == address(0)) {
            return (false, "EXECUTOR_NOT_SET");
        }
        if (order.maker == address(0)) {
            return (false, "ZERO_MAKER");
        }
        if (order.inputToken == address(0)) {
            return (false, "ZERO_INPUT");
        }
        if (order.inputToken == order.outputToken) {
            return (false, "IDENTICAL_TOKENS");
        }
        if (order.amountIn == 0) {
            return (false, "ZERO_AMOUNT_IN");
        }
        if (order.minAmountOut == 0) {
            return (false, "ZERO_MIN_AMOUNT_OUT");
        }
        if (order.triggerPriceX18 == 0) {
            return (false, "ZERO_TRIGGER_PRICE");
        }
        if (order.recipient == address(0)) {
            return (false, "ZERO_RECIPIENT");
        }
        if (order.expiry < block.timestamp) {
            return (false, "ORDER_EXPIRED");
        }

        bytes32 orderHash = hashOrder(order);
        if (orderExecuted[orderHash]) {
            return (false, "ORDER_ALREADY_EXECUTED");
        }
        if (_isNonceUnavailable(order.maker, order.nonce)) {
            return (false, "NONCE_INVALIDATED");
        }
        if (!_pairExists(order.inputToken, order.outputToken)) {
            return (false, "PAIR_NOT_FOUND");
        }

        uint256 amountOut = _getAmountOut(order.inputToken, order.outputToken, order.amountIn);
        if (amountOut < order.minAmountOut) {
            return (false, "INSUFFICIENT_OUTPUT");
        }
        if (!_meetsTrigger(order.amountIn, amountOut, order.triggerPriceX18)) {
            return (false, "PRICE_NOT_REACHED");
        }

        return (true, "OK");
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 仅做报价相关的最小输入校验，不检查签名、nonce 或过期状态。
     */
    function getOrderQuote(SignedOrder calldata order) external view override returns (uint256 amountOut) {
        _validateQuoteOrder(order);
        amountOut = _getAmountOut(order.inputToken, order.outputToken, order.amountIn);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 传入零地址表示清空当前受限执行器，但若此时已启用限制模式则后续执行会被阻断。
     */
    function setRestrictedExecutor(address executor) external override onlyOwner {
        restrictedExecutor = executor;
        emit ExecutorPolicyUpdated(onlyRestrictedExecutor, executor);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 开启限制模式前，必须先配置非零的受限执行器地址。
     */
    function setExecutorRestriction(bool restricted) external override onlyOwner {
        if (restricted) {
            require(restrictedExecutor != address(0), "FluxSignedOrderSettlement: ZERO_EXECUTOR");
        }
        onlyRestrictedExecutor = restricted;
        emit ExecutorPolicyUpdated(restricted, restrictedExecutor);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 暂停后新的订单执行会被阻断，但已存在的取消和 nonce 管理数据不会回滚。
     */
    function pause() external override onlyOwner {
        require(!paused, "FluxSignedOrderSettlement: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 恢复后订单可继续按当前市场状态重新判断是否达到触发条件。
     */
    function unpause() external override onlyOwner {
        require(paused, "FluxSignedOrderSettlement: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 校验当前调用者是否满足执行器策略。
     * @param executor 当前实际发起执行的地址。
     */
    function _validateExecutor(address executor) private view {
        if (onlyRestrictedExecutor) {
            require(executor == restrictedExecutor, "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN");
        }
    }

    /**
     * @notice 执行单笔订单的撤销逻辑，供单撤与批量撤单复用。
     * @param order 待撤销的订单。
     * @param caller 实际发起撤销的地址，必须与 maker 一致。
     */
    function _cancelOrder(SignedOrder calldata order, address caller) private {
        require(order.maker == caller, "FluxSignedOrderSettlement: NOT_MAKER");

        bytes32 orderHash = hashOrder(order);
        require(!orderExecuted[orderHash], "FluxSignedOrderSettlement: ORDER_ALREADY_EXECUTED");
        require(!_isNonceUnavailable(caller, order.nonce), "FluxSignedOrderSettlement: NONCE_INVALIDATED");

        invalidatedNonce[caller][order.nonce] = true;
        emit OrderCancelled(orderHash, caller, order.nonce);
    }

    /**
     * @notice 校验订单执行前必须满足的基础条件。
     * @param order 待执行的签名订单。
     */
    function _validateOrder(SignedOrder calldata order) private view {
        require(order.maker != address(0), "FluxSignedOrderSettlement: ZERO_MAKER");
        require(order.inputToken != address(0), "FluxSignedOrderSettlement: ZERO_INPUT");
        require(order.inputToken != order.outputToken, "FluxSignedOrderSettlement: IDENTICAL_TOKENS");
        require(order.amountIn > 0, "FluxSignedOrderSettlement: ZERO_AMOUNT_IN");
        require(order.minAmountOut > 0, "FluxSignedOrderSettlement: ZERO_MIN_AMOUNT_OUT");
        require(order.triggerPriceX18 > 0, "FluxSignedOrderSettlement: ZERO_TRIGGER_PRICE");
        require(order.expiry >= block.timestamp, "FluxSignedOrderSettlement: ORDER_EXPIRED");
        require(order.recipient != address(0), "FluxSignedOrderSettlement: ZERO_RECIPIENT");
        require(_pairExists(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: PAIR_NOT_FOUND");
    }

    /**
     * @notice 校验仅用于链上报价时的最小前置条件。
     * @param order 待报价的订单参数。
     */
    function _validateQuoteOrder(SignedOrder calldata order) private view {
        require(order.inputToken != address(0), "FluxSignedOrderSettlement: ZERO_INPUT");
        require(order.inputToken != order.outputToken, "FluxSignedOrderSettlement: IDENTICAL_TOKENS");
        require(order.amountIn > 0, "FluxSignedOrderSettlement: ZERO_AMOUNT_IN");
        require(_pairExists(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: PAIR_NOT_FOUND");
    }

    /**
     * @notice 校验订单签名是否由 maker 基于当前域分隔符签出。
     * @param orderHash 订单结构体哈希。
     * @param maker 订单 maker 地址。
     * @param signature maker 的 EIP-712 签名。
     */
    function _verifySignature(bytes32 orderHash, address maker, bytes calldata signature) private view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash));
        address recoveredSigner = digest.recover(signature);
        require(recoveredSigner == maker, "FluxSignedOrderSettlement: INVALID_SIGNATURE");
    }

    /**
     * @notice 检查输入资产与输出资产对应的 AMM 交易对是否存在。
     * @param inputToken 订单支付资产。
     * @param outputToken 订单接收资产，零地址表示原生 ETH。
     * @return 是否存在可用的两跳以内直接交易对。
     */
    function _pairExists(address inputToken, address outputToken) private view returns (bool) {
        (address tokenIn, address tokenOut) = _normalizePairTokens(inputToken, outputToken);
        return IFluxSwapFactory(factory).getPair(tokenIn, tokenOut) != address(0);
    }

    /**
     * @notice 将零地址形式的 ETH 输出转换为 WETH，用于 Factory / Router 内部查询。
     * @param inputToken 订单支付资产。
     * @param outputToken 订单接收资产，零地址表示原生 ETH。
     * @return tokenIn 规范化后的输入资产。
     * @return tokenOut 规范化后的输出资产。
     */
    function _normalizePairTokens(address inputToken, address outputToken) private view returns (address, address) {
        address tokenIn = inputToken;
        address tokenOut = outputToken == address(0) ? WETH : outputToken;
        return (tokenIn, tokenOut);
    }

    /**
     * @notice 构建 Router 所需的两跳结算路径。
     * @param inputToken 订单支付资产。
     * @param outputToken 订单接收资产，零地址表示原生 ETH。
     * @return path Router 使用的兑换路径。
     */
    function _buildPath(address inputToken, address outputToken) private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = inputToken;
        path[1] = outputToken == address(0) ? WETH : outputToken;
    }

    /**
     * @notice 读取当前 AMM 路径下的最新报价结果。
     * @param inputToken 订单支付资产。
     * @param outputToken 订单接收资产，零地址表示原生 ETH。
     * @param amountIn 订单输入数量。
     * @return 当前 Router 报价得到的预期输出数量。
     */
    function _getAmountOut(address inputToken, address outputToken, uint256 amountIn) private view returns (uint256) {
        address[] memory path = _buildPath(inputToken, outputToken);
        uint256[] memory amounts = IFluxSwapRouter(router).getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    }

    /**
     * @notice 判断当前报价是否达到订单设定的触发价格。
     * @param amountIn 订单输入数量。
     * @param amountOut 当前最新报价输出数量。
     * @param triggerPriceX18 订单要求的最小触发价格，使用 X18 精度。
     * @return 是否已达到或超过触发价格。
     */
    function _meetsTrigger(uint256 amountIn, uint256 amountOut, uint256 triggerPriceX18) private pure returns (bool) {
        uint256 quotedPriceX18 = (amountOut * PRICE_SCALE) / amountIn;
        return quotedPriceX18 >= triggerPriceX18;
    }

    /**
     * @notice 判断某个 nonce 是否已不可再使用。
     * @param maker 订单 maker。
     * @param nonce 待检查的 nonce。
     * @return 若 nonce 已低于最小有效值或已单独作废，则返回 true。
     */
    function _isNonceUnavailable(address maker, uint256 nonce) private view returns (bool) {
        return nonce < minValidNonce[maker] || invalidatedNonce[maker][nonce];
    }

    /**
     * @notice 在当前授权不足时为 Router 重新设置可用授权额度。
     * @param token 需要授权的输入资产。
     * @param spender 被授权的 Router 地址。
     * @param amount 本次执行所需的最小授权量。
     */
    function _approveIfNeeded(address token, address spender, uint256 amount) private {
        uint256 currentAllowance = IERC20(token).allowance(address(this), spender);
        if (currentAllowance >= amount) {
            return;
        }

        if (currentAllowance > 0) {
            require(IERC20(token).approve(spender, 0), "FluxSignedOrderSettlement: APPROVE_RESET_FAILED");
        }
        require(IERC20(token).approve(spender, type(uint256).max), "FluxSignedOrderSettlement: APPROVE_FAILED");
    }
}
