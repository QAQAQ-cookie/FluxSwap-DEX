'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';

import type { TreasuryOperationMetadata } from '@/components/treasury/TreasuryTypes';
import {
  loadTreasuryOperationMetadata,
  saveTreasuryOperationMetadata,
} from '@/components/treasury/TreasuryUtils';

type UseTreasuryMetadataStoreParams = {
  chainId: number;
  mounted: boolean;
  treasuryAddress?: Address;
};

export function useTreasuryMetadataStore({
  chainId,
  mounted,
  treasuryAddress,
}: UseTreasuryMetadataStoreParams) {
  const [operationMetadataById, setOperationMetadataById] = useState<Record<Hex, TreasuryOperationMetadata>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!mounted || !treasuryAddress) {
        setOperationMetadataById({});
        return;
      }

      setOperationMetadataById(loadTreasuryOperationMetadata(chainId, treasuryAddress));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [chainId, mounted, treasuryAddress]);

  const persistMetadata = useCallback(
    (metadata: TreasuryOperationMetadata) => {
      if (!treasuryAddress) {
        return;
      }

      setOperationMetadataById((currentMetadata) => {
        const nextMetadata = {
          ...currentMetadata,
          [metadata.operationId]: metadata,
        };
        saveTreasuryOperationMetadata(chainId, treasuryAddress, nextMetadata);
        return nextMetadata;
      });
    },
    [chainId, treasuryAddress],
  );

  const removeMetadata = useCallback(
    (operationId: Hex) => {
      if (!treasuryAddress) {
        return;
      }

      setOperationMetadataById((currentMetadata) => {
        if (!(operationId in currentMetadata)) {
          return currentMetadata;
        }

        const nextMetadata = { ...currentMetadata };
        delete nextMetadata[operationId];
        saveTreasuryOperationMetadata(chainId, treasuryAddress, nextMetadata);
        return nextMetadata;
      });
    },
    [chainId, treasuryAddress],
  );

  return {
    operationMetadataById,
    persistMetadata,
    removeMetadata,
  };
}
