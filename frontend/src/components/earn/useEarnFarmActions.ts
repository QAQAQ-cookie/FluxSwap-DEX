import { useState, type Dispatch, type SetStateAction } from 'react';
import { maxUint256, type Address, type PublicClient } from 'viem';
import { useWriteContract } from 'wagmi';

import { fluxSwapErc20Abi, fluxSwapStakingRewardsAbi } from '@/lib/contracts';

import {
  buildEarnFarmErrorState,
  buildEarnFarmSuccessState,
  shouldResetStakeAmount,
  shouldResetWithdrawAmount,
} from './EarnFarmActionFeedback';
import type { EarnExecutableFarmAction, EarnResultModalState, FarmAction, FarmRow } from './EarnTypes';
import { ZERO_BIGINT } from './EarnUtils';

type UseEarnFarmActionsParams = {
  isConnected: boolean;
  address?: Address;
  openConnectModal?: () => void;
  selectedFarm: FarmRow | null;
  publicClient?: PublicClient;
  parsedStakeAmount?: bigint;
  parsedWithdrawAmount?: bigint;
  chainId: number;
  localGasOverride: { gas?: bigint };
  isZh: boolean;
  loadFarms: (options?: { background?: boolean }) => Promise<void>;
  setStakeAmount: Dispatch<SetStateAction<string>>;
  setWithdrawAmount: Dispatch<SetStateAction<string>>;
  setResultModal: Dispatch<SetStateAction<EarnResultModalState>>;
};

type ExecuteEarnFarmActionParams = {
  action: EarnExecutableFarmAction;
  selectedFarm: FarmRow;
  parsedStakeAmount?: bigint;
  parsedWithdrawAmount?: bigint;
  chainId: number;
  localGasOverride: { gas?: bigint };
  writeContractAsync: ReturnType<typeof useWriteContract>['writeContractAsync'];
};

async function executeEarnFarmAction({
  action,
  selectedFarm,
  parsedStakeAmount,
  parsedWithdrawAmount,
  chainId,
  localGasOverride,
  writeContractAsync,
}: ExecuteEarnFarmActionParams): Promise<`0x${string}`> {
  if (action === 'approve') {
    return writeContractAsync({
      address: selectedFarm.stakingToken,
      abi: fluxSwapErc20Abi,
      functionName: 'approve',
      args: [selectedFarm.poolAddress, maxUint256],
      chainId,
      ...localGasOverride,
    });
  }

  if (action === 'stake') {
    if (!parsedStakeAmount || parsedStakeAmount <= ZERO_BIGINT) {
      throw new Error('invalid_stake_amount');
    }

    return writeContractAsync({
      address: selectedFarm.poolAddress,
      abi: fluxSwapStakingRewardsAbi,
      functionName: 'stake',
      args: [parsedStakeAmount],
      chainId,
      ...localGasOverride,
    });
  }

  if (action === 'withdraw') {
    if (!parsedWithdrawAmount || parsedWithdrawAmount <= ZERO_BIGINT) {
      throw new Error('invalid_withdraw_amount');
    }

    return writeContractAsync({
      address: selectedFarm.poolAddress,
      abi: fluxSwapStakingRewardsAbi,
      functionName: 'withdraw',
      args: [parsedWithdrawAmount],
      chainId,
      ...localGasOverride,
    });
  }

  if (action === 'claim') {
    return writeContractAsync({
      address: selectedFarm.poolAddress,
      abi: fluxSwapStakingRewardsAbi,
      functionName: 'getReward',
      args: [],
      chainId,
      ...localGasOverride,
    });
  }

  return writeContractAsync({
    address: selectedFarm.poolAddress,
    abi: fluxSwapStakingRewardsAbi,
    functionName: 'exit',
    args: [],
    chainId,
    ...localGasOverride,
  });
}

export function useEarnFarmActions({
  isConnected,
  address,
  openConnectModal,
  selectedFarm,
  publicClient,
  parsedStakeAmount,
  parsedWithdrawAmount,
  chainId,
  localGasOverride,
  isZh,
  loadFarms,
  setStakeAmount,
  setWithdrawAmount,
  setResultModal,
}: UseEarnFarmActionsParams) {
  const { writeContractAsync } = useWriteContract();
  const [activeAction, setActiveAction] = useState<FarmAction>(null);

  const runFarmAction = async (action: EarnExecutableFarmAction) => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    if (!selectedFarm || !publicClient) {
      return;
    }

    setResultModal(null);
    setActiveAction(action);

    try {
      const txHash = await executeEarnFarmAction({
        action,
        selectedFarm,
        parsedStakeAmount,
        parsedWithdrawAmount,
        chainId,
        localGasOverride,
        writeContractAsync,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error(isZh ? '链上交易未成功执行。' : 'The on-chain transaction was not successful.');
      }

      await loadFarms({ background: true });

      if (shouldResetStakeAmount(action)) {
        setStakeAmount('');
      }
      if (shouldResetWithdrawAmount(action)) {
        setWithdrawAmount('');
      }

      setResultModal(buildEarnFarmSuccessState(action, isZh));
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === 'invalid_stake_amount' || error.message === 'invalid_withdraw_amount')
      ) {
        return;
      }

      setResultModal(buildEarnFarmErrorState(error, isZh));
    } finally {
      setActiveAction(null);
    }
  };

  return {
    activeAction,
    runFarmAction,
  };
}
