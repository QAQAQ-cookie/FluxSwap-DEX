'use client';

import { Coins } from 'lucide-react';

import { Card, SectionPlaceholder } from '@/components/AdminPrimitives';
import { TokensFilterBar } from '@/components/tokens/TokensFilterBar';
import { TokensOverviewPanels } from '@/components/tokens/TokensOverviewPanels';
import { TokensSummaryCards } from '@/components/tokens/TokensSummaryCards';
import { TokensTable } from '@/components/tokens/TokensTable';
import { useTokensPageController } from '@/components/tokens/useTokensPageController';

type TokensPageBodyProps = {
  controller: ReturnType<typeof useTokensPageController>;
};

export function TokensPageBody({ controller }: TokensPageBodyProps) {
  const {
    environment,
    pageState,
    matchedTokenCount,
    allowedTokenCount,
    swapPairCount,
    singlePoolCount,
    rewardTokenCount,
    pendingTreasuryRows,
    mismatchRows,
    filteredRows,
    mismatchTokenCount,
    activeUsageTokenCount,
  } = controller;

  if (!environment.supportedChain) {
    return (
      <Card className="overflow-hidden">
        <SectionPlaceholder
          icon={<Coins size={20} />}
          title="当前网络不支持代币管理"
          description="切换到已部署 FluxSwap 管理合约的网络后，再查看代币白名单和用途状态。"
          className="min-h-[320px]"
        />
      </Card>
    );
  }

  return (
    <>
      <TokensSummaryCards
        configuredTokenCount={environment.configuredTokens.length}
        matchedTokenCount={matchedTokenCount}
        totalTokenCount={pageState.tokenRows.length}
        allowedTokenCount={allowedTokenCount}
        mismatchTokenCount={mismatchTokenCount}
        activeUsageTokenCount={activeUsageTokenCount}
      />

      <TokensOverviewPanels
        swapPairCount={swapPairCount}
        singlePoolCount={singlePoolCount}
        rewardTokenCount={rewardTokenCount}
        pendingTreasuryCount={pendingTreasuryRows.length}
        mismatchRows={mismatchRows}
        pendingTreasuryRows={pendingTreasuryRows}
      />

      <TokensFilterBar
        query={pageState.query}
        filterMode={pageState.filterMode}
        sortField={pageState.sortField}
        sortDirection={pageState.sortDirection}
        onQueryChange={pageState.setQuery}
        onFilterModeChange={pageState.setFilterMode}
        onSortFieldChange={pageState.setSortField}
        onSortDirectionToggle={() =>
          pageState.setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
        }
      />

      <TokensTable loading={pageState.loading} tokenRows={filteredRows} />
    </>
  );
}
