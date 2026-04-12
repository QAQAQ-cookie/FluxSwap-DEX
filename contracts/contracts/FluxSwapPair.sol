// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./FluxSwapERC20.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapCallee.sol";
import "../libraries/Math.sol";
import "../libraries/UQ112x112.sol";

/**
 * @title Flux 恒定乘积 Pair
 * @notice 管理一组交易对的储备、LP 份额铸销以及交换逻辑。
 * @dev 该实现支持协议费抽取到工厂设置的金库，并维护 TWAP 所需的累计价格。
 */
contract FluxSwapPair is FluxSwapERC20 {
    using UQ112x112 for uint224;

    // 永久锁定在零地址的最小 LP 数量。
    uint256 public constant MINIMUM_LIQUIDITY = 10**3;
    // 基点制分母，10000 表示 100%。
    uint256 private constant FEE_BPS_BASE = 10000;
    // 总交换手续费，单位为基点。
    uint256 private constant TOTAL_SWAP_FEE_BPS = 30;
    // 其中归属协议金库的手续费部分，单位为基点。
    uint256 private constant PROTOCOL_SWAP_FEE_BPS = 5;
    // 实际留在池内归属 LP 的手续费部分，单位为基点。
    uint256 private constant LP_SWAP_FEE_BPS = TOTAL_SWAP_FEE_BPS - PROTOCOL_SWAP_FEE_BPS;
    // ERC20 `transfer(address,uint256)` 的函数选择器。
    bytes4 private constant SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));

    // 创建该 Pair 的工厂地址。
    address public factory;
    // 排序后较小的底层代币地址。
    address public token0;
    // 排序后较大的底层代币地址。
    address public token1;

    // 当前记录的 `token0` 储备。
    uint112 private reserve0;
    // 当前记录的 `token1` 储备。
    uint112 private reserve1;
    // 最近一次 `_update` 的时间戳。
    uint32 private blockTimestampLast;

    // `token0` 相对 `token1` 的累计价格。
    uint256 public price0CumulativeLast;
    // `token1` 相对 `token0` 的累计价格。
    uint256 public price1CumulativeLast;

    // 重入锁标记，`1` 表示未锁定。
    uint256 private unlocked = 1;

    // 添加流动性铸造 LP 时触发。
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    // 移除流动性销毁 LP 时触发。
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    // 成功执行交换时触发。
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    // 向协议金库支付手续费时触发。
    event ProtocolFeePaid(address indexed treasury, uint256 amount0, uint256 amount1);
    // 储备同步到新值时触发。
    event Sync(uint112 reserve0, uint112 reserve1);

    // 简单的重入保护修饰器。
    modifier lock() {
        require(unlocked == 1, "FluxSwap: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    /**
     * @notice 初始化 Pair，并记录部署它的工厂地址。
     */
    constructor() {
        factory = msg.sender;
    }

    /**
     * @notice 由工厂在创建后初始化交易对中的两种代币。
     * @param _token0 排序后较小的代币地址。
     * @param _token1 排序后较大的代币地址。
     */
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "FluxSwap: FORBIDDEN");
        require(token0 == address(0) && token1 == address(0), "FluxSwap: ALREADY_INITIALIZED");
        require(_token0 != _token1, "FluxSwap: IDENTICAL_ADDRESSES");
        require(_token0 != address(0) && _token1 != address(0), "FluxSwap: ZERO_ADDRESS");
        token0 = _token0;
        token1 = _token1;
    }

    /**
     * @notice 根据本次新增资产铸造 LP 份额。
     * @param to 接收新铸 LP 的地址。
     * @return liquidity 本次实际铸造的 LP 数量。
     */
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /**
     * @notice 销毁当前 Pair 持有的 LP，并按份额返还底层资产。
     * @param to 接收返还底层资产的地址。
     * @return amount0 实际返还的 `token0` 数量。
     * @return amount1 实际返还的 `token1` 数量。
     */
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "FluxSwap: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /**
     * @notice 执行一次恒定乘积交换，并在有配置时提取协议费到金库。
     * @param amount0Out 计划输出给接收方的 `token0` 数量。
     * @param amount1Out 计划输出给接收方的 `token1` 数量。
     * @param to 接收输出资产的目标地址。
     * @param data 若不为空，将触发闪电回调。
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external lock {
        require(amount0Out > 0 || amount1Out > 0, "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "FluxSwap: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "FluxSwap: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out);
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out);
            if (data.length > 0) IFluxSwapCallee(to).fluxSwapCall(msg.sender, amount0Out, amount1Out, data);
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "FluxSwap: INSUFFICIENT_INPUT_AMOUNT");
        {
            address treasury = IFluxSwapFactory(factory).treasury();
            uint256 lpFeeBps = TOTAL_SWAP_FEE_BPS;
            uint256 protocolFee0;
            uint256 protocolFee1;

            if (treasury != address(0)) {
                protocolFee0 = (amount0In * PROTOCOL_SWAP_FEE_BPS) / FEE_BPS_BASE;
                protocolFee1 = (amount1In * PROTOCOL_SWAP_FEE_BPS) / FEE_BPS_BASE;

                if (protocolFee0 > 0) _safeTransfer(token0, treasury, protocolFee0);
                if (protocolFee1 > 0) _safeTransfer(token1, treasury, protocolFee1);

                balance0 -= protocolFee0;
                balance1 -= protocolFee1;
                lpFeeBps = LP_SWAP_FEE_BPS;

                if (protocolFee0 > 0 || protocolFee1 > 0) {
                    emit ProtocolFeePaid(treasury, protocolFee0, protocolFee1);
                }
            }

            uint256 balance0Adjusted = balance0 * FEE_BPS_BASE - amount0In * lpFeeBps;
            uint256 balance1Adjusted = balance1 * FEE_BPS_BASE - amount1In * lpFeeBps;
            require(
                balance0Adjusted * balance1Adjusted >= uint256(_reserve0) * uint256(_reserve1) * FEE_BPS_BASE**2,
                "FluxSwap: K"
            );
        }

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /**
     * @notice 把超出储备记录的多余余额转出，但不修改储备值。
     * @param to 接收多余余额的地址。
     */
    function skim(address to) external lock {
        address _token0 = token0;
        address _token1 = token1;
        _safeTransfer(_token0, to, IERC20(_token0).balanceOf(address(this)) - reserve0);
        _safeTransfer(_token1, to, IERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    /**
     * @notice 强制把储备记录同步到当前真实余额。
     */
    function sync() external lock {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }

    /**
     * @notice 返回当前储备和最近一次更新时间戳。
     * @return _reserve0 当前记录的 `token0` 储备。
     * @return _reserve1 当前记录的 `token1` 储备。
     * @return _blockTimestampLast 最近一次 `_update` 使用的时间戳。
     */
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    /**
     * @notice 刷新储备与 TWAP 累计值，并发出同步事件。
     * @param balance0 刷新时实际读取到的 `token0` 余额。
     * @param balance1 刷新时实际读取到的 `token1` 余额。
     * @param _reserve0 更新前记录的 `token0` 储备。
     * @param _reserve1 更新前记录的 `token1` 储备。
     */
    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "FluxSwap: OVERFLOW");
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast;
        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            price0CumulativeLast += uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
            price1CumulativeLast += uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
        }
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    /**
     * @notice 安全转出底层资产。
     * @dev 兼容部分不返回布尔值的 ERC20 实现。
     * @param token 需要转出的代币地址。
     * @param to 接收地址。
     * @param value 转账数量。
     */
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "FluxSwap: TRANSFER_FAILED");
    }
}
