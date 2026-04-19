import { defineConfig } from '@wagmi/cli'
import { actions, hardhat, react } from '@wagmi/cli/plugins'

const contractNames = [
  'FluxBuybackExecutor',
  'FluxMultiPoolManager',
  'FluxPoolFactory',
  'FluxRevenueDistributor',
  'FluxSignedOrderSettlement',
  'FluxSwapERC20',
  'FluxSwapFactory',
  'FluxSwapLPStakingPool',
  'FluxSwapPair',
  'FluxSwapRouter',
  'FluxSwapStakingRewards',
  'FluxSwapTreasury',
  'FluxToken',
] as const

export default defineConfig(
  contractNames.map((contractName) => ({
    out: `src/lib/contracts/generated/${contractName}.ts`,
    plugins: [
      hardhat({
        project: '../contracts',
        commands: {
          clean: false,
          build: false,
          rebuild: false,
        },
        include: [`${contractName}.json`],
        exclude: ['build-info/**', '*.dbg.json', 'mocks/**'],
      }),
      actions({
        overridePackageName: 'wagmi',
      }),
      react(),
    ],
  })),
)
