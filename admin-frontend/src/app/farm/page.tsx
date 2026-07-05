'use client';

import { FarmAccessPanel } from '@/components/farm/FarmAccessPanel';
import { FarmCreatePoolCards } from '@/components/farm/FarmCreatePoolCards';
import { FarmPageHeader } from '@/components/farm/FarmPageHeader';
import { ResultModal } from '@/components/farm/FarmPrimitives';
import { FarmRewardDistributionCard } from '@/components/farm/FarmRewardDistributionCard';
import { FarmStatusCards } from '@/components/farm/FarmStatusCards';
import { FarmTable } from '@/components/farm/FarmTable';
import { useFarmPageController } from '@/components/farm/useFarmPageController';

export default function AdminFarmPage() {
  const {
    pageState,
    environment,
    adminInfo,
    farms,
    lpPairOptions,
    singleTokenOptions,
    loading,
    error,
    lastUpdatedAt,
    loadAdminData,
    activeAction,
    connectButton,
    isFactoryOwner,
    isManagerOwner,
    isManagerOperator,
    canCreatePool,
    canUpdatePool,
    canDistribute,
    activeFarmCount,
    dailySpendRemaining,
    distributionBlockReason,
    canSubmitDistribution,
    filteredFarms,
    handleCreateLpPool,
    handleCreateSinglePool,
    handleDistributeRewards,
    handleUpdatePool,
  } = useFarmPageController();

  return (
    <>
      <ResultModal state={pageState.resultModal} onClose={() => pageState.setResultModal(null)} />

      <div className="space-y-8">
        <FarmPageHeader
          error={error}
          loading={loading}
          lastUpdatedAt={lastUpdatedAt}
          showConnectButton={!pageState.mounted || !environment.isConnected}
          connectButton={connectButton}
          onRefresh={() => void loadAdminData()}
        />

        <FarmStatusCards adminInfo={adminInfo} activeFarmCount={activeFarmCount} />

        <FarmAccessPanel
          adminInfo={adminInfo}
          isFactoryOwner={isFactoryOwner}
          isManagerOwner={isManagerOwner}
          isManagerOperator={isManagerOperator}
        />

        <FarmCreatePoolCards
          canCreatePool={canCreatePool}
          lpManualMode={pageState.lpManualMode}
          lpTokenAddress={pageState.lpTokenAddress}
          lpAllocPoint={pageState.lpAllocPoint}
          lpActive={pageState.lpActive}
          lpPairOptions={lpPairOptions}
          lpBusy={activeAction === 'create-lp'}
          singleManualMode={pageState.singleManualMode}
          singleTokenAddress={pageState.singleTokenAddress}
          singleAllocPoint={pageState.singleAllocPoint}
          singleActive={pageState.singleActive}
          singleTokenOptions={singleTokenOptions}
          singleBusy={activeAction === 'create-single'}
          onLpManualModeChange={pageState.setLpManualMode}
          onLpTokenAddressChange={pageState.setLpTokenAddress}
          onLpAllocPointChange={pageState.setLpAllocPoint}
          onLpActiveChange={pageState.setLpActive}
          onCreateLpPool={handleCreateLpPool}
          onSingleManualModeChange={pageState.setSingleManualMode}
          onSingleTokenAddressChange={pageState.setSingleTokenAddress}
          onSingleAllocPointChange={pageState.setSingleAllocPoint}
          onSingleActiveChange={pageState.setSingleActive}
          onCreateSinglePool={handleCreateSinglePool}
        />

        <FarmRewardDistributionCard
          adminInfo={adminInfo}
          rewardAmount={pageState.rewardAmount}
          canDistribute={canDistribute}
          canSubmitDistribution={canSubmitDistribution}
          distributionBlockReason={distributionBlockReason}
          dailySpendRemaining={dailySpendRemaining}
          distributeBusy={activeAction === 'distribute'}
          onRewardAmountChange={pageState.setRewardAmount}
          onDistributeRewards={handleDistributeRewards}
        />

        <FarmTable
          adminInfo={adminInfo}
          farms={farms}
          filteredFarms={filteredFarms}
          loading={loading}
          searchQuery={pageState.searchQuery}
          activeOnly={pageState.activeOnly}
          poolEdits={pageState.poolEdits}
          canUpdatePool={canUpdatePool}
          activeAction={activeAction}
          onSearchQueryChange={pageState.setSearchQuery}
          onActiveOnlyChange={pageState.setActiveOnly}
          onPoolEditsChange={pageState.setPoolEdits}
          onUpdatePool={handleUpdatePool}
        />
      </div>
    </>
  );
}
