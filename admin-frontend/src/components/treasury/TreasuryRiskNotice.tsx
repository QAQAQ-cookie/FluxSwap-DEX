'use client';

import { AlertCircle } from 'lucide-react';

import { Card } from '@/components/AdminPrimitives';

export function TreasuryRiskNotice() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="mt-0.5 text-amber-600" />
        <p className="text-sm leading-6 text-slate-600">
          授权、额度、白名单和暂停都属于高风险金库操作。治理操作仅限多签发起；达到延迟后，只有带本地参数记录的操作才能在页面执行。
        </p>
      </div>
    </Card>
  );
}
