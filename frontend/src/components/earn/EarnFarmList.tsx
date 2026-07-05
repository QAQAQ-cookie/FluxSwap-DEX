import type { Address } from 'viem';

import {
  EarnFarmListHeaderRow,
  EarnFarmListNotice,
  EarnFarmListRow,
  EarnFarmListToolbar,
} from './EarnFarmListParts';
import type { EarnFarmListViewModel } from './EarnTypes';

type EarnFarmListProps = {
  isZh: boolean;
  viewModel: EarnFarmListViewModel;
  setSearchQuery: (value: string) => void;
  setStakedOnly: (updater: (current: boolean) => boolean) => void;
  onSelectFarm: (poolAddress: Address) => void;
};

export function EarnFarmList({
  isZh,
  viewModel,
  setSearchQuery,
  setStakedOnly,
  onSelectFarm,
}: EarnFarmListProps) {
  const {
    supportedChain,
    managerAddress,
    farmLoading,
    farmError,
    filteredFarms,
    searchQuery,
    stakedOnly,
  } = viewModel;

  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
      <EarnFarmListToolbar
        isZh={isZh}
        searchQuery={searchQuery}
        stakedOnly={stakedOnly}
        setSearchQuery={setSearchQuery}
        setStakedOnly={setStakedOnly}
      />

      {!supportedChain || !managerAddress ? (
        <EarnFarmListNotice>{isZh ? '当前网络暂未配置农场合约' : 'Farm contracts are not configured on this network'}</EarnFarmListNotice>
      ) : farmLoading ? (
        <EarnFarmListNotice isLoading>{isZh ? '正在加载农场数据...' : 'Loading farm data...'}</EarnFarmListNotice>
      ) : farmError ? (
        <EarnFarmListNotice variant="error">{farmError}</EarnFarmListNotice>
      ) : filteredFarms.length === 0 ? (
        <EarnFarmListNotice>{isZh ? '暂无农场' : 'No farms to display'}</EarnFarmListNotice>
      ) : (
        <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-black/5 dark:border-white/10">
          <EarnFarmListHeaderRow isZh={isZh} />

          <div className="divide-y divide-black/5 dark:divide-white/10">
            {filteredFarms.map((farm) => (
              <EarnFarmListRow key={farm.poolAddress} isZh={isZh} farm={farm} onSelectFarm={onSelectFarm} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
