'use client';

import { CircleDollarSign, Settings2, Sprout } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

import { AdminTableCell } from '@/components/AdminPrimitives';
import { SecondaryButton, StatusBadge } from '@/components/farm/FarmPrimitives';
import type { AdminInfo, FarmPoolEdits, FarmRow } from '@/components/farm/FarmTypes';
import { ALLOC_POINT_HINT, ZERO_BIGINT, shortAddress } from '@/components/farm/FarmUtils';
import { formatBigIntAmountDown, formatWeight } from '@/lib/amounts';

type FarmTableRowProps = {
  adminInfo?: AdminInfo | null;
  farm: FarmRow;
  edit: { allocPoint: string; active: boolean };
  canUpdatePool: boolean;
  activeAction: string | null;
  onPoolEditsChange: Dispatch<SetStateAction<FarmPoolEdits>>;
  onUpdatePool: (farm: FarmRow) => void;
};

export function FarmTableRow({
  adminInfo,
  farm,
  edit,
  canUpdatePool,
  activeAction,
  onPoolEditsChange,
  onUpdatePool,
}: FarmTableRowProps) {
  const rewardDecimals = farm.rewardToken.decimals || adminInfo?.rewardToken?.decimals || 18;

  return (
    <tr className="align-middle transition-colors hover:bg-slate-50/70">
      <AdminTableCell>
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {farm.stakingToken.isLp ? <Sprout size={18} /> : <CircleDollarSign size={18} />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-950">{farm.stakingToken.label}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              PID {farm.pid} / {shortAddress(farm.poolAddress)}
            </p>
          </div>
        </div>
      </AdminTableCell>
      <AdminTableCell>
        <StatusBadge active={farm.active} />
      </AdminTableCell>
      <AdminTableCell>
        <p className="font-semibold text-slate-900">{farm.allocPoint.toString()}</p>
        <p className="mt-1 text-xs text-slate-500">
          占比 {formatWeight(farm.allocPoint, adminInfo?.totalAllocPoint ?? ZERO_BIGINT)}
        </p>
      </AdminTableCell>
      <AdminTableCell className="text-sm leading-6 text-slate-700">
        {formatBigIntAmountDown(farm.totalStaked, farm.stakingToken.decimals, 4)}
        <span className="ml-1 text-xs text-slate-400">{farm.stakingToken.symbol}</span>
      </AdminTableCell>
      <AdminTableCell className="text-sm leading-6 text-slate-700">
        {formatBigIntAmountDown(farm.managerPendingRewards + farm.pendingRewards, rewardDecimals, 4)}
        <span className="ml-1 text-xs text-slate-400">{farm.rewardToken.symbol}</span>
      </AdminTableCell>
      <AdminTableCell className="text-sm leading-6 text-slate-700">
        {formatBigIntAmountDown(farm.rewardReserve + farm.queuedRewards, rewardDecimals, 4)}
        <span className="ml-1 text-xs text-slate-400">{farm.rewardToken.symbol}</span>
      </AdminTableCell>
      <AdminTableCell>
        <div className="flex min-w-[210px] items-center gap-2">
          <div className="space-y-1">
            <input
              value={edit.allocPoint}
              disabled={!canUpdatePool}
              onChange={(event) =>
                onPoolEditsChange((current) => ({
                  ...current,
                  [farm.pid]: {
                    ...edit,
                    allocPoint: event.target.value,
                  },
                }))
              }
              title={ALLOC_POINT_HINT}
              className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <p className="text-[11px] text-slate-400">1 - 1,000,000</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={edit.active}
              disabled={!canUpdatePool}
              onChange={(event) =>
                onPoolEditsChange((current) => ({
                  ...current,
                  [farm.pid]: {
                    ...edit,
                    active: event.target.checked,
                  },
                }))
              }
              className="h-4 w-4 rounded border-slate-300"
            />
            启用
          </label>
        </div>
      </AdminTableCell>
      <AdminTableCell align="right">
        <SecondaryButton
          onClick={() => onUpdatePool(farm)}
          disabled={!canUpdatePool}
          loading={activeAction === `update-${farm.pid}`}
        >
          <Settings2 size={15} />
          保存
        </SecondaryButton>
      </AdminTableCell>
    </tr>
  );
}
