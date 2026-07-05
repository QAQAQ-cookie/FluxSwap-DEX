import type { Address, Hex } from 'viem';
import type { UseWriteContractReturnType } from 'wagmi';

import type { ActiveAction, ResultModalState } from '@/components/farm/FarmTypes';

export type WriteContractAsync = UseWriteContractReturnType['writeContractAsync'];

export type RunFarmTransaction = (action: ActiveAction, title: string, tx: () => Promise<Address | Hex>) => void;

export type SetFarmResultModal = (state: ResultModalState) => void;
