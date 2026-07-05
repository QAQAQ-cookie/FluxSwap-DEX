'use client';

import { ConfirmModal, ResultModal } from '@/components/treasury/TreasuryModals';
import { TreasuryAccessPanel } from '@/components/treasury/TreasuryAccessPanel';
import { TreasuryAllocationCard } from '@/components/treasury/TreasuryAllocationCard';
import { TreasuryAssetTable } from '@/components/treasury/TreasuryAssetTable';
import { TreasuryGovernanceForm } from '@/components/treasury/TreasuryGovernanceForm';
import { TreasuryOperationsTable } from '@/components/treasury/TreasuryOperationsTable';
import { TreasuryPageHeader } from '@/components/treasury/TreasuryPageHeader';
import { TreasuryRiskNotice } from '@/components/treasury/TreasuryRiskNotice';
import { TreasuryStatusCards } from '@/components/treasury/TreasuryStatusCards';
import {
  ZERO_BIGINT,
  formatDuration,
  formatRatio,
  formatTokenAmount,
  formatUnixTime,
  getDailySpendRatio,
  getSpendBarClass,
  subtractFloor,
} from '@/components/treasury/TreasuryUtils';
import { useTreasuryPageController } from '@/components/treasury/useTreasuryPageController';

export default function TreasuryPage() {
  const {
    pageState,
    environment,
    treasuryInfo,
    tokenRows,
    operationRows,
    loading,
    error,
    loadTreasuryData,
    walletConnected,
    totalConfiguredAssets,
    allowedTokenCount,
    readyOperationCount,
    isMultisig,
    isGuardian,
    isOperator,
    effectiveSelectedTokenAddress,
    selectedToken,
    effectiveAllocationTokenAddress,
    selectedAllocationToken,
    canAllocate,
    activeAction,
    handleScheduleOperation,
    handlePauseToggle,
    handleAllocation,
    handleCancelOperation,
    handleExecuteOperation,
  } = useTreasuryPageController();

  return (
    <>
      <ResultModal state={pageState.resultModal} onClose={() => pageState.setResultModal(null)} />
      <ConfirmModal state={pageState.confirmModal} onClose={() => pageState.setConfirmModal(null)} />

      <div className="space-y-8">
        <TreasuryPageHeader loading={loading} error={error} onRefresh={() => void loadTreasuryData()} />

        <TreasuryStatusCards
          paused={treasuryInfo?.paused}
          minDelayLabel={formatDuration(treasuryInfo?.minDelay ?? ZERO_BIGINT)}
          totalConfiguredAssets={totalConfiguredAssets}
          allowedTokenCount={allowedTokenCount}
          operationCount={operationRows.length}
          readyOperationCount={readyOperationCount}
          pauseBusy={activeAction === 'pause' || activeAction === 'unpause'}
          onPauseToggle={handlePauseToggle}
        />

        <TreasuryAccessPanel
          treasuryAddress={treasuryInfo?.address}
          multisig={treasuryInfo?.multisig}
          guardian={treasuryInfo?.guardian}
          operator={treasuryInfo?.operator}
          walletConnected={walletConnected}
          walletAddress={environment.address}
          isMultisig={isMultisig}
          isGuardian={isGuardian}
          isOperator={isOperator}
          onConnect={environment.openConnectModal ?? undefined}
        />

        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <TreasuryGovernanceForm
            operationKind={pageState.operationKind}
            selectedTokenAddress={effectiveSelectedTokenAddress}
            selectedToken={selectedToken}
            tokens={environment.tokens}
            booleanValue={pageState.booleanValue}
            targetAddress={pageState.targetAddress}
            spenderAddress={pageState.spenderAddress}
            amountValue={pageState.amountValue}
            delaySeconds={pageState.delaySeconds}
            minDelayPlaceholder={treasuryInfo?.minDelay.toString() ?? '3600'}
            managerAddress={environment.managerAddress}
            newMinDelayValue={pageState.newMinDelayValue}
            withdrawAmountValue={pageState.withdrawAmountValue}
            withdrawRecipientAddress={pageState.withdrawRecipientAddress}
            active={activeAction === 'schedule'}
            walletConnected={walletConnected}
            isMultisig={isMultisig}
            onOperationKindChange={pageState.setOperationKind}
            onSelectedTokenChange={pageState.setSelectedTokenAddress}
            onBooleanValueChange={pageState.setBooleanValue}
            onTargetAddressChange={pageState.setTargetAddress}
            onSpenderAddressChange={pageState.setSpenderAddress}
            onAmountValueChange={pageState.setAmountValue}
            onDelaySecondsChange={pageState.setDelaySeconds}
            onNewMinDelayValueChange={pageState.setNewMinDelayValue}
            onWithdrawAmountValueChange={pageState.setWithdrawAmountValue}
            onWithdrawRecipientAddressChange={pageState.setWithdrawRecipientAddress}
            onSubmit={() => void handleScheduleOperation()}
          />

          <TreasuryAllocationCard
            tokenRows={tokenRows}
            selectedToken={selectedAllocationToken}
            selectedTokenAddress={effectiveAllocationTokenAddress}
            recipientAddress={pageState.allocationRecipientAddress}
            amountValue={pageState.allocationAmountValue}
            active={activeAction === 'allocate'}
            walletConnected={walletConnected}
            canAllocate={canAllocate}
            onTokenChange={pageState.setAllocationTokenAddress}
            onRecipientChange={pageState.setAllocationRecipientAddress}
            onAmountChange={pageState.setAllocationAmountValue}
            onSubmit={handleAllocation}
            formatTokenAmount={formatTokenAmount}
            subtractFloor={subtractFloor}
          />
        </div>

        <TreasuryOperationsTable
          loading={loading}
          operations={operationRows}
          readyOperationCount={readyOperationCount}
          expandedOperationId={pageState.expandedOperationId}
          activeAction={activeAction}
          isMultisig={isMultisig}
          onToggleExpand={(operationId) =>
            pageState.setExpandedOperationId((current) => (current === operationId ? null : operationId))
          }
          onExecute={handleExecuteOperation}
          onCancel={handleCancelOperation}
          formatUnixTime={formatUnixTime}
        />

        <TreasuryAssetTable
          loading={loading}
          tokenRows={tokenRows}
          formatTokenAmount={formatTokenAmount}
          formatRatio={formatRatio}
          getDailySpendRatio={getDailySpendRatio}
          getSpendBarClass={getSpendBarClass}
        />

        <TreasuryRiskNotice />
      </div>
    </>
  );
}
