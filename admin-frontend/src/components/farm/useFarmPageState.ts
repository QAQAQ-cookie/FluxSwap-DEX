'use client';

import { useState } from 'react';

import type { FarmPoolEdits, ResultModalState } from '@/components/farm/FarmTypes';

export function useFarmPageState() {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [lpManualMode, setLpManualMode] = useState(false);
  const [singleManualMode, setSingleManualMode] = useState(false);
  const [resultModal, setResultModal] = useState<ResultModalState>(null);

  const [lpTokenAddress, setLpTokenAddress] = useState('');
  const [lpAllocPoint, setLpAllocPoint] = useState('100');
  const [lpActive, setLpActive] = useState(true);

  const [singleTokenAddress, setSingleTokenAddress] = useState('');
  const [singleAllocPoint, setSingleAllocPoint] = useState('100');
  const [singleActive, setSingleActive] = useState(true);

  const [rewardAmount, setRewardAmount] = useState('');
  const [poolEdits, setPoolEdits] = useState<FarmPoolEdits>({});

  return {
    mounted,
    setMounted,
    searchQuery,
    setSearchQuery,
    activeOnly,
    setActiveOnly,
    lpManualMode,
    setLpManualMode,
    singleManualMode,
    setSingleManualMode,
    resultModal,
    setResultModal,
    lpTokenAddress,
    setLpTokenAddress,
    lpAllocPoint,
    setLpAllocPoint,
    lpActive,
    setLpActive,
    singleTokenAddress,
    setSingleTokenAddress,
    singleAllocPoint,
    setSingleAllocPoint,
    singleActive,
    setSingleActive,
    rewardAmount,
    setRewardAmount,
    poolEdits,
    setPoolEdits,
  };
}
