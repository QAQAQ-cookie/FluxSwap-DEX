// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapRouter.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapPair.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IWETH.sol";
import "../libraries/TransferHelper.sol";

/**
 * @title Flux Router
 * @notice 为流动性增删以及精确输入输出换币提供统一入口。
 * @dev Router 不自行保留业务资金，除临时中转 WETH 解包场景外，资产应尽快流向 Pair 或最终接收方。
 */
contract FluxSwapRouter is IFluxSwapRouter {
    // 使用 Permit 移除 ERC20/ERC20 流动性时的打包参数。
    struct RemoveLiquidityPermitParams {
        address tokenA;
        address tokenB;
        uint256 liquidity;
        uint256 amountAMin;
        uint256 amountBMin;
        address to;
        uint256 deadline;
        bool approveMax;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // 使用 Permit 移除 ERC20/ETH 流动性时的打包参数。
    struct RemoveLiquidityETHPermitParams {
        address token;
        uint256 liquidity;
        uint256 amountTokenMin;
        uint256 amountETHMin;
        address to;
        uint256 deadline;
        bool approveMax;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ERC20/ERC20 添加流动性的打包参数。
    struct AddLiquidityParams {
        address tokenA;
        address tokenB;
        uint256 amountADesired;
        uint256 amountBDesired;
        uint256 amountAMin;
        uint256 amountBMin;
        address to;
    }

    // ERC20/ETH 添加流动性的打包参数。
    struct AddLiquidityETHParams {
        address token;
        uint256 amountTokenDesired;
        uint256 amountTokenMin;
        uint256 amountETHMin;
        address to;
        uint256 value;
    }

    // 基点制分母，10000 表示 100%。
    uint256 private constant FEE_BPS_BASE = 10000;
    // Router 计算报价时使用的总交换手续费，单位为基点。
    uint256 private constant TOTAL_SWAP_FEE_BPS = 30;

    // Pair 工厂地址。
    address public immutable override factory;
    // WETH 合约地址。
    address public immutable override WETH;

    // 限制函数必须在截止时间前执行。
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "FluxSwapRouter: EXPIRED");
        _;
    }

    /**
     * @notice 部署 Router 并绑定工厂与 WETH。
     * @param _factory Pair 工厂地址。
     * @param _WETH WETH 合约地址。
     */
    constructor(address _factory, address _WETH) {
        require(_factory != address(0), "FluxSwapRouter: ZERO_ADDRESS");
        require(_WETH != address(0), "FluxSwapRouter: ZERO_ADDRESS");
        factory = _factory;
        WETH = _WETH;
    }

    /**
     * @notice 仅在 WETH 解包时接收原生 ETH。
     * @dev 任何非 WETH 来源的原生 ETH 都会触发断言失败，避免资金滞留在 Router。
     */
    receive() external payable {
        assert(msg.sender == WETH);
    }

    /**
     * @notice 为 ERC20/ERC20 交易对添加流动性。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @param amountADesired 希望投入的代币 A 数量。
     * @param amountBDesired 希望投入的代币 B 数量。
     * @param amountAMin 允许接受的最小代币 A 实际投入量。
     * @param amountBMin 允许接受的最小代币 B 实际投入量。
     * @param to 接收 LP 的地址。
     * @param deadline 交易截止时间。
     * @return amountA 实际投入的代币 A 数量。
     * @return amountB 实际投入的代币 B 数量。
     * @return liquidity 实际铸造的 LP 数量。
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        AddLiquidityParams memory params;
        params.tokenA = tokenA;
        params.tokenB = tokenB;
        params.amountADesired = amountADesired;
        params.amountBDesired = amountBDesired;
        params.amountAMin = amountAMin;
        params.amountBMin = amountBMin;
        params.to = to;
        return _addLiquidity(params);
    }

    /**
     * @notice 为 ERC20/ETH 交易对添加流动性。
     * @param token ERC20 代币地址。
     * @param amountTokenDesired 希望投入的 ERC20 数量。
     * @param amountTokenMin 允许接受的最小 ERC20 实际投入量。
     * @param amountETHMin 允许接受的最小 ETH 实际投入量。
     * @param to 接收 LP 的地址。
     * @param deadline 交易截止时间。
     * @return amountToken 实际投入的 ERC20 数量。
     * @return amountETH 实际投入的 ETH 数量。
     * @return liquidity 实际铸造的 LP 数量。
     */
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable override ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        AddLiquidityETHParams memory params;
        params.token = token;
        params.amountTokenDesired = amountTokenDesired;
        params.amountTokenMin = amountTokenMin;
        params.amountETHMin = amountETHMin;
        params.to = to;
        params.value = msg.value;
        return _addLiquidityETH(params);
    }

    /**
     * @notice 移除 ERC20/ERC20 交易对流动性。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountAMin 代币 A 最小回收量。
     * @param amountBMin 代币 B 最小回收量。
     * @param to 接收底层资产的地址。
     * @param deadline 交易截止时间。
     * @return amountA 实际回收的代币 A 数量。
     * @return amountB 实际回收的代币 B 数量。
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        return _removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to);
    }

    /**
     * @notice 移除 ERC20/ETH 交易对流动性。
     * @param token ERC20 代币地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountTokenMin ERC20 最小回收量。
     * @param amountETHMin ETH 最小回收量。
     * @param to 接收资产的地址。
     * @param deadline 交易截止时间。
     * @return amountToken 实际回收的 ERC20 数量。
     * @return amountETH 实际回收的 ETH 数量。
     */
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        return _removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to);
    }

    /**
     * @notice 使用 Permit 授权后移除 ERC20/ERC20 交易对流动性。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountAMin 代币 A 最小回收量。
     * @param amountBMin 代币 B 最小回收量。
     * @param to 接收底层资产的地址。
     * @param deadline Permit 与交易共用的截止时间。
     * @param approveMax 是否使用无限授权。
     * @param v Permit 签名 `v` 分量。
     * @param r Permit 签名 `r` 分量。
     * @param s Permit 签名 `s` 分量。
     * @return amountA 实际回收的代币 A 数量。
     * @return amountB 实际回收的代币 B 数量。
     */
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        RemoveLiquidityPermitParams memory params;
        params.tokenA = tokenA;
        params.tokenB = tokenB;
        params.liquidity = liquidity;
        params.amountAMin = amountAMin;
        params.amountBMin = amountBMin;
        params.to = to;
        params.deadline = deadline;
        params.approveMax = approveMax;
        params.v = v;
        params.r = r;
        params.s = s;
        return _removeLiquidityWithPermit(params);
    }

    /**
     * @notice 使用 Permit 授权后移除 ERC20/ETH 交易对流动性。
     * @param token ERC20 代币地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountTokenMin ERC20 最小回收量。
     * @param amountETHMin ETH 最小回收量。
     * @param to 接收资产的地址。
     * @param deadline Permit 与交易共用的截止时间。
     * @param approveMax 是否使用无限授权。
     * @param v Permit 签名 `v` 分量。
     * @param r Permit 签名 `r` 分量。
     * @param s Permit 签名 `s` 分量。
     * @return amountToken 实际回收的 ERC20 数量。
     * @return amountETH 实际回收的 ETH 数量。
     */
    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        RemoveLiquidityETHPermitParams memory params;
        params.token = token;
        params.liquidity = liquidity;
        params.amountTokenMin = amountTokenMin;
        params.amountETHMin = amountETHMin;
        params.to = to;
        params.deadline = deadline;
        params.approveMax = approveMax;
        params.v = v;
        params.r = r;
        params.s = s;
        return _removeLiquidityETHWithPermit(params);
    }
    /**
     * @notice 以精确输入方式完成 ERC20 到 ERC20 的兑换。
     * @param amountIn 输入数量。
     * @param amountOutMin 最小可接受输出。
     * @param path 兑换路径。
     * @param to 接收输出资产的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, to);
    }

    /**
     * @notice 以精确输出方式完成 ERC20 到 ERC20 的兑换。
     * @param amountOut 目标输出数量。
     * @param amountInMax 最大可接受输入。
     * @param path 兑换路径。
     * @param to 接收输出资产的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, to);
    }

    /**
     * @notice 以精确输入方式完成 ETH 到 ERC20 的兑换。
     * @param amountOutMin 最小可接受输出。
     * @param path 兑换路径，首项必须是 WETH。
     * @param to 接收输出资产的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsOut(msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(_getPairOrRevert(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    /**
     * @notice 以精确输出方式完成 ERC20 到 ETH 的兑换。
     * @param amountOut 目标 ETH 数量。
     * @param amountInMax 最大可接受输入。
     * @param path 兑换路径，末项必须是 WETH。
     * @param to 接收 ETH 的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= amountInMax, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @notice 以精确输入方式完成 ERC20 到 ETH 的兑换。
     * @param amountIn 输入数量。
     * @param amountOutMin 最小可接受 ETH 输出。
     * @param path 兑换路径，末项必须是 WETH。
     * @param to 接收 ETH 的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsOut(amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /**
     * @notice 以精确输出方式完成 ETH 到 ERC20 的兑换，并退回多余 ETH。
     * @param amountOut 目标输出数量。
     * @param path 兑换路径，首项必须是 WETH。
     * @param to 接收输出资产的地址。
     * @param deadline 交易截止时间。
     * @return amounts 路径上每一跳的输入输出数量数组。
     */
    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WETH, "FluxSwapRouter: INVALID_PATH");
        amounts = getAmountsIn(amountOut, path);
        require(amounts[0] <= msg.value, "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(_getPairOrRevert(path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);

        if (msg.value > amounts[0]) {
            TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
        }
    }

    /**
     * @notice 根据当前储备推导精确输入路径的逐跳输出。
     * @param amountIn 初始输入数量。
     * @param path 兑换路径。
     * @return amounts 路径上每一跳对应的数量数组。
     */
    function getAmountsOut(
        uint256 amountIn,
        address[] memory path
    ) public view override returns (uint256[] memory amounts) {
        require(path.length >= 2, "FluxSwapRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice 根据当前储备反推精确输出路径的逐跳输入。
     * @param amountOut 最终目标输出数量。
     * @param path 兑换路径。
     * @return amounts 路径上每一跳对应的数量数组。
     */
    function getAmountsIn(
        uint256 amountOut,
        address[] memory path
    ) public view override returns (uint256[] memory amounts) {
        require(path.length >= 2, "FluxSwapRouter: INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice 按储备比例估算另一侧应投入数量。
     * @param amountA 已知一侧的数量。
     * @param reserveA 已知一侧的储备。
     * @param reserveB 另一侧的储备。
     * @return amountB 另一侧按比例对应的数量。
     */
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure override returns (uint256 amountB) {
        require(amountA > 0, "FluxSwapRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @notice 按恒定乘积公式计算精确输入对应的输出数量。
     * @param amountIn 输入数量。
     * @param reserveIn 输入侧储备。
     * @param reserveOut 输出侧储备。
     * @return amountOut 理论输出数量。
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountOut) {
        require(amountIn > 0, "FluxSwapRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * (FEE_BPS_BASE - TOTAL_SWAP_FEE_BPS);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_BPS_BASE) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice 按恒定乘积公式反推达到目标输出所需的输入数量。
     * @param amountOut 目标输出数量。
     * @param reserveIn 输入侧储备。
     * @param reserveOut 输出侧储备。
     * @return amountIn 理论所需输入数量。
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountIn) {
        require(amountOut > 0, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * FEE_BPS_BASE;
        uint256 denominator = (reserveOut - amountOut) * (FEE_BPS_BASE - TOTAL_SWAP_FEE_BPS);
        amountIn = (numerator / denominator) + 1;
    }

    /**
     * @notice 按预先计算好的报价沿路径逐跳执行交换。
     * @param amounts 路径上每一跳的数量数组。
     * @param path 兑换路径。
     * @param _to 最终接收地址。
     */
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? _getPairOrRevert(output, path[i + 2]) : _to;
            IFluxSwapPair(_getPairOrRevert(input, output)).swap(
                amount0Out,
                amount1Out,
                to,
                new bytes(0)
            );
        }
    }

    /**
     * @notice 为 ERC20/ERC20 自动建池并添加流动性。
     * @param params 添加流动性所需参数结构体。
     * @return amountA 实际投入的代币 A 数量。
     * @return amountB 实际投入的代币 B 数量。
     * @return liquidity 实际铸造的 LP 数量。
     */
    function _addLiquidity(
        AddLiquidityParams memory params
    ) internal returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        if (IFluxSwapFactory(factory).getPair(params.tokenA, params.tokenB) == address(0)) {
            IFluxSwapFactory(factory).createPair(params.tokenA, params.tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = _getReserves(params.tokenA, params.tokenB);

        if (reserveA == 0 && reserveB == 0) {
            require(params.amountADesired >= params.amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
            require(params.amountBDesired >= params.amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
            (amountA, amountB) = (params.amountADesired, params.amountBDesired);
        } else {
            uint256 amountBOptimal = quote(params.amountADesired, reserveA, reserveB);
            if (amountBOptimal <= params.amountBDesired) {
                require(params.amountADesired >= params.amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
                require(amountBOptimal >= params.amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (params.amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(params.amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= params.amountADesired);
                require(amountAOptimal >= params.amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
                require(params.amountBDesired >= params.amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountAOptimal, params.amountBDesired);
            }
        }

        address pair = IFluxSwapFactory(factory).getPair(params.tokenA, params.tokenB);
        TransferHelper.safeTransferFrom(params.tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(params.tokenB, msg.sender, pair, amountB);
        liquidity = IFluxSwapPair(pair).mint(params.to);
    }

    /**
     * @notice 为 ERC20/ETH 自动建池并添加流动性。
     * @param params 添加流动性所需参数结构体。
     * @return amountToken 实际投入的 ERC20 数量。
     * @return amountETH 实际投入的 ETH 数量。
     * @return liquidity 实际铸造的 LP 数量。
     */
    function _addLiquidityETH(
        AddLiquidityETHParams memory params
    ) internal returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        if (IFluxSwapFactory(factory).getPair(params.token, WETH) == address(0)) {
            IFluxSwapFactory(factory).createPair(params.token, WETH);
        }

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(params.token, WETH);

        if (reserveToken == 0 && reserveETH == 0) {
            require(params.amountTokenDesired >= params.amountTokenMin, "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT");
            require(params.value >= params.amountETHMin, "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT");
            (amountToken, amountETH) = (params.amountTokenDesired, params.value);
        } else {
            uint256 amountETHOptimal = quote(params.amountTokenDesired, reserveToken, reserveETH);
            if (amountETHOptimal <= params.value) {
                require(params.amountTokenDesired >= params.amountTokenMin, "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT");
                require(amountETHOptimal >= params.amountETHMin, "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT");
                (amountToken, amountETH) = (params.amountTokenDesired, amountETHOptimal);
            } else {
                uint256 amountTokenOptimal = quote(params.value, reserveETH, reserveToken);
                assert(amountTokenOptimal <= params.amountTokenDesired);
                require(amountTokenOptimal >= params.amountTokenMin, "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT");
                require(params.value >= params.amountETHMin, "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT");
                (amountToken, amountETH) = (amountTokenOptimal, params.value);
            }
        }

        address pair = IFluxSwapFactory(factory).getPair(params.token, WETH);
        TransferHelper.safeTransferFrom(params.token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        assert(IWETH(WETH).transfer(pair, amountETH));
        liquidity = IFluxSwapPair(pair).mint(params.to);

        if (params.value > amountETH) {
            TransferHelper.safeTransferETH(msg.sender, params.value - amountETH);
        }
    }

    /**
     * @notice 执行 ERC20/ERC20 流动性移除并校验最小回收数量。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountAMin 代币 A 最小回收量。
     * @param amountBMin 代币 B 最小回收量。
     * @param to 接收底层资产的地址。
     * @return amountA 实际回收的代币 A 数量。
     * @return amountB 实际回收的代币 B 数量。
     */
    function _removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) internal returns (uint256 amountA, uint256 amountB) {
        address pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);
        TransferHelper.safeTransferFrom(pair, msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IFluxSwapPair(pair).burn(to);
        (address token0, ) = sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
    }

    /**
     * @notice 执行 ERC20/ETH 流动性移除并把 WETH 解包成 ETH。
     * @param token ERC20 代币地址。
     * @param liquidity 需要销毁的 LP 数量。
     * @param amountTokenMin ERC20 最小回收量。
     * @param amountETHMin ETH 最小回收量。
     * @param to 接收资产的地址。
     * @return amountToken 实际回收的 ERC20 数量。
     * @return amountETH 实际回收的 ETH 数量。
     */
    function _removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to
    ) internal returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = _removeLiquidity(token, WETH, liquidity, amountTokenMin, amountETHMin, address(this));
        TransferHelper.safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }

    /**
     * @notice 先通过 Permit 完成授权，再移除 ERC20/ERC20 流动性。
     * @param params Permit 模式下移除流动性的参数结构体。
     * @return amountA 实际回收的代币 A 数量。
     * @return amountB 实际回收的代币 B 数量。
     */
    function _removeLiquidityWithPermit(
        RemoveLiquidityPermitParams memory params
    ) internal returns (uint256 amountA, uint256 amountB) {
        _permitLiquidity(
            params.tokenA,
            params.tokenB,
            params.liquidity,
            params.approveMax,
            params.deadline,
            params.v,
            params.r,
            params.s
        );

        return _removeLiquidity(
            params.tokenA,
            params.tokenB,
            params.liquidity,
            params.amountAMin,
            params.amountBMin,
            params.to
        );
    }

    /**
     * @notice 先通过 Permit 完成授权，再移除 ERC20/ETH 流动性。
     * @param params Permit 模式下移除流动性的参数结构体。
     * @return amountToken 实际回收的 ERC20 数量。
     * @return amountETH 实际回收的 ETH 数量。
     */
    function _removeLiquidityETHWithPermit(
        RemoveLiquidityETHPermitParams memory params
    ) internal returns (uint256 amountToken, uint256 amountETH) {
        _permitLiquidity(
            params.token,
            WETH,
            params.liquidity,
            params.approveMax,
            params.deadline,
            params.v,
            params.r,
            params.s
        );

        return _removeLiquidityETH(
            params.token,
            params.liquidity,
            params.amountTokenMin,
            params.amountETHMin,
            params.to
        );
    }

    /**
     * @notice 使用 Pair 的 Permit 为 Router 获取 LP 操作授权。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @param liquidity 需要授权的 LP 数量。
     * @param approveMax 是否授权为无限额度。
     * @param deadline Permit 截止时间。
     * @param v Permit 签名 `v` 分量。
     * @param r Permit 签名 `r` 分量。
     * @param s Permit 签名 `s` 分量。
     */
    function _permitLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        bool approveMax,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        address pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IFluxSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
    }

    /**
     * @notice 查询指定交易对按输入顺序排列的储备值。
     * @param tokenA 输入顺序中的代币 A。
     * @param tokenB 输入顺序中的代币 B。
     * @return reserveA 按 `tokenA` 顺序返回的储备。
     * @return reserveB 按 `tokenB` 顺序返回的储备。
     */
    function _getReserves(address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        address pair = _getPairOrRevert(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IFluxSwapPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    /**
     * @notice 获取交易对地址，不存在时直接回退。
     * @param tokenA 代币 A 地址。
     * @param tokenB 代币 B 地址。
     * @return pair 已存在的 Pair 地址。
     */
    function _getPairOrRevert(address tokenA, address tokenB) internal view returns (address pair) {
        pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "FluxSwapRouter: PAIR_NOT_FOUND");
    }

    /**
     * @notice 对两种代币地址进行标准排序。
     * @param tokenA 待排序代币 A。
     * @param tokenB 待排序代币 B。
     * @return token0 排序后较小的地址。
     * @return token1 排序后较大的地址。
     */
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "FluxSwapRouter: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "FluxSwapRouter: ZERO_ADDRESS");
    }
}
