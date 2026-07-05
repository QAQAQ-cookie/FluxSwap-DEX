import { useState } from 'react';
import type { Address } from 'viem';

import type { EarnResultModalState } from './EarnTypes';

export function useEarnPageState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [stakedOnly, setStakedOnly] = useState(false);
  const [selectedFarmAddress, setSelectedFarmAddress] = useState<Address | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [resultModal, setResultModal] = useState<EarnResultModalState>(null);

  const selectFarm = (poolAddress: Address) => {
    setSelectedFarmAddress(poolAddress);
    setStakeAmount('');
    setWithdrawAmount('');
  };

  const resetFarmPanel = () => {
    setSelectedFarmAddress(null);
    setStakeAmount('');
    setWithdrawAmount('');
  };

  return {
    searchQuery,
    setSearchQuery,
    stakedOnly,
    setStakedOnly,
    selectedFarmAddress,
    stakeAmount,
    setStakeAmount,
    withdrawAmount,
    setWithdrawAmount,
    resultModal,
    setResultModal,
    selectFarm,
    resetFarmPanel,
  };
}

export type EarnPageState = ReturnType<typeof useEarnPageState>;
