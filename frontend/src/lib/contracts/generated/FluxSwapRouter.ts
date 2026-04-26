import {
  createReadContract,
  createWriteContract,
  createSimulateContract,
} from 'wagmi/codegen'

import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
} from 'wagmi/codegen'

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FluxSwapRouter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fluxSwapRouterAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_factory', internalType: 'address', type: 'address' },
      { name: '_WETH', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'WETH',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenA', internalType: 'address', type: 'address' },
      { name: 'tokenB', internalType: 'address', type: 'address' },
      { name: 'amountADesired', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBDesired', internalType: 'uint256', type: 'uint256' },
      { name: 'amountAMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'addLiquidity',
    outputs: [
      { name: 'amountA', internalType: 'uint256', type: 'uint256' },
      { name: 'amountB', internalType: 'uint256', type: 'uint256' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amountTokenDesired', internalType: 'uint256', type: 'uint256' },
      { name: 'amountTokenMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETHMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'addLiquidityETH',
    outputs: [
      { name: 'amountToken', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETH', internalType: 'uint256', type: 'uint256' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'factory',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveIn', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveOut', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getAmountIn',
    outputs: [{ name: 'amountIn', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveIn', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveOut', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'getAmountOut',
    outputs: [{ name: 'amountOut', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
    ],
    name: 'getAmountsIn',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountA', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveA', internalType: 'uint256', type: 'uint256' },
      { name: 'reserveB', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'quote',
    outputs: [{ name: 'amountB', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenA', internalType: 'address', type: 'address' },
      { name: 'tokenB', internalType: 'address', type: 'address' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
      { name: 'amountAMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'removeLiquidity',
    outputs: [
      { name: 'amountA', internalType: 'uint256', type: 'uint256' },
      { name: 'amountB', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
      { name: 'amountTokenMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETHMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'removeLiquidityETH',
    outputs: [
      { name: 'amountToken', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETH', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
      { name: 'amountTokenMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETHMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'approveMax', internalType: 'bool', type: 'bool' },
      { name: 'v', internalType: 'uint8', type: 'uint8' },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 's', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'removeLiquidityETHWithPermit',
    outputs: [
      { name: 'amountToken', internalType: 'uint256', type: 'uint256' },
      { name: 'amountETH', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'tokenA', internalType: 'address', type: 'address' },
      { name: 'tokenB', internalType: 'address', type: 'address' },
      { name: 'liquidity', internalType: 'uint256', type: 'uint256' },
      { name: 'amountAMin', internalType: 'uint256', type: 'uint256' },
      { name: 'amountBMin', internalType: 'uint256', type: 'uint256' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
      { name: 'approveMax', internalType: 'bool', type: 'bool' },
      { name: 'v', internalType: 'uint8', type: 'uint8' },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 's', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'removeLiquidityWithPermit',
    outputs: [
      { name: 'amountA', internalType: 'uint256', type: 'uint256' },
      { name: 'amountB', internalType: 'uint256', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapETHForExactTokens',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOutMin', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapExactETHForTokens',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'amountOutMin', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapExactTokensForETH',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountIn', internalType: 'uint256', type: 'uint256' },
      { name: 'amountOutMin', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'amountInMax', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapTokensForExactETH',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'amountOut', internalType: 'uint256', type: 'uint256' },
      { name: 'amountInMax', internalType: 'uint256', type: 'uint256' },
      { name: 'path', internalType: 'address[]', type: 'address[]' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'swapTokensForExactTokens',
    outputs: [
      { name: 'amounts', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'receive', stateMutability: 'payable' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Action
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const readFluxSwapRouter = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"WETH"`
 */
export const readFluxSwapRouterWeth = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'WETH',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"factory"`
 */
export const readFluxSwapRouterFactory = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'factory',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountIn"`
 */
export const readFluxSwapRouterGetAmountIn = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'getAmountIn',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountOut"`
 */
export const readFluxSwapRouterGetAmountOut = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'getAmountOut',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountsIn"`
 */
export const readFluxSwapRouterGetAmountsIn = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'getAmountsIn',
})

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountsOut"`
 */
export const readFluxSwapRouterGetAmountsOut = /*#__PURE__*/ createReadContract(
  { abi: fluxSwapRouterAbi, functionName: 'getAmountsOut' },
)

/**
 * Wraps __{@link readContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"quote"`
 */
export const readFluxSwapRouterQuote = /*#__PURE__*/ createReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'quote',
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const writeFluxSwapRouter = /*#__PURE__*/ createWriteContract({
  abi: fluxSwapRouterAbi,
})

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidity"`
 */
export const writeFluxSwapRouterAddLiquidity =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidity',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidityETH"`
 */
export const writeFluxSwapRouterAddLiquidityEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidityETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidity"`
 */
export const writeFluxSwapRouterRemoveLiquidity =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidity',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETH"`
 */
export const writeFluxSwapRouterRemoveLiquidityEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETHWithPermit"`
 */
export const writeFluxSwapRouterRemoveLiquidityEthWithPermit =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETHWithPermit',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityWithPermit"`
 */
export const writeFluxSwapRouterRemoveLiquidityWithPermit =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityWithPermit',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapETHForExactTokens"`
 */
export const writeFluxSwapRouterSwapEthForExactTokens =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapETHForExactTokens',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactETHForTokens"`
 */
export const writeFluxSwapRouterSwapExactEthForTokens =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactETHForTokens',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForETH"`
 */
export const writeFluxSwapRouterSwapExactTokensForEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const writeFluxSwapRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactETH"`
 */
export const writeFluxSwapRouterSwapTokensForExactEth =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactETH',
  })

/**
 * Wraps __{@link writeContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactTokens"`
 */
export const writeFluxSwapRouterSwapTokensForExactTokens =
  /*#__PURE__*/ createWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactTokens',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const simulateFluxSwapRouter = /*#__PURE__*/ createSimulateContract({
  abi: fluxSwapRouterAbi,
})

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidity"`
 */
export const simulateFluxSwapRouterAddLiquidity =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidity',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidityETH"`
 */
export const simulateFluxSwapRouterAddLiquidityEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidityETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidity"`
 */
export const simulateFluxSwapRouterRemoveLiquidity =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidity',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETH"`
 */
export const simulateFluxSwapRouterRemoveLiquidityEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETHWithPermit"`
 */
export const simulateFluxSwapRouterRemoveLiquidityEthWithPermit =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETHWithPermit',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityWithPermit"`
 */
export const simulateFluxSwapRouterRemoveLiquidityWithPermit =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityWithPermit',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapETHForExactTokens"`
 */
export const simulateFluxSwapRouterSwapEthForExactTokens =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapETHForExactTokens',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactETHForTokens"`
 */
export const simulateFluxSwapRouterSwapExactEthForTokens =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactETHForTokens',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForETH"`
 */
export const simulateFluxSwapRouterSwapExactTokensForEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const simulateFluxSwapRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactETH"`
 */
export const simulateFluxSwapRouterSwapTokensForExactEth =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactETH',
  })

/**
 * Wraps __{@link simulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactTokens"`
 */
export const simulateFluxSwapRouterSwapTokensForExactTokens =
  /*#__PURE__*/ createSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactTokens',
  })

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const useReadFluxSwapRouter = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapRouterAbi,
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"WETH"`
 */
export const useReadFluxSwapRouterWeth = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'WETH',
})

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"factory"`
 */
export const useReadFluxSwapRouterFactory = /*#__PURE__*/ createUseReadContract(
  { abi: fluxSwapRouterAbi, functionName: 'factory' },
)

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountIn"`
 */
export const useReadFluxSwapRouterGetAmountIn =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapRouterAbi,
    functionName: 'getAmountIn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountOut"`
 */
export const useReadFluxSwapRouterGetAmountOut =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapRouterAbi,
    functionName: 'getAmountOut',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountsIn"`
 */
export const useReadFluxSwapRouterGetAmountsIn =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapRouterAbi,
    functionName: 'getAmountsIn',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"getAmountsOut"`
 */
export const useReadFluxSwapRouterGetAmountsOut =
  /*#__PURE__*/ createUseReadContract({
    abi: fluxSwapRouterAbi,
    functionName: 'getAmountsOut',
  })

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"quote"`
 */
export const useReadFluxSwapRouterQuote = /*#__PURE__*/ createUseReadContract({
  abi: fluxSwapRouterAbi,
  functionName: 'quote',
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const useWriteFluxSwapRouter = /*#__PURE__*/ createUseWriteContract({
  abi: fluxSwapRouterAbi,
})

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidity"`
 */
export const useWriteFluxSwapRouterAddLiquidity =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidity',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidityETH"`
 */
export const useWriteFluxSwapRouterAddLiquidityEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidityETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidity"`
 */
export const useWriteFluxSwapRouterRemoveLiquidity =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidity',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETH"`
 */
export const useWriteFluxSwapRouterRemoveLiquidityEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETHWithPermit"`
 */
export const useWriteFluxSwapRouterRemoveLiquidityEthWithPermit =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETHWithPermit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityWithPermit"`
 */
export const useWriteFluxSwapRouterRemoveLiquidityWithPermit =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityWithPermit',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapETHForExactTokens"`
 */
export const useWriteFluxSwapRouterSwapEthForExactTokens =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapETHForExactTokens',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactETHForTokens"`
 */
export const useWriteFluxSwapRouterSwapExactEthForTokens =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactETHForTokens',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForETH"`
 */
export const useWriteFluxSwapRouterSwapExactTokensForEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const useWriteFluxSwapRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactETH"`
 */
export const useWriteFluxSwapRouterSwapTokensForExactEth =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactETH',
  })

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactTokens"`
 */
export const useWriteFluxSwapRouterSwapTokensForExactTokens =
  /*#__PURE__*/ createUseWriteContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactTokens',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__
 */
export const useSimulateFluxSwapRouter =
  /*#__PURE__*/ createUseSimulateContract({ abi: fluxSwapRouterAbi })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidity"`
 */
export const useSimulateFluxSwapRouterAddLiquidity =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidity',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"addLiquidityETH"`
 */
export const useSimulateFluxSwapRouterAddLiquidityEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'addLiquidityETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidity"`
 */
export const useSimulateFluxSwapRouterRemoveLiquidity =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidity',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETH"`
 */
export const useSimulateFluxSwapRouterRemoveLiquidityEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityETHWithPermit"`
 */
export const useSimulateFluxSwapRouterRemoveLiquidityEthWithPermit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityETHWithPermit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"removeLiquidityWithPermit"`
 */
export const useSimulateFluxSwapRouterRemoveLiquidityWithPermit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'removeLiquidityWithPermit',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapETHForExactTokens"`
 */
export const useSimulateFluxSwapRouterSwapEthForExactTokens =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapETHForExactTokens',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactETHForTokens"`
 */
export const useSimulateFluxSwapRouterSwapExactEthForTokens =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactETHForTokens',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForETH"`
 */
export const useSimulateFluxSwapRouterSwapExactTokensForEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapExactTokensForTokens"`
 */
export const useSimulateFluxSwapRouterSwapExactTokensForTokens =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapExactTokensForTokens',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactETH"`
 */
export const useSimulateFluxSwapRouterSwapTokensForExactEth =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactETH',
  })

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link fluxSwapRouterAbi}__ and `functionName` set to `"swapTokensForExactTokens"`
 */
export const useSimulateFluxSwapRouterSwapTokensForExactTokens =
  /*#__PURE__*/ createUseSimulateContract({
    abi: fluxSwapRouterAbi,
    functionName: 'swapTokensForExactTokens',
  })
