'use client';

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
