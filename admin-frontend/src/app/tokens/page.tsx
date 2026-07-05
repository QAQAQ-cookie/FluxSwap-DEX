'use client';

import { TokensPageBody } from '@/components/tokens/TokensPageBody';
import { TokensPageHeader } from '@/components/tokens/TokensPageHeader';
import { useTokensPageController } from '@/components/tokens/useTokensPageController';

export default function TokensPage() {
  const controller = useTokensPageController();

  return (
    <div className="space-y-8">
      <TokensPageHeader
        loading={controller.pageState.loading}
        error={controller.pageState.error}
        onRefresh={() => void controller.loadTokens()}
      />
      <TokensPageBody controller={controller} />
    </div>
  );
}
