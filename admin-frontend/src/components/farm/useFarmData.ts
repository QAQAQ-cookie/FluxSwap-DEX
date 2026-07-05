'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';

import type { FarmPoolEdits, LpPairOption, SingleTokenOption, AdminInfo, FarmRow } from '@/components/farm/FarmTypes';
import { REFRESH_INTERVAL_MS, sameAddress } from '@/components/farm/FarmUtils';
import { readFarmAdminSnapshot } from '@/components/farm/FarmDataReaders';
import type { FarmPublicClient } from '@/components/farm/FarmReaderTypes';
import type { AdminTokenOption } from '@/config/tokens';
import { formatErrorMessage } from '@/lib/errors';

type UseFarmDataParams = {
  publicClient?: FarmPublicClient;
  supportedChain: boolean;
  managerAddress?: Address;
  factoryAddress?: Address;
  swapFactoryAddress?: Address;
  wrappedNativeAddress?: Address;
  configuredSingleTokens: AdminTokenOption[];
  lpManualMode: boolean;
  singleManualMode: boolean;
  setLpTokenAddress: (updater: (current: string) => string) => void;
  setSingleTokenAddress: (updater: (current: string) => string) => void;
  setPoolEdits: (updater: (current: FarmPoolEdits) => FarmPoolEdits) => void;
};

export function useFarmData({
  publicClient,
  supportedChain,
  managerAddress,
  factoryAddress,
  swapFactoryAddress,
  wrappedNativeAddress,
  configuredSingleTokens,
  lpManualMode,
  singleManualMode,
  setLpTokenAddress,
  setSingleTokenAddress,
  setPoolEdits,
}: UseFarmDataParams) {
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [farms, setFarms] = useState<FarmRow[]>([]);
  const [lpPairOptions, setLpPairOptions] = useState<LpPairOption[]>([]);
  const [singleTokenOptions, setSingleTokenOptions] = useState<SingleTokenOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadAdminData = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!publicClient || !supportedChain || !managerAddress || !factoryAddress) {
        setAdminInfo(null);
        setFarms([]);
        setLoading(false);
        setError(
          supportedChain
            ? '当前网络缺少农场管理合约配置，请检查部署和前端配置。'
            : '当前网络还未接入 FluxSwap 管理端。',
        );
        return;
      }

      if (!background) {
        setLoading(true);
      }
      setError(null);

      try {
        const snapshot = await readFarmAdminSnapshot({
          publicClient,
          managerAddress,
          factoryAddress,
          swapFactoryAddress,
          wrappedNativeAddress,
          configuredSingleTokens,
        });

        setAdminInfo(snapshot.adminInfo);
        setFarms(snapshot.farms);
        setLpPairOptions(snapshot.lpPairOptions);
        setSingleTokenOptions(snapshot.singleTokenOptions);
        syncSelectedLpToken({ lpManualMode, lpPairOptions: snapshot.lpPairOptions, setLpTokenAddress });
        syncSelectedSingleToken({
          singleManualMode,
          singleTokenOptions: snapshot.singleTokenOptions,
          setSingleTokenAddress,
        });
        syncPoolEdits({ farms: snapshot.farms, setPoolEdits });
        setLastUpdatedAt(new Date());
      } catch (loadError) {
        setError(formatErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [
      configuredSingleTokens,
      factoryAddress,
      lpManualMode,
      managerAddress,
      publicClient,
      setLpTokenAddress,
      setPoolEdits,
      setSingleTokenAddress,
      singleManualMode,
      supportedChain,
      swapFactoryAddress,
      wrappedNativeAddress,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAdminData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAdminData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAdminData({ background: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadAdminData]);

  return {
    adminInfo,
    farms,
    lpPairOptions,
    singleTokenOptions,
    loading,
    error,
    lastUpdatedAt,
    loadAdminData,
  };
}

function syncSelectedLpToken({
  lpManualMode,
  lpPairOptions,
  setLpTokenAddress,
}: {
  lpManualMode: boolean;
  lpPairOptions: LpPairOption[];
  setLpTokenAddress: (updater: (current: string) => string) => void;
}) {
  setLpTokenAddress((current) => {
    if (current && (lpManualMode || lpPairOptions.some((option) => sameAddress(option.address, current)))) {
      return current;
    }

    return lpPairOptions.find((option) => !option.alreadyFarmed)?.address ?? lpPairOptions[0]?.address ?? '';
  });
}

function syncSelectedSingleToken({
  singleManualMode,
  singleTokenOptions,
  setSingleTokenAddress,
}: {
  singleManualMode: boolean;
  singleTokenOptions: SingleTokenOption[];
  setSingleTokenAddress: (updater: (current: string) => string) => void;
}) {
  setSingleTokenAddress((current) => {
    if (current && (singleManualMode || singleTokenOptions.some((option) => sameAddress(option.address, current)))) {
      return current;
    }

    return singleTokenOptions.find((option) => !option.alreadyFarmed)?.address ?? singleTokenOptions[0]?.address ?? '';
  });
}

function syncPoolEdits({
  farms,
  setPoolEdits,
}: {
  farms: FarmRow[];
  setPoolEdits: (updater: (current: FarmPoolEdits) => FarmPoolEdits) => void;
}) {
  setPoolEdits((current) => {
    const next = { ...current };
    for (const farm of farms) {
      if (!next[farm.pid]) {
        next[farm.pid] = {
          allocPoint: farm.allocPoint.toString(),
          active: farm.active,
        };
      }
    }

    return next;
  });
}
