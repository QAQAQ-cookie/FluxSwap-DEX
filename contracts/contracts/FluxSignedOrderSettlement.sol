// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math as OZMath} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../interfaces/IERC20.sol";
import "../interfaces/IFluxSignedOrderSettlement.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapRouter.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux Signed Order Settlement
 * @notice 提供基于 EIP-712 签名订单的链上结算入口，并通过 Router 完成真实 AMM 兑换。
 * @dev
 * 合约只维护最小链上状态：
 * 1. 订单是否已执行。
 * 2. nonce 是否已失效。
 * 3. 执行器是否受限、合约是否暂停。
 *
 * 订单主体、历史与调度逻辑由链下系统维护；
 * 链上仅在执行时校验签名、价格、到期时间和 nonce 可用性。
 *
 * 代币语义约定：
 * 1. `inputToken` 必须是受支持的标准 ERC20，卖出原生币时需要先在链下包装成 WETH 再下单。
 * 2. `outputToken == address(0)` 表示最终输出原生币，链上会先把资产结算到当前合约，再按“用户净收款 + 执行费”语义分配 ETH。
 */
contract FluxSignedOrderSettlement is IFluxSignedOrderSettlement, Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // EIP-712 订单结构体类型哈希。
    bytes32 private constant ORDER_TYPEHASH = keccak256(
        "SignedOrder(address maker,address inputToken,address outputToken,uint256 amountIn,uint256 minAmountOut,uint256 maxExecutorRewardBps,uint256 triggerPriceX18,uint256 expiry,uint256 nonce,address recipient)"
    );
    // EIP-712 批量 nonce 失效结构体类型哈希。
    bytes32 private constant INVALIDATE_NONCES_TYPEHASH =
        keccak256("InvalidateNonces(address maker,bytes32 noncesHash,uint256 deadline)");
    // EIP-712 域分隔符类型哈希。
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    // 域分隔符 name 字段哈希。
    bytes32 private constant NAME_HASH = keccak256("Flux Signed Order Settlement");
    // 域分隔符 version 字段哈希。
    bytes32 private constant VERSION_HASH = keccak256("1");
    // 价格比较统一使用 1e18 精度。
    uint256 private constant PRICE_SCALE = 1e18;

    // Router 负责真实结算。
    address public immutable override router;
    // Factory 用于检查交易对是否存在。
    address public immutable override factory;
    // WETH 用于 ETH 路径归一化。
    address public immutable override WETH;
    // 当前合约的 EIP-712 域分隔符。
    bytes32 public immutable override DOMAIN_SEPARATOR;

    // 暂停后拒绝执行订单。
    bool public override paused;
    // 受限模式下唯一允许的执行器。
    address public override restrictedExecutor;
    // 是否启用受限执行器策略。
    bool public override onlyRestrictedExecutor;

    // 记录订单哈希是否已成交。
    mapping(bytes32 => bool) public override orderExecuted;
    // 记录 maker 的 nonce 是否不可再次使用。
    mapping(address => mapping(uint256 => bool)) public override invalidatedNonce;
    /**
     * @notice 仅允许在合约未暂停时继续执行。
     */
    modifier whenNotPaused() {
        require(!paused, "FluxSignedOrderSettlement: PAUSED");
        _;
    }

    /**
     * @notice 初始化签名订单结算合约，并绑定 Router、Factory、WETH 与 EIP-712 域信息。
     * @param router_ 用于真实 AMM 结算的 Router 地址。
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
     * @dev 返回订单结构体本身的哈希，最终签名摘要会再与域分隔符组合。
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
                order.maxExecutorRewardBps,
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
     * 执行流程：
     * 1. 校验执行器策略、订单基础字段和截止时间。
     * 2. 校验订单未成交、nonce 未失效、签名有效且价格已满足触发条件。
     * 3. 从 maker 拉取输入资产，授权 Router，并通过真实 AMM 路径完成结算。
     * 4. 输出资产先回到 settlement，再按“用户净收款 + 执行费”分配。
     * 5. 成功后写入最小链上状态，防止重复执行。
     */
    function executeOrder(
        SignedOrder calldata order,
        bytes calldata signature,
        uint256 deadline,
        uint256 executorReward
    ) external override nonReentrant whenNotPaused returns (uint256 amountOut) {
        _validateExecutor(msg.sender);
        _validateOrder(order);
        require(deadline >= block.timestamp, "FluxSignedOrderSettlement: EXPIRED");

        bytes32 orderHash = hashOrder(order);
        require(!orderExecuted[orderHash], "FluxSignedOrderSettlement: ORDER_ALREADY_EXECUTED");
        require(!_isNonceUnavailable(order.maker, order.nonce), "FluxSignedOrderSettlement: NONCE_INVALIDATED");
        _verifyOrderSignature(orderHash, order.maker, signature);

        amountOut = _getAmountOut(order.inputToken, order.outputToken, order.amountIn);
        require(amountOut >= order.minAmountOut, "FluxSignedOrderSettlement: INSUFFICIENT_OUTPUT");
        require(
            _meetsTrigger(order.inputToken, order.outputToken, order.amountIn, amountOut, order.triggerPriceX18),
            "FluxSignedOrderSettlement: PRICE_NOT_REACHED"
        );

        uint256 surplus = amountOut - order.minAmountOut;
        uint256 maxAllowedReward = (surplus * order.maxExecutorRewardBps) / 10_000;
        require(executorReward <= maxAllowedReward, "FluxSignedOrderSettlement: EXECUTOR_REWARD_TOO_HIGH");

        orderExecuted[orderHash] = true;
        invalidatedNonce[order.maker][order.nonce] = true;

        address settlementInputToken = _normalizeInputToken(order.inputToken);
        require(
            IERC20(settlementInputToken).balanceOf(order.maker) >= order.amountIn,
            "FluxSignedOrderSettlement: INSUFFICIENT_BALANCE"
        );
        require(
            IERC20(settlementInputToken).allowance(order.maker, address(this)) >= order.amountIn,
            "FluxSignedOrderSettlement: INSUFFICIENT_ALLOWANCE"
        );
        TransferHelper.safeTransferFrom(settlementInputToken, order.maker, address(this), order.amountIn);
        _approveIfNeeded(settlementInputToken, router, order.amountIn);

        _settleAndDistribute(order, deadline, amountOut, executorReward, msg.sender);
        _emitOrderExecuted(orderHash, order, msg.sender, amountOut, executorReward);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev
     * 该接口允许任意调用者携带 maker 签名，批量使一组 nonce 失效。
     * 适合链下订单系统在撤单、批量撤单或订单过期清理时统一回写链上状态。
     */
    function invalidateNoncesBySig(
        address maker,
        uint256[] calldata nonces,
        uint256 deadline,
        bytes calldata signature
    ) external override {
        require(maker != address(0), "FluxSignedOrderSettlement: ZERO_MAKER");
        require(deadline >= block.timestamp, "FluxSignedOrderSettlement: EXPIRED");

        uint256 length = nonces.length;
        require(length > 0, "FluxSignedOrderSettlement: EMPTY_NONCES");

        bytes32 noncesHash = keccak256(abi.encodePacked(nonces));
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(INVALIDATE_NONCES_TYPEHASH, maker, noncesHash, deadline))
            )
        );
        address recoveredSigner = digest.recover(signature);
        require(recoveredSigner == maker, "FluxSignedOrderSettlement: INVALID_SIGNATURE");

        for (uint256 i = 0; i < length; i++) {
            uint256 nonce = nonces[i];
            require(!_isNonceUnavailable(maker, nonce), "FluxSignedOrderSettlement: NONCE_INVALIDATED");
            invalidatedNonce[maker][nonce] = true;
            emit NonceInvalidated(maker, nonce);
        }
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 该接口只反映当前链上视角下订单能否执行，不校验签名本身。
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
            return (false, "INPUT_TOKEN_MUST_BE_ERC20");
        }
        if (_hasIdenticalAssets(order.inputToken, order.outputToken)) {
            return (false, "IDENTICAL_TOKENS");
        }
        if (order.amountIn == 0) {
            return (false, "ZERO_AMOUNT_IN");
        }
        if (order.minAmountOut == 0) {
            return (false, "ZERO_MIN_AMOUNT_OUT");
        }
        if (order.maxExecutorRewardBps > 10_000) {
            return (false, "INVALID_EXECUTOR_REWARD_BPS");
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
        if (!_hasEnoughBalance(order.maker, order.inputToken, order.amountIn)) {
            return (false, "INSUFFICIENT_BALANCE");
        }
        if (!_hasEnoughAllowance(order.maker, order.inputToken, order.amountIn)) {
            return (false, "INSUFFICIENT_ALLOWANCE");
        }

        (bool quoteOk, uint256 amountOut) = _tryGetAmountOut(order.inputToken, order.outputToken, order.amountIn);
        if (!quoteOk) {
            return (false, "INSUFFICIENT_LIQUIDITY");
        }
        if (amountOut < order.minAmountOut) {
            return (false, "INSUFFICIENT_OUTPUT");
        }
        if (!_meetsTrigger(order.inputToken, order.outputToken, order.amountIn, amountOut, order.triggerPriceX18)) {
            return (false, "PRICE_NOT_REACHED");
        }

        return (true, "OK");
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 报价只校验最小必要字段，不检查签名、nonce 与过期状态。
     */
    function getOrderQuote(SignedOrder calldata order) external view override returns (uint256 amountOut) {
        _validateQuoteOrder(order);
        amountOut = _getAmountOut(order.inputToken, order.outputToken, order.amountIn);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 传入零地址表示清空当前受限执行器。
     */
    function setRestrictedExecutor(address executor) external override onlyOwner {
        restrictedExecutor = executor;
        emit ExecutorPolicyUpdated(onlyRestrictedExecutor, executor);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 启用受限模式前必须先配置非零执行器地址。
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
     * @dev 暂停后新订单执行会被阻断，但已写入的状态不会回滚。
     */
    function pause() external override onlyOwner {
        require(!paused, "FluxSignedOrderSettlement: PAUSED");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @inheritdoc IFluxSignedOrderSettlement
     * @dev 恢复后订单可继续按当前市场状态重新判断是否可执行。
     */
    function unpause() external override onlyOwner {
        require(paused, "FluxSignedOrderSettlement: NOT_PAUSED");
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice 校验当前调用者是否满足执行器策略。
     * @param executor 当前发起执行的地址。
     */
    function _validateExecutor(address executor) private view {
        if (onlyRestrictedExecutor) {
            require(executor == restrictedExecutor, "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN");
        }
    }

    /**
     * @notice 校验订单执行前必须满足的基础字段约束。
     * @param order 待执行的签名订单。
     */
    function _validateOrder(SignedOrder calldata order) private view {
        require(order.maker != address(0), "FluxSignedOrderSettlement: ZERO_MAKER");
        require(order.inputToken != address(0), "FluxSignedOrderSettlement: INPUT_TOKEN_MUST_BE_ERC20");
        require(!_hasIdenticalAssets(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: IDENTICAL_TOKENS");
        require(order.amountIn > 0, "FluxSignedOrderSettlement: ZERO_AMOUNT_IN");
        require(order.minAmountOut > 0, "FluxSignedOrderSettlement: ZERO_MIN_AMOUNT_OUT");
        require(order.maxExecutorRewardBps <= 10_000, "FluxSignedOrderSettlement: INVALID_EXECUTOR_REWARD_BPS");
        require(order.triggerPriceX18 > 0, "FluxSignedOrderSettlement: ZERO_TRIGGER_PRICE");
        require(order.expiry >= block.timestamp, "FluxSignedOrderSettlement: ORDER_EXPIRED");
        require(order.recipient != address(0), "FluxSignedOrderSettlement: ZERO_RECIPIENT");
        require(_pairExists(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: PAIR_NOT_FOUND");
    }

    /**
     * @notice 校验仅用于报价所需的最小字段约束。
     * @param order 待报价的订单参数。
     */
    function _validateQuoteOrder(SignedOrder calldata order) private view {
        require(order.inputToken != address(0), "FluxSignedOrderSettlement: INPUT_TOKEN_MUST_BE_ERC20");
        require(!_hasIdenticalAssets(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: IDENTICAL_TOKENS");
        require(order.amountIn > 0, "FluxSignedOrderSettlement: ZERO_AMOUNT_IN");
        require(_pairExists(order.inputToken, order.outputToken), "FluxSignedOrderSettlement: PAIR_NOT_FOUND");
    }

    /**
     * @notice 校验订单签名是否由 maker 基于当前域分隔符签出。
     * @param orderHash 订单结构体哈希。
     * @param maker 订单 maker 地址。
     * @param signature maker 的 EIP-712 签名。
     */
    function _verifyOrderSignature(bytes32 orderHash, address maker, bytes calldata signature) private view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash));
        address recoveredSigner = digest.recover(signature);
        require(recoveredSigner == maker, "FluxSignedOrderSettlement: INVALID_SIGNATURE");
    }

    /**
     * @notice 检查订单输入资产与输出资产对应的 AMM 交易对是否存在。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @return 是否存在可用的标准 AMM 交易对。
     */
    function _pairExists(address inputToken, address outputToken) private view returns (bool) {
        (address tokenIn, address tokenOut) = _normalizePairTokens(inputToken, outputToken);
        return IFluxSwapFactory(factory).getPair(tokenIn, tokenOut) != address(0);
    }

    /**
     * @notice 判断订单输入与输出在归一化后是否指向同一底层资产。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @return 若归一化后输入输出资产一致，则返回 true。
     */
    function _hasIdenticalAssets(address inputToken, address outputToken) private view returns (bool) {
        (address tokenIn, address tokenOut) = _normalizePairTokens(inputToken, outputToken);
        return tokenIn == tokenOut;
    }

    /**
     * @notice 将订单输入资产归一化为真正参与结算的 ERC20 地址。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @return tokenIn 结算时实际拉取和授权的 ERC20 地址。
     */
    function _normalizeInputToken(address inputToken) private pure returns (address tokenIn) {
        tokenIn = inputToken;
    }

    /**
     * @notice 将订单输入输出资产归一化为 Router 与 Factory 使用的路径地址。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @return tokenIn 归一化后的输入资产地址。
     * @return tokenOut 归一化后的输出资产地址。
     */
    function _normalizePairTokens(address inputToken, address outputToken) private view returns (address, address) {
        address tokenIn = _normalizeInputToken(inputToken);
        address tokenOut = outputToken == address(0) ? WETH : outputToken;
        return (tokenIn, tokenOut);
    }

    /**
     * @notice 构建 Router 所需的两跳结算路径。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @return path Router 使用的兑换路径。
     */
    function _buildPath(address inputToken, address outputToken) private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = _normalizeInputToken(inputToken);
        path[1] = outputToken == address(0) ? WETH : outputToken;
    }

    /**
     * @notice 读取当前 AMM 路径下的实时报价结果。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @param amountIn 输入数量。
     * @return 当前 Router 估算出的输出数量。
     */
    function _getAmountOut(address inputToken, address outputToken, uint256 amountIn) private view returns (uint256) {
        address[] memory path = _buildPath(inputToken, outputToken);
        uint256[] memory amounts = IFluxSwapRouter(router).getAmountsOut(amountIn, path);
        return amounts[amounts.length - 1];
    }

    /**
     * @notice 尝试读取当前 AMM 路径下的实时报价，避免只读 readiness 检查因无流动性直接回退。
     * @param inputToken 订单支付资产，必须是 ERC20。
     * @param outputToken 订单接收资产，零地址表示最终输出原生 ETH。
     * @param amountIn 输入数量。
     * @return ok 报价是否成功。
     * @return amountOut 报价成功时对应的输出数量，失败时返回 0。
     */
    function _tryGetAmountOut(
        address inputToken,
        address outputToken,
        uint256 amountIn
    ) private view returns (bool ok, uint256 amountOut) {
        try this.getOrderQuote(
            SignedOrder({
                maker: address(1),
                inputToken: inputToken,
                outputToken: outputToken,
                amountIn: amountIn,
                minAmountOut: 1,
                maxExecutorRewardBps: 0,
                triggerPriceX18: 1,
                expiry: type(uint256).max,
                nonce: 0,
                recipient: address(1)
            })
        ) returns (uint256 quotedAmountOut) {
            return (true, quotedAmountOut);
        } catch {
            return (false, 0);
        }
    }

    /**
     * @notice 判断当前报价是否达到订单设定的触发价格。
     * @param amountIn 输入数量。
     * @param amountOut 报价输出数量。
     * @param triggerPriceX18 触发价格，精度为 1e18。
     * @return 是否达到或超过目标价格。
     */
    function _meetsTrigger(
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 triggerPriceX18
    ) private view returns (bool) {
        uint256 quotedPriceX18 = _quotePriceX18(inputToken, outputToken, amountIn, amountOut);
        return quotedPriceX18 >= triggerPriceX18;
    }

    /**
     * @notice 将当前报价归一化到 1e18 精度，便于和签名里的触发价比较。
     * @param inputToken 订单输入代币。
     * @param outputToken 订单输出代币，零地址表示原生币路径。
     * @param amountIn 输入数量。
     * @param amountOut 输出数量。
     * @return quotedPriceX18 归一化后的价格，单位为 1e18。
     */
    function _quotePriceX18(
        address inputToken,
        address outputToken,
        uint256 amountIn,
        uint256 amountOut
    ) private view returns (uint256 quotedPriceX18) {
        uint256 inputScale = _decimalScale(inputToken);
        uint256 outputScale = _decimalScale(outputToken == address(0) ? WETH : outputToken);
        uint256 normalizedAmountOut = OZMath.mulDiv(amountOut, inputScale, outputScale);
        quotedPriceX18 = OZMath.mulDiv(normalizedAmountOut, PRICE_SCALE, amountIn);
    }

    /**
     * @notice 读取代币精度并转换成 10^decimals 的缩放因子。
     * @param token 代币地址。
     * @return scale 对应的 10^decimals 缩放值。
     */
    function _decimalScale(address token) private view returns (uint256 scale) {
        uint256 decimals = IERC20(token).decimals();
        require(decimals <= 77, "FluxSignedOrderSettlement: DECIMALS_TOO_LARGE");
        scale = 10 ** decimals;
    }

    /**
     * @notice 判断某个 nonce 当前是否已不可再使用。
     * @param maker 订单 maker。
     * @param nonce 待检查的 nonce。
     * @return 若 nonce 已执行或已失效，则返回 true。
     */
    function _isNonceUnavailable(address maker, uint256 nonce) private view returns (bool) {
        return invalidatedNonce[maker][nonce];
    }

    /**
     * @notice 检查 maker 当前余额是否足以覆盖本次订单输入数量。
     * @param maker 订单签名者地址。
     * @param inputToken 订单输入资产地址。
     * @param amountIn 本次订单输入数量。
     * @return 若 maker 当前余额充足则返回 true。
     */
    function _hasEnoughBalance(address maker, address inputToken, uint256 amountIn) private view returns (bool) {
        address settlementInputToken = _normalizeInputToken(inputToken);
        return IERC20(settlementInputToken).balanceOf(maker) >= amountIn;
    }

    /**
     * @notice 检查 maker 对 settlement 的授权是否足以覆盖本次订单输入数量。
     * @param maker 订单签名者地址。
     * @param inputToken 订单输入资产地址。
     * @param amountIn 本次订单输入数量。
     * @return 若 maker 当前授权充足则返回 true。
     */
    function _hasEnoughAllowance(address maker, address inputToken, uint256 amountIn) private view returns (bool) {
        address settlementInputToken = _normalizeInputToken(inputToken);
        return IERC20(settlementInputToken).allowance(maker, address(this)) >= amountIn;
    }

    /**
     * @notice 当授权不足时，为 Router 设置足够的代币授权额度。
     * @param token 需要授权的输入资产。
     * @param spender 被授权的 Router 地址。
     * @param amount 本次执行所需的最小授权数量。
     */
    function _approveIfNeeded(address token, address spender, uint256 amount) private {
        uint256 currentAllowance = IERC20(token).allowance(address(this), spender);
        if (currentAllowance >= amount) {
            return;
        }

        if (currentAllowance > 0) {
            _safeApprove(token, spender, 0, "FluxSignedOrderSettlement: APPROVE_RESET_FAILED");
        }
        _safeApprove(token, spender, type(uint256).max, "FluxSignedOrderSettlement: APPROVE_FAILED");
    }

    /**
     * @notice 兼容无返回值 ERC20 的 approve 写法。
     * @param token 待授权的代币地址。
     * @param spender 被授权地址。
     * @param amount 授权额度。
     * @param errorMessage 授权失败时抛出的错误。
     */
    function _safeApprove(address token, address spender, uint256 amount, string memory errorMessage) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), errorMessage);
    }

    /**
     * @notice 通过 Router 完成真实结算，并把成交输出按“用户净收款 + 执行奖励”语义分配。
     * @param order 原始签名订单。
     * @param deadline 本次链上执行截止时间。
     * @param amountOut 当前链上预估的成交总输出。
     * @param executorReward 本次实际分配给执行器的奖励数量。
     * @param executor 本次代理执行的地址。
     */
    function _settleAndDistribute(
        SignedOrder calldata order,
        uint256 deadline,
        uint256 amountOut,
        uint256 executorReward,
        address executor
    ) private {
        address[] memory path = _buildPath(order.inputToken, order.outputToken);
        uint256 requiredSettlementOut = order.minAmountOut + executorReward;
        if (order.outputToken == address(0)) {
            IFluxSwapRouter(router).swapExactTokensForETH(
                order.amountIn,
                requiredSettlementOut,
                path,
                address(this),
                deadline
            );
            _distributeNativeOutput(order.recipient, executor, amountOut, executorReward);
            return;
        }

        IFluxSwapRouter(router).swapExactTokensForTokens(
            order.amountIn,
            requiredSettlementOut,
            path,
            address(this),
            deadline
        );
        _distributeTokenOutput(order.outputToken, order.recipient, executor, amountOut, executorReward);
    }

    /**
     * @notice 统一发出订单执行事件，避免主流程堆叠过多局部变量。
     * @param orderHash 订单哈希。
     * @param order 原始签名订单。
     * @param executor 本次代理执行的地址。
     * @param amountOut 当前链上预估的成交总输出。
     */
    function _emitOrderExecuted(
        bytes32 orderHash,
        SignedOrder calldata order,
        address executor,
        uint256 amountOut,
        uint256 executorReward
    ) private {
        emit OrderExecuted(
            orderHash,
            order.maker,
            executor,
            order.inputToken,
            order.outputToken,
            order.amountIn,
            amountOut,
            amountOut - executorReward,
            executorReward,
            order.recipient
        );
    }

    /**
     * @notice 按用户净收款与执行奖励语义分配 ERC20 输出资产。
     * @param outputToken 原始订单的输出代币地址。
     * @param recipient 用户最终收款地址。
     * @param executor 本次代理执行的地址。
     * @param amountOut 本次成交的总输出量。
     * @param executorReward 本次应支付给执行器的执行奖励。
     */
    function _distributeTokenOutput(
        address outputToken,
        address recipient,
        address executor,
        uint256 amountOut,
        uint256 executorReward
    ) private {
        uint256 recipientAmount = amountOut - executorReward;
        TransferHelper.safeTransfer(outputToken, recipient, recipientAmount);
        if (executorReward > 0) {
            TransferHelper.safeTransfer(outputToken, executor, executorReward);
        }
    }

    /**
     * @notice 按用户净收款与执行奖励语义分配 ETH 输出资产。
     * @param recipient 用户最终收款地址。
     * @param executor 本次代理执行的地址。
     * @param amountOut 本次成交的总输出量。
     * @param executorReward 本次应支付给执行器的执行奖励。
     */
    function _distributeNativeOutput(
        address recipient,
        address executor,
        uint256 amountOut,
        uint256 executorReward
    ) private {
        uint256 recipientAmount = amountOut - executorReward;
        TransferHelper.safeTransferETH(recipient, recipientAmount);
        if (executorReward > 0) {
            TransferHelper.safeTransferETH(executor, executorReward);
        }
    }

    /**
     * @notice 仅允许在 Router 或 WETH 相关回调时接收原生 ETH，避免非预期资金滞留。
     */
    receive() external payable {
        require(msg.sender == router || msg.sender == WETH, "FluxSignedOrderSettlement: INVALID_NATIVE_SENDER");
    }
}
