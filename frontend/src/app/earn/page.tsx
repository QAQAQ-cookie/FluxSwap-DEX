'use client';

import { EarnFarmList } from '@/components/earn/EarnFarmList';
import { EarnFarmModal } from '@/components/earn/EarnFarmModal';
import { EarnHero } from '@/components/earn/EarnHero';
import { EarnResultModal } from '@/components/earn/EarnResultModal';
import { useEarnPageController } from '@/components/earn/useEarnPageController';

export default function EarnPage() {
  const {
    isZh,
    heroViewModel,
    farmListSectionProps,
    farmModalSectionProps,
    resultModalViewModel,
  } = useEarnPageController();

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 px-4 py-8 transition-colors dark:bg-gray-950 lg:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <EarnHero isZh={isZh} viewModel={heroViewModel} />

        <EarnFarmList isZh={isZh} {...farmListSectionProps} />

        <EarnFarmModal isZh={isZh} {...farmModalSectionProps} />

        <EarnResultModal isZh={isZh} {...resultModalViewModel} />
      </div>
    </div>
  );
}
