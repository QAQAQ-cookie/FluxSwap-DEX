// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapRouter.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapPair.sol";
import "../interfaces/IWETH.sol";
import "../libraries/SafeMath.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title FluxSwapRouter - 路由合约
 * @notice 用户交互入口，提供添加流动性、移除流动性、交易等功能
 * @dev 封装了与 Pair 合约的交互，提供更友好的 API
 */
contract FluxSwapRouter is IFluxSwapRouter {
    using SafeMath for uint256;

    // ==================== 状态变量 ====================
    /** @notice 工厂合约地址（不可变） */
    address public immutable override factory;

    /** @notice WETH 代币地址（不可变） */
    address public immutable WETH;

    // ==================== 接收 ETH ====================
    /** @notice 接收 ETH（用于从 WETH 提现） */
    receive() external payable {}

    // ==================== 修饰符 ====================
    /**
     * @notice 截止时间修饰符，确保交易在指定时间内完成
     * @param deadline 截止时间戳
     */
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "FluxSwapRouter: EXPIRED");
        _;
    }

    // ==================== 构造函数 ====================
    /**
     * @notice 构造函数
     * @param _factory 工厂合约地址
     * @param _WETH WETH 代币地址
     */
    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    // ==================== 流动性添加 ====================
    /**
     * @notice 添加两种 ERC20 代币的流动性
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @param amountADesired 期望添加的代币A数量
     * @param amountBDesired 期望添加的代币B数量
     * @param amountAMin 最小添加的代币A数量（滑点保护）
     * @param amountBMin 最小添加的代币B数量（滑点保护）
     * @param to 流动性代币接收地址
     * @return amountA 实际添加的代币A数量
     * @return amountB 实际添加的代币B数量
     * @return liquidity 获得的流动性代币数量
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external override returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        // 1. 如果交易对不存在，先创建
        if (IFluxSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IFluxSwapFactory(factory).createPair(tokenA, tokenB);
        }

        // 2. 获取交易对地址
        address pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);

        // 3. 获取当前储备量
        (uint256 reserveA, uint256 reserveB) = IFluxSwapPair(pair).getReserves();

        // 4. 计算实际添加数量
        if (reserveA == 0 && reserveB == 0) {
            // 首个流动性提供者：使用期望值
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            // 非首个：计算最优比例
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);

            if (amountBOptimal <= amountBDesired) {
                // 期望的B足够，添加最小值保护
                require(amountBOptimal >= amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                // 期望的B不够，计算A的最优值
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }

        // 5. 安全转账代币到 Pair 合约
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);

        // 6. 调用 Pair.mint 铸造流动性代币
        liquidity = IFluxSwapPair(pair).mint(to);
    }

    /**
     * @notice 添加 ETH 和 ERC20 代币的流动性
     * @param token ERC20 代币地址
     * @param amountTokenDesired 期望添加的代币数量
     * @param amountTokenMin 最小添加的代币数量（滑点保护）
     * @param amountETHMin 最小添加的 ETH 数量（滑点保护）
     * @param to 流动性代币接收地址
     * @return amountToken 实际添加的代币数量
     * @return amountETH 实际添加的 ETH 数量
     * @return liquidity 获得的流动性代币数量
     */
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to
    ) external override payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        // 1. 如果交易对不存在，先创建（token-WETH）
        if (IFluxSwapFactory(factory).getPair(token, WETH) == address(0)) {
            IFluxSwapFactory(factory).createPair(token, WETH);
        }

        // 2. 获取交易对地址
        address pair = IFluxSwapFactory(factory).getPair(token, WETH);

        // 3. 获取当前储备量
        (uint256 reserveToken, uint256 reserveETH) = IFluxSwapPair(pair).getReserves();

        // 4. 计算实际添加数量
        if (reserveToken == 0 && reserveETH == 0) {
            // 首个流动性提供者
            amountToken = amountTokenDesired;
            amountETH = msg.value;
        } else {
            // 计算 ETH 最优数量
            uint256 amountETHOptimal = quote(amountTokenDesired, reserveToken, reserveETH);

            if (amountETHOptimal <= msg.value) {
                // ETH 足够
                require(amountETHOptimal >= amountETHMin, "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT");
                amountToken = amountTokenDesired;
                amountETH = amountETHOptimal;
            } else {
                // ETH 不够，计算代币最优值
                uint256 amountTokenOptimal = quote(msg.value, reserveETH, reserveToken);
                assert(amountTokenOptimal <= amountTokenDesired);
                require(amountTokenOptimal >= amountTokenMin, "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT");
                amountToken = amountTokenOptimal;
                amountETH = msg.value;
            }
        }

        // 5. 安全转账代币到 Pair
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);

        // 6. 将 ETH 包裹成 WETH，然后转账给 Pair
        IWETH(WETH).deposit{value: amountETH}();
        TransferHelper.safeTransfer(WETH, pair, amountETH);

        // 7. 铸造流动性代币
        liquidity = IFluxSwapPair(pair).mint(to);
    }

    // ==================== 流动性移除 ====================
    /**
     * @notice 移除两种 ERC20 代币的流动性
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @param liquidity 销毁的流动性代币数量
     * @param amountAMin 最小收到的代币A数量（滑点保护）
     * @param amountBMin 最小收到的代币B数量（滑点保护）
     * @param to 代币接收地址
     * @return amountA 收到的代币A数量
     * @return amountB 收到的代币B数量
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) public override returns (uint256 amountA, uint256 amountB) {
        // 1. 获取交易对地址
        address pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);

        // 2. 将流动性代币转账到 Pair 合约
        IFluxSwapPair(pair).transferFrom(msg.sender, pair, liquidity);

        // 3. 调用 Pair.burn 销毁并获得代币
        (uint256 amount0, uint256 amount1) = IFluxSwapPair(pair).burn(to);

        // 4. 确定哪个是 A，哪个是 B
        (address token0, ) = sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);

        // 5. 检查滑点保护
        require(amountA >= amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
    }

    /**
     * @notice 移除 ETH 和 ERC20 代币的流动性
     * @param token ERC20 代币地址
     * @param liquidity 销毁的流动性代币数量
     * @param amountTokenMin 最小收到的代币数量
     * @param amountETHMin 最小收到的 ETH 数量
     * @param to 代币接收地址
     * @return amountToken 收到的代币数量
     * @return amountETH 收到的 ETH 数量
     */
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to
    ) public override returns (uint256 amountToken, uint256 amountETH) {
        // 1. 调用 removeLiquidity 移除流动性（先转到本合约）
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this)
        );

        // 2. 转近代币给用户
        TransferHelper.safeTransfer(token, to, amountToken);

        // 3. 将 WETH 转换为 ETH 后转给用户
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }

    /**
     * @notice 使用 permit 签名移除流动性（无需预先授权）
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @param liquidity 销毁的流动性代币数量
     * @param amountAMin 最小收到的代币A数量
     * @param amountBMin 最小收到的代币B数量
     * @param to 代币接收地址
     * @param approveMax 是否授权最大值
     * @param deadline 签名过期时间
     * @param v 签名 v
     * @param r 签名 r
     * @param s 签名 s
     * @return amountA 收到的代币A数量
     * @return amountB 收到的代币B数量
     */
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        bool approveMax,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256 amountA, uint256 amountB) {
        // 1. 获取交易对
        address pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);

        // 2. 确定授权值
        uint256 value = approveMax ? type(uint256).max : liquidity;

        // 3. 使用 permit 签名授权
        IFluxSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);

        // 4. 调用 removeLiquidity
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to);
    }

    /**
     * @notice 使用 permit 签名移除 ETH 流动性
     */
    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        bool approveMax,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override returns (uint256 amountToken, uint256 amountETH) {
        address pair = IFluxSwapFactory(factory).getPair(token, WETH);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IFluxSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to);
    }

    // ==================== 交易功能 ====================
    /**
     * @notice 用代币换取指定数量的另一种代币（精确输入）
     * @param amountIn 输入的代币数量
     * @param amountOutMin 最小输出的代币数量（滑点保护）
     * @param path 交易路径，如 [USDT, WETH, BTC]
     * @param to 最终接收地址
     * @return amounts 每个步骤的交易数量
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external override returns (uint256[] memory amounts) {
        // 1. 计算路径上每个交易的数量
        amounts = getAmountsOut(amountIn, path);

        // 2. 检查输出数量满足最小要求
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        // 3. 将输入代币转账到第一个交易对
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]
        );

        // 4. 执行 swap
        _swap(amounts, path, to);
    }

    /**
     * @notice 用代币换取指定数量的另一种代币（精确输出）
     * @param amountOut 期望输出的代币数量
     * @param amountInMax 最大输入的代币数量
     * @param path 交易路径
     * @param to 最终接收地址
     * @return amounts 每个步骤的交易数量
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) external override returns (uint256[] memory amounts) {
        // 1. 计算需要的输入数量
        amounts = getAmountsIn(amountOut, path);

        // 2. 检查输入不超过最大值
        require(amounts[0] <= amountInMax, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");

        // 3. 转账输入代币
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]
        );

        // 4. 执行 swap
        _swap(amounts, path, to);
    }

    /**
     * @notice 用 ETH 换取代币（精确输入）
     * @param amountOutMin 最小获得的代币数量
     * @param path 交易路径（必须是 WETH 开头）
     * @param to 最终接收地址
     * @return amounts 每个步骤的交易数量
     */
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external override payable returns (uint256[] memory amounts) {
        // 1. 检查路径第一个是 WETH
        require(path[0] == WETH, "FluxSwapRouter: INVALID_PATH");

        // 2. 计算数量
        amounts = getAmountsOut(msg.value, path);

        // 3. 检查输出
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");

        // 4. 将 ETH 包裹成 WETH，然后转账到第一个交易对
        IWETH(WETH).deposit{value: amounts[0]}();
        TransferHelper.safeTransfer(WETH, IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]);

        // 5. 执行 swap
        _swap(amounts, path, to);
    }

    /**
     * @notice 用代币换取 ETH（精确输出）
     */
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) external override returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @notice 用代币换取 ETH（精确输入）
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external override returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @notice 用 ETH 换取指定数量的代币（精确输出）
     */
    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to
    ) external override payable returns (uint256[] memory amounts) {
        require(path[0] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= msg.value, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(IFluxSwapFactory(factory).getPair(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // ==================== 价格计算 ====================
    /**
     * @notice 计算给定数量的代币A能换多少代币B（不考虑手续费）
     * @param amountA 输入的代币A数量
     * @param reserveA 储备量A
     * @param reserveB 储备量B
     * @return amountB 输出的代币B数量
     * @dev 用于添加流动性时计算最优比例
     */
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        require(amountA > 0, "FluxSwapRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        // 公式: amountB = amountA * reserveB / reserveA
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @notice 计算输入金额能获得多少输出（考虑 0.3% 手续费）
     * @param amountIn 输入数量
     * @param reserveIn 输入储备量
     * @param reserveOut 输出储备量
     * @return amountOut 输出数量
     * @dev 公式: amountOut = (amountIn * 0.997) * reserveOut / (reserveIn + amountIn * 0.997)
     */
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256 amountOut) {
        require(amountIn > 0, "FluxSwapRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");

        // 计算带手续费的手输入
        uint256 amountInWithFee = amountIn * 997;

        // 分子: 带手续费的输入 * 输出储备
        uint256 numerator = amountInWithFee * reserveOut;

        // 分母: 输入储备 + 带手续费的输入
        uint256 denominator = reserveIn * 1000 + amountInWithFee;

        // 计算输出
        amountOut = numerator / denominator;
    }

    /**
     * @notice 计算获得指定输出需要多少输入
     * @param amountOut 期望的输出数量
     * @param reserveIn 输入储备量
     * @param reserveOut 输出储备量
     * @return amountIn 需要的输入数量
     * @dev getAmountOut 的逆函数
     */
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");

        // 分子: 输入储备 * 输出 * 1000
        uint256 numerator = reserveIn * amountOut * 1000;

        // 分母: (输出储备 - 输出) * 997
        uint256 denominator = (reserveOut - amountOut) * 997;

        // 计算输入（+1 防止精度损失）
        amountIn = (numerator / denominator) + 1;
    }

    /**
     * @notice 计算路径上每个步骤的输出数量
     * @param amountIn 输入数量
     * @param path 交易路径
     * @return amounts 每个步骤的数量
     */
    function getAmountsOut(uint256 amountIn, address[] memory path) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "FluxSwapRouter: INVALID_PATH");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        // 遍历路径上的每个交易对
        for (uint256 i; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = IFluxSwapPair(IFluxSwapFactory(factory).getPair(path[i], path[i + 1])).getReserves();
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice 计算获得指定输出需要多少输入（逆向）
     */
    function getAmountsIn(uint256 amountOut, address[] memory path) internal view returns (uint256[] memory amounts) {
        require(path.length >= 2, "FluxSwapRouter: INVALID_PATH");

        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;

        // 从后向前遍历
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = IFluxSwapPair(IFluxSwapFactory(factory).getPair(path[i - 1], path[i])).getReserves();
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    // ==================== 内部 swap 函数 ====================
    /**
     * @notice 执行多步 swap
     * @param amounts 每步的交易数量
     * @param path 交易路径
     * @param to 最终接收地址
     */
    function _swap(uint256[] memory amounts, address[] memory path, address to) internal {
        // 遍历路径上的每个交易
        for (uint256 i; i < path.length - 1; i++) {
            // 确定输入和输出代币
            (address input, address output) = (path[i], path[i + 1]);

            // 确定哪个是 token0
            (address token0, ) = sortTokens(input, output);

            // 确定输出数量
            uint256 amountOut = amounts[i + 1];

            // 确定 swap 参数（哪个是 0，哪个是 amountOut）
            (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));

            // 确定接收地址（如果是中间步骤，转到下一个交易对）
            address to_ = i < path.length - 2 ? IFluxSwapFactory(factory).getPair(output, path[i + 2]) : to;

            // 执行 swap
            IFluxSwapPair(IFluxSwapFactory(factory).getPair(input, output)).swap(amount0Out, amount1Out, to_);
        }
    }

    // ==================== 工具函数 ====================
    /**
     * @notice 对两个代币地址排序，确保 token0 < token1
     * @param tokenA 代币A地址
     * @param tokenB 代币B地址
     * @return token0 较小地址
     * @return token1 较大地址
     */
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "FluxSwapRouter: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "FluxSwapRouter: ZERO_ADDRESS");
    }
}
