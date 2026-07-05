import { formatErrorMessage } from '@/lib/errors';

import type { EarnExecutableFarmAction, EarnResultModalState } from './EarnTypes';

export function shouldResetStakeAmount(action: EarnExecutableFarmAction) {
  return action === 'approve' || action === 'stake';
}

export function shouldResetWithdrawAmount(action: EarnExecutableFarmAction) {
  return action === 'withdraw' || action === 'exit';
}

export function buildEarnFarmSuccessState(
  action: EarnExecutableFarmAction,
  isZh: boolean,
): NonNullable<EarnResultModalState> {
  return {
    kind: 'success',
    title: action === 'approve' ? (isZh ? '授权成功' : 'Approval successful') : isZh ? '操作成功' : 'Action successful',
    message:
      action === 'approve'
        ? isZh
          ? 'LP 授权已完成，现在可以继续质押。'
          : 'LP approval completed. You can now stake.'
        : isZh
          ? '操作已完成，农场数据已刷新。'
          : 'Action completed. Farm data has been refreshed.',
  };
}

export function buildEarnFarmErrorState(
  error: unknown,
  isZh: boolean,
): NonNullable<EarnResultModalState> {
  return {
    kind: 'error',
    title: isZh ? '操作失败' : 'Action failed',
    message: formatErrorMessage(error, {
      rejectedMessage: isZh ? '你已取消钱包确认。' : 'You rejected this wallet action.',
    }),
  };
}
