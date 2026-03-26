// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapPair.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFlashSwapReceiver.sol";
import "../libraries/SafeMath.sol";
import "../libraries/UQ112x112.sol";

/**
 * @title FluxSwapPair - AMM 交易对合约
 * @notice 实现 Uniswap V2 风格的自动做市商核心逻辑，支持 TWAP 价格预言机和闪电贷
 * @dev 继承 ERC20 功能（mint/burn/transfer），每个交易对就是一个 LP 代币
 *      使用 UQ112x112 定点数格式计算 TWAP 价格
 */
contract FluxSwapPair is IFluxSwapPair {
    using SafeMath for uint256;

    receive() external payable {}

    // ==================== 常量 ====================
    /** @notice 最小流动性限制，防止首个流动性提供者的份额被稀释为 0 */
    uint256 public constant MINIMUM_LIQUIDITY = 10**3;

    // ==================== 状态变量 ====================
    /** @notice 工厂合约地址，用于验证初始化权限 */
    address public factory;

    /** @notice 代币0地址（小地址） */
    address public token0;

    /** @notice 代币1地址（大地址） */
    address public token1;

    /** @notice 储备量0 */
    uint112 private reserve0;

    /** @notice 储备量1 */
    uint112 private reserve1;

    /** @notice 上次更新价格累计值的时间戳 */
    uint256 private blockTimestampLast;

    /** @notice 重入锁，防止重入攻击 */
    uint256 private unlocked = 1;

    /** @notice 代币0的价格累计值，用于 TWAP 时间加权平均价格计算 */
    uint256 public override price0CumulativeLast;

    /** @notice 代币1的价格累计值，用于 TWAP 时间加权平均价格计算 */
    uint256 public override price1CumulativeLast;

    /** @notice 流动性变化前的 k 值，用于计算手续费 */
    uint256 public override kLast;

    /** @notice EIP-712 域分隔符，用于 permit 签名验证 */
    bytes32 public override DOMAIN_SEPARATOR;

    /** @notice EIP-712 结构哈希类型，用于 permit 签名 */
    bytes32 public override PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    /** @notice 用户 nonce，用于 permit 签名验证 */
    mapping(address => uint256) public override nonces;

    // ==================== 修饰符 ====================
    /** @notice 重入锁修饰符，防止合约在执行过程中被再次调用 */
    modifier lock() {
        require(unlocked == 1, "FluxSwap: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // ==================== 构造函数 ====================
    /** @notice 构造函数，设置 factory 为部署者地址 */
    constructor() {
        factory = msg.sender;

        // 获取当前链 ID，用于 EIP-712 域分隔符
        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        // 构造 EIP-712 域分隔符
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FluxSwap Pair"),    // 合约名称
                keccak256("1"),                // 版本
                chainId,
                address(this)                   // 本合约地址
            )
        );
    }

    // ==================== 只读函数 ====================
    /**
     * @notice 获取当前储备量
     * @return 储备量0, 储备量1
     */
    function getReserves() public view override returns (uint256, uint256) {
        return (reserve0, reserve1);
    }

    /**
     * @notice 获取 TWAP 价格
     * @param token 代币地址（token0 或 token1）
     * @param timeframeSeconds 时间范围（秒）
     * @return priceOut TWAP 价格（UQ112.112 格式，需要除以 2^112 得到实际价格）
     */
    function price(address token, uint256 timeframeSeconds) external view override returns (uint256 priceOut) {
        require(token == token0 || token == token1, "FluxSwap: INVALID_TOKEN");
        require(timeframeSeconds > 0, "FluxSwap: ZERO_TIMEFRAME");

        uint256 blockTimestamp = block.timestamp;
        uint256 timeElapsed = blockTimestamp - blockTimestampLast;

        if (timeElapsed < timeframeSeconds) {
            return 0;
        }

        uint256 priceAccumulated = token == token0 ? price0CumulativeLast : price1CumulativeLast;

        if (reserve0 != 0 && reserve1 != 0) {
            uint256 price0Cumulative = price0CumulativeLast + (uint256(reserve1) * 1e18 / reserve0) * timeElapsed;
            uint256 price1Cumulative = price1CumulativeLast + (uint256(reserve0) * 1e18 / reserve1) * timeElapsed;

            priceAccumulated = token == token0 ? price0Cumulative : price1Cumulative;
        }

        return priceAccumulated / timeElapsed;
    }

    // ==================== 初始化 ====================
    /**
     * @notice 初始化交易对，由 factory 调用设置 token 地址
     * @param _token0 代币0地址（小地址）
     * @param _token1 代币1地址（大地址）
     */
    function initialize(address _token0, address _token1) external override {
        // 只有 factory 才能调用，防止重复初始化
        require(msg.sender == factory, "FluxSwap: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    // ==================== 内部工具函数 ====================
    /**
     * @notice 安全转账，使用低级别 call 调用 transfer
     * @param token 代币地址
     * @param to 接收地址
     * @param value 转账数量
     */
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "FluxSwap: TRANSFER_FAILED");
    }

    // ==================== 流动性相关 ====================
    event DebugMint(uint256 amount0, uint256 amount1, uint256 liquidity, uint256 ts, uint256 balance0, uint256 balance1);

    function mint(address to) external override lock returns (uint256 liquidity) {
        // 1. 获取当前储备量
        (uint256 r0, uint256 r1) = getReserves();

        // 2. 获取当前池子中两个代币的余额
        uint256 balance0 = IFluxSwapPair(token0).balanceOf(address(this));
        uint256 balance1 = IFluxSwapPair(token1).balanceOf(address(this));

        // 3. 计算本次添加的代币数量（余额增量）
        uint256 amount0 = balance0 - r0;
        uint256 amount1 = balance1 - r1;

        // 4. 获取当前 LP 总供应量
        uint256 ts = totalSupply();

        // 5. 计算应铸造的 LP 数量
        if (ts == 0) {
            // 首个流动性提供者：liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
            // 减去最小流动性并永久锁定到 address(0)，防止池子为空
            liquidity = SafeMath.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            // 铸造最小流动性到 address(0)，永久锁定
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            // 非首个提供者：按比例计算，取两个比例的较小值
            liquidity = SafeMath.min(
                (amount0 * ts) / r0,
                (amount1 * ts) / r1
            );
        }

        emit DebugMint(amount0, amount1, liquidity, ts, balance0, balance1);

        // 6. 检查铸造数量
        require(liquidity > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_MINTED");

        // 7. 铸造 LP 代币给接收者
        _mint(to, liquidity);

        // 8. 更新 kLast，用于计算手续费
        kLast = reserve0 * reserve1;

        // 9. 更新储备量和价格累计值
        _update(balance0, balance1);

        // 10. 触发 Mint 事件
        emit Mint(msg.sender, amount0, amount1);
    }

    /**
     * @notice 移除流动性 - 销毁 LP 代币，获得代币
     * @param to 代币接收地址
     * @return amount0 取回的代币0数量
     * @return amount1 取回的代币1数量
     */
    function burn(address to) external override lock returns (uint256 amount0, uint256 amount1) {
        // 1. 获取 token 地址
        address t0 = token0;
        address t1 = token1;

        // 2. 获取当前池子余额
        uint256 balance0 = IFluxSwapPair(t0).balanceOf(address(this));
        uint256 balance1 = IFluxSwapPair(t1).balanceOf(address(this));

        // 3. 获取 Pair 合约自身的 LP 数量（由 transferFrom 从调用者转入）
        uint256 liquidity = balanceOf[address(this)];

        // 4. 获取 LP 总供应量
        uint256 ts = totalSupply();

        // 5. 按比例计算可取回的代币数量
        amount0 = (liquidity * balance0) / ts;
        amount1 = (liquidity * balance1) / ts;

        // 6. 检查取回数量
        require(amount0 > 0 && amount1 > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_BURNED");

        // 7. 销毁 Pair 合约自己的 LP 代币（这些 LP 是调用者通过 transferFrom 转入的）
        _burn(address(this), liquidity);

        // 8. 安全转近代币给接收者
        _safeTransfer(t0, to, amount0);
        _safeTransfer(t1, to, amount1);

        // 9. 更新余额（转账后的新余额）
        balance0 = IFluxSwapPair(t0).balanceOf(address(this));
        balance1 = IFluxSwapPair(t1).balanceOf(address(this));

        // 10. 更新 kLast
        kLast = balance0 * balance1;

        // 11. 更新储备量和价格
        _update(balance0, balance1);

        // 12. 触发 Burn 事件
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // ==================== 交易相关 ====================
    /**
     * @notice 交换代币
     * @param amount0Out 用户期望收到的代币0数量
     * @param amount1Out 用户期望收到的代币1数量
     * @param to 代币接收地址
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external override lock {
        // 1. 检查输出数量大于 0
        require(amount0Out > 0 || amount1Out > 0, "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT");

        // 2. 获取当前储备量
        (uint256 r0, uint256 r1) = getReserves();

        // 3. 检查输出不超过储备量
        require(amount0Out < r0 && amount1Out < r1, "FluxSwap: INSUFFICIENT_LIQUIDITY");

        // 4. 计算交易后的临时余额
        uint256 balance0;
        uint256 balance1;
        {
            // 作用域限制，优化 gas
            address t0 = token0;
            address t1 = token1;

            // 5. 检查接收地址不是 token0 或 token1
            require(to != t0 && to != t1, "FluxSwap: INVALID_TO");

            // 6. 转出代币给接收者
            if (amount0Out > 0) _safeTransfer(t0, to, amount0Out);
            if (amount1Out > 0) _safeTransfer(t1, to, amount1Out);

            // 7. 获取转账后的新余额
            balance0 = IFluxSwapPair(t0).balanceOf(address(this));
            balance1 = IFluxSwapPair(t1).balanceOf(address(this));
        }

        // 8. 计算实际输入数量
        // 如果余额大于 (储备 - 输出)，则差值为输入
        uint256 amount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 amount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;

        // 9. 检查有输入
        require(amount0In > 0 || amount1In > 0, "FluxSwap: INSUFFICIENT_INPUT_AMOUNT");

        // 10. 验证 K 值（恒定乘积公式）
        // 手续费 0.3%：实际余额乘以 1000，输入乘以 3
        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            // 验证：(balance0 - fee) * (balance1 - fee) >= reserve0 * reserve1
            require(balance0Adjusted * balance1Adjusted >= r0 * r1 * (1000 ** 2), "FluxSwap: K");
        }

        // 11. 更新储备量和价格累计值
        _update(balance0, balance1);

        // 12. 触发 Swap 事件
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // ==================== Flash Swap ====================
    /**
     * @notice 闪电贷 / 闪电交换
     * @param recipient 代币接收地址
     * @param amount0Out 期望收到的代币0数量
     * @param amount1Out 期望收到的代币1数量
     * @param data 传递给接收者的任意数据（用于回调）
     * @dev 允许无抵押借款，只要在同一交易中归还（带 0.3% 手续费）即可
     */
    function flashSwap(
        address recipient,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external override {
        // 1. 检查输出数量大于 0
        require(amount0Out > 0 || amount1Out > 0, "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT");

        // 2. 获取当前储备量
        (uint256 r0, uint256 r1) = getReserves();

        // 3. 检查输出不超过储备量
        require(amount0Out < r0 && amount1Out < r1, "FluxSwap: INSUFFICIENT_LIQUIDITY");

        // 4. 获取当前余额
        uint256 balance0 = IFluxSwapPair(token0).balanceOf(address(this));
        uint256 balance1 = IFluxSwapPair(token1).balanceOf(address(this));

        // 5. 计算需要还款的最小数量（带 0.3% 手续费）
        uint256 amount0In;
        uint256 amount1In;
        if (amount0Out > 0) {
            amount0In = (amount0Out * 1000) / 997;
        }
        if (amount1Out > 0) {
            amount1In = (amount1Out * 1000) / 997;
        }

        // 6. 转出代币给接收者
        if (amount0Out > 0) _safeTransfer(token0, recipient, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, recipient, amount1Out);

        // 7. 调用接收者的回调函数，让用户可以做任何事（套利、套现等）
        if (data.length > 0 || recipient.code.length > 0) {
            IFlashSwapReceiver(recipient).onFlashSwap(msg.sender, amount0Out, amount1Out, data);
        }

        // 8. 检查还款后的余额是否满足 K 值公式
        balance0 = IFluxSwapPair(token0).balanceOf(address(this));
        balance1 = IFluxSwapPair(token1).balanceOf(address(this));

        // 计算实际输入（还款后余额 - (初始储备 - 转出量) = 实际输入量）
        uint256 actualAmount0In = balance0 > r0 - amount0Out ? balance0 - (r0 - amount0Out) : 0;
        uint256 actualAmount1In = balance1 > r1 - amount1Out ? balance1 - (r1 - amount1Out) : 0;

        // 9. 验证 K 值（考虑手续费）
        {
            uint256 balance0Adjusted = balance0 * 1000;
            uint256 balance1Adjusted = balance1 * 1000;
            if (actualAmount0In > 0) {
                balance0Adjusted = balance0Adjusted - actualAmount0In * 3;
            }
            if (actualAmount1In > 0) {
                balance1Adjusted = balance1Adjusted - actualAmount1In * 3;
            }
            require(balance0Adjusted * balance1Adjusted >= r0 * r1 * (1000 ** 2), "FluxSwap: K");
        }

        // 10. 更新储备量
        _update(balance0, balance1);

        // 11. 触发 FlashSwap 事件
        emit FlashSwap(msg.sender, amount0Out, amount1Out, actualAmount0In, actualAmount1In);
    }

    /**
     * @notice 提取池子中多余的代币（处理灰尘）
     * @param to 多余代币的接收地址
     * @dev 用于提取由于四舍五入多出的少量代币，保持储备量不变
     */
    function skim(address to) external override lock {
        address t0 = token0;
        address t1 = token1;

        // 转出超过储备量的部分（即多余的部分）
        _safeTransfer(t0, to, IFluxSwapPair(t0).balanceOf(address(this)) - reserve0);
        _safeTransfer(t1, to, IFluxSwapPair(t1).balanceOf(address(this)) - reserve1);
    }

    /**
     * @notice 同步储备量到当前余额
     * @dev 用于价格偏离时强制恢复
     */
    function sync() external override lock {
        _update(IFluxSwapPair(token0).balanceOf(address(this)), IFluxSwapPair(token1).balanceOf(address(this)));
    }

    // ==================== EIP-712 签名 ====================
    /**
     * @notice EIP-712 签名授权，允许通过签名授权他人使用代币
     * @param owner 代币所有者
     * @param spender 被授权地址
     * @param value 授权数量
     * @param deadline 签名过期时间
     * @param v 签名 v
     * @param r 签名 r
     * @param s 签名 s
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // 1. 检查签名未过期
        require(block.timestamp <= deadline, "FluxSwap: EXPIRED");

        // 2. 构造 EIP-712 签名摘要
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner], deadline))
            )
        );

        // 3. 验证签名
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "FluxSwap: INVALID_SIGNATURE");

        // 4. 更新 nonce
        nonces[owner] += 1;

        // 5. 设置授权
        _allowance[owner][spender] = value;
    }

    // ==================== ERC20 功能 ====================
    /** @notice 授权映射表 */
    mapping(address => mapping(address => uint256)) private _allowance;

    /**
     * @notice 查询授权额度
     * @param owner 代币所有者
     * @param spender 被授权地址
     * @return 授权数量
     */
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowance[owner][spender];
    }

    /**
     * @notice 授权代币给 spender
     * @param spender 被授权地址
     * @param value 授权数量
     * @return success 是否成功
     */
    function approve(address spender, uint256 value) external returns (bool) {
        _allowance[msg.sender][spender] = value;
        return true;
    }

    /**
     * @notice 转账代币
     * @param to 接收地址
     * @param value 转账数量
     * @return success 是否成功
     */
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    /**
     * @notice 从 from 转账代币到 to（需要授权）
     * @param from 转出地址
     * @param to 接收地址
     * @param value 转账数量
     * @return success 是否成功
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        // 如果不是自己，转账前需要减少授权额度
        if (from != msg.sender) {
            uint256 allowed = _allowance[from][msg.sender];
            if (allowed != type(uint256).max) {
                _allowance[from][msg.sender] = allowed - value;
            }
        }
        _transfer(from, to, value);
        return true;
    }

    /**
     * @notice 内部转账函数
     * @param from 转出地址
     * @param to 接收地址
     * @param value 转账数量
     */
    function _transfer(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    // ==================== 储备更新 ====================
    /**
     * @notice 更新储备量和价格累计值（用于 TWAP 计算）
     * @param balance0 新的代币0余额
     * @param balance1 新的代币1余额
     * @dev 使用 UQ112x112 定点数格式：(reserve1/reserve0) * Q112 * timeElapsed
     *      价格累计值需要除以 2^112 才能得到实际价格比率
     */
    function _update(uint256 balance0, uint256 balance1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "FluxSwap: OVERFLOW");

        uint256 blockTimestamp = block.timestamp;
        uint256 timeElapsed = blockTimestamp - blockTimestampLast;

        if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
            price0CumulativeLast += UQ112x112.uqdiv(reserve1, reserve0) * timeElapsed;
            price1CumulativeLast += UQ112x112.uqdiv(reserve0, reserve1) * timeElapsed;
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;

        emit Sync(reserve0, reserve1);
    }

    // ==================== 代币供应量 ====================
    /** @notice LP 代币总供应量 */
    uint256 private _totalSupply;

    /** @notice 用户 LP 余额映射 */
    mapping(address => uint256) public override balanceOf;

    /**
     * @notice 获取 LP 代币总供应量
     * @return LP 代币总供应量
     */
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice 内部铸造函数
     * @param to 接收地址
     * @param value 铸造数量
     */
    function _mint(address to, uint256 value) internal {
        _totalSupply += value;
        balanceOf[to] += value;
    }

    /**
     * @notice 内部销毁函数
     * @param from 销毁地址
     * @param value 销毁数量
     */
    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        _totalSupply -= value;
    }
}
