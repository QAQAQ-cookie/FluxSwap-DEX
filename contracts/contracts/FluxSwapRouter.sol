// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IFluxSwapRouter.sol";
import "../interfaces/IFluxSwapFactory.sol";
import "../interfaces/IFluxSwapPair.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IWETH.sol";
import "../libraries/TransferHelper.sol";

contract FluxSwapRouter is IFluxSwapRouter {
    address public immutable override factory;
    address public immutable override WETH;

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

    struct AddLiquidityParams {
        address tokenA;
        address tokenB;
        uint256 amountADesired;
        uint256 amountBDesired;
        uint256 amountAMin;
        uint256 amountBMin;
        address to;
    }

    struct AddLiquidityETHParams {
        address token;
        uint256 amountTokenDesired;
        uint256 amountTokenMin;
        uint256 amountETHMin;
        address to;
        uint256 value;
    }

    // 仅在 WETH 解包回 ETH 时接收原生 ETH，避免误转资金留在 Router 中。
    receive() external payable {
        assert(msg.sender == WETH);
    }

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "FluxSwapRouter: EXPIRED");
        _;
    }

    constructor(address _factory, address _WETH) {
        require(_factory != address(0), "FluxSwapRouter: ZERO_ADDRESS");
        require(_WETH != address(0), "FluxSwapRouter: ZERO_ADDRESS");
        factory = _factory;
        WETH = _WETH;
    }

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

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public override ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        return _removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to);
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public override ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        return _removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to);
    }

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

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) {
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amountIn);
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >= amountOutMin,
            "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"
        );
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable override ensure(deadline) {
        require(path[0] == WETH, "FluxSwapRouter: INVALID_PATH");
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        IWETH(WETH).deposit{value: msg.value}();
        assert(IWETH(WETH).transfer(_getPairOrRevert(path[0], path[1]), msg.value));
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >= amountOutMin,
            "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"
        );
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external override ensure(deadline) {
        require(path[path.length - 1] == WETH, "FluxSwapRouter: INVALID_PATH");
        address pair = _getPairOrRevert(path[0], path[1]);
        TransferHelper.safeTransferFrom(path[0], msg.sender, pair, amountIn);
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint256 amountOut = IERC20(WETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure override returns (uint256 amountB) {
        require(amountA > 0, "FluxSwapRouter: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        amountB = (amountA * reserveB) / reserveA;
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountOut) {
        require(amountIn > 0, "FluxSwapRouter: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountIn) {
        require(amountOut > 0, "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "FluxSwapRouter: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

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

    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            address pairAddress = _getPairOrRevert(input, output);
            IFluxSwapPair pair = IFluxSwapPair(pairAddress);
            uint256 amountOutput;
            uint256 amount0Out;
            uint256 amount1Out;
            {
                (address token0, ) = sortTokens(input, output);
                (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) =
                    input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                // 带税代币的实际到账数量可能小于 amountIn，因此这里通过 Pair 余额变化反推真实输入量。
                uint256 amountInput = IERC20(input).balanceOf(pairAddress) - reserveInput;
                amountOutput = getAmountOut(amountInput, reserveInput, reserveOutput);
                (amount0Out, amount1Out) =
                    input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
            }
            address to = i < path.length - 2 ? _getPairOrRevert(output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function _addLiquidity(
        AddLiquidityParams memory params
    ) internal returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        if (IFluxSwapFactory(factory).getPair(params.tokenA, params.tokenB) == address(0)) {
            IFluxSwapFactory(factory).createPair(params.tokenA, params.tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = _getReserves(params.tokenA, params.tokenB);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (params.amountADesired, params.amountBDesired);
        } else {
            uint256 amountBOptimal = quote(params.amountADesired, reserveA, reserveB);
            if (amountBOptimal <= params.amountBDesired) {
                require(amountBOptimal >= params.amountBMin, "FluxSwapRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (params.amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(params.amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= params.amountADesired);
                require(amountAOptimal >= params.amountAMin, "FluxSwapRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, params.amountBDesired);
            }
        }

        address pair = IFluxSwapFactory(factory).getPair(params.tokenA, params.tokenB);
        TransferHelper.safeTransferFrom(params.tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(params.tokenB, msg.sender, pair, amountB);
        liquidity = IFluxSwapPair(pair).mint(params.to);
    }

    function _addLiquidityETH(
        AddLiquidityETHParams memory params
    ) internal returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        if (IFluxSwapFactory(factory).getPair(params.token, WETH) == address(0)) {
            IFluxSwapFactory(factory).createPair(params.token, WETH);
        }

        (uint256 reserveToken, uint256 reserveETH) = _getReserves(params.token, WETH);

        if (reserveToken == 0 && reserveETH == 0) {
            (amountToken, amountETH) = (params.amountTokenDesired, params.value);
        } else {
            uint256 amountETHOptimal = quote(params.amountTokenDesired, reserveToken, reserveETH);
            if (amountETHOptimal <= params.value) {
                require(amountETHOptimal >= params.amountETHMin, "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT");
                (amountToken, amountETH) = (params.amountTokenDesired, amountETHOptimal);
            } else {
                uint256 amountTokenOptimal = quote(params.value, reserveETH, reserveToken);
                assert(amountTokenOptimal <= params.amountTokenDesired);
                require(amountTokenOptimal >= params.amountTokenMin, "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT");
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

    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "FluxSwapRouter: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "FluxSwapRouter: ZERO_ADDRESS");
    }

    function _getReserves(address tokenA, address tokenB) internal view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        address pair = _getPairOrRevert(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IFluxSwapPair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _getPairOrRevert(address tokenA, address tokenB) internal view returns (address pair) {
        pair = IFluxSwapFactory(factory).getPair(tokenA, tokenB);
        // 用明确的 Router 错误替代底层调用失败，便于定位路径或交易对缺失问题。
        require(pair != address(0), "FluxSwapRouter: PAIR_NOT_FOUND");
    }

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
}
