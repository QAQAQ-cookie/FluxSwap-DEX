import { useCallback, useEffect, useState } from 'react';
import type { Address, PublicClient } from 'viem';

import type { getSwapTokenOptions } from '@/config/tokens';
import { fluxMultiPoolManagerAbi } from '@/lib/contracts';

import type { FarmRow } from './EarnTypes';
import { readEarnFarmRow } from './earnFarmLoader';
import { FARM_REFRESH_INTERVAL_MS } from './EarnUtils';

type UseEarnFarmsParams = {
  publicClient?: PublicClient;
  supportedChain: boolean;
  managerAddress?: Address;
  wrappedNativeAddress?: Address;
  knownTokens: ReturnType<typeof getSwapTokenOptions>;
  address?: Address;
  isConnected: boolean;
};

export function useEarnFarms({
  publicClient,
  supportedChain,
  managerAddress,
  wrappedNativeAddress,
  knownTokens,
  address,
  isConnected,
}: UseEarnFarmsParams) {
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [farmLoading, setFarmLoading] = useState(false);
  const [farmError, setFarmError] = useState<string | null>(null);

  const loadFarms = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!publicClient || !supportedChain || !managerAddress) {
        setFarms([]);
        setFarmLoading(false);
        setFarmError(null);
        return;
      }

      if (!background) {
        setFarmLoading(true);
      }
      setFarmError(null);

      try {
        const [poolLength, totalAllocPoint] = await Promise.all([
          publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'poolLength',
          }),
          publicClient.readContract({
            address: managerAddress,
            abi: fluxMultiPoolManagerAbi,
            functionName: 'totalAllocPoint',
          }),
        ]);

        const poolCount = Number(poolLength);
        const nextFarms = await Promise.all(
          Array.from({ length: poolCount }, (_, pid) =>
            readEarnFarmRow({
              publicClient,
              managerAddress,
              wrappedNativeAddress,
              knownTokens,
              address,
              isConnected,
              pid,
              totalAllocPoint,
            }),
          ),
        );

        setFarms(
          nextFarms.sort((left, right) => {
            if (left.active !== right.active) {
              return left.active ? -1 : 1;
            }
            if (left.stakedBalance !== right.stakedBalance) {
              return left.stakedBalance > right.stakedBalance ? -1 : 1;
            }
            return left.pid - right.pid;
          }),
        );
      } catch (error) {
        if (!background) {
          setFarms([]);
        }
        setFarmError(error instanceof Error ? error.message : 'Failed to load farms');
      } finally {
        if (!background) {
          setFarmLoading(false);
        }
      }
    },
    [address, isConnected, knownTokens, managerAddress, publicClient, supportedChain, wrappedNativeAddress],
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async (options?: { background?: boolean }) => {
      if (cancelled) {
        return;
      }

      await loadFarms(options);
    };

    void refresh();

    const refreshTimer = window.setInterval(() => {
      void refresh({ background: true });
    }, FARM_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [loadFarms]);

  return {
    farms,
    farmLoading,
    farmError,
    loadFarms,
  };
}
