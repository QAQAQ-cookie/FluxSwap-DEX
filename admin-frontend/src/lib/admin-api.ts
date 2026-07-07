'use client';

import type { Address, Hex } from 'viem';

const DEFAULT_ADMIN_API_BASE_URL = 'http://localhost:8081';
const ADMIN_SESSION_STORAGE_KEY = 'fluxswap_admin_session_v1';

export const adminApiBaseUrl = (
  process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL ?? DEFAULT_ADMIN_API_BASE_URL
).replace(/\/$/, '');

type AdminApiResponse<T> = {
  data: T;
};

type AdminApiErrorResponse = {
  error?: string;
};

export type AdminAuthNonce = {
  walletAddress: Address;
  nonce: Hex;
  message: string;
  expiresAt: string;
};

export type AdminAuthSession = {
  walletAddress: Address;
  verified: true;
  token: string;
  expiresAt: string;
};

type StoredAdminSession = {
  walletAddress: Address;
  token: string;
  expiresAt: string;
};

export type AdminSignMessage = (input: { message: string }) => Promise<Hex>;

export type AdminApiPage<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminTreasuryOperation = {
  id: number;
  operationId: Hex;
  chainId: number;
  treasuryAddress: Address;
  operationTypeCode: string;
  operationTypeLabel: string;
  statusCode: string;
  statusLabel: string;
  proposerAddress: Address;
  executorAddress?: Address;
  cancellerAddress?: Address;
  scheduleTxHash?: Hex;
  executeTxHash?: Hex;
  cancelTxHash?: Hex;
  readyAt?: string;
  executedAt?: string;
  cancelledAt?: string;
  params: Record<string, unknown>;
  summary?: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertAdminTreasuryOperationInput = {
  operationId: Hex;
  chainId: number;
  treasuryAddress: Address;
  operationTypeCode: string;
  operationTypeLabel: string;
  statusCode?: string;
  statusLabel?: string;
  proposerAddress: Address;
  scheduleTxHash?: Hex;
  readyAt?: string;
  params?: Record<string, unknown>;
  summary?: string;
};

export type UpdateAdminTreasuryOperationStatusInput = {
  statusCode: string;
  statusLabel?: string;
  actorAddress?: Address;
  executeTxHash?: Hex;
  cancelTxHash?: Hex;
  failureTxHash?: Hex;
  requestData?: Record<string, unknown>;
};

export type AdminOperationLog = {
  id: number;
  actorAddress: string;
  moduleCode: string;
  moduleLabel: string;
  actionCode: string;
  actionLabel: string;
  targetId?: string;
  chainId?: number;
  contractAddress?: Address;
  txHash?: Hex;
  resultCode: string;
  resultLabel: string;
  requestData: Record<string, unknown>;
  createdAt: string;
};

type ListTreasuryOperationsParams = {
  chainId?: number;
  treasuryAddress?: Address;
  statusCode?: string;
  operationTypeCode?: string;
  proposerAddress?: Address;
  page?: number;
  pageSize?: number;
};

type ListAdminLogsParams = {
  actorAddress?: Address;
  moduleCode?: string;
  actionCode?: string;
  resultCode?: string;
  chainId?: number;
  page?: number;
  pageSize?: number;
};

export async function listAdminTreasuryOperations(params: ListTreasuryOperationsParams) {
  return adminApiGet<AdminApiPage<AdminTreasuryOperation>>('/api/admin/treasury/operations', params);
}

export async function upsertAdminTreasuryOperation(input: UpsertAdminTreasuryOperationInput) {
  return adminApiRequest<AdminTreasuryOperation>('/api/admin/treasury/operations', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify(input),
  });
}

export async function updateAdminTreasuryOperationStatus(
  operationId: Hex,
  input: UpdateAdminTreasuryOperationStatusInput,
) {
  return adminApiRequest<AdminTreasuryOperation>(
    `/api/admin/treasury/operations/${encodeURIComponent(operationId)}/status`,
    {
      method: 'PATCH',
      requireAuth: true,
      body: JSON.stringify(input),
    },
  );
}

export async function listAdminOperationLogs(params: ListAdminLogsParams) {
  return adminApiGet<AdminApiPage<AdminOperationLog>>('/api/admin/logs', params);
}

export async function createAdminAuthNonce(walletAddress: Address) {
  return adminApiRequest<AdminAuthNonce>('/api/admin/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

export async function verifyAdminAuthNonce(input: { walletAddress: Address; nonce: Hex; signature: Hex }) {
  const session = await adminApiRequest<AdminAuthSession>('/api/admin/auth/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  saveAdminSession(session);
  return session;
}

export async function ensureAdminSession(walletAddress: Address | undefined, signMessageAsync: AdminSignMessage) {
  if (!walletAddress) {
    throw new Error('请先连接管理员钱包');
  }

  const existing = getStoredAdminSession(walletAddress);
  if (existing) {
    return existing;
  }

  const nonce = await createAdminAuthNonce(walletAddress);
  const signature = await signMessageAsync({ message: nonce.message });
  return verifyAdminAuthNonce({
    walletAddress,
    nonce: nonce.nonce,
    signature,
  });
}

export function clearAdminSession() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

async function adminApiGet<T>(path: string, params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      searchParams.set(key, value.toString());
    }
  });

  const query = searchParams.toString();
  return adminApiRequest<T>(query ? `${path}?${query}` : path);
}

type AdminApiRequestInit = RequestInit & {
  requireAuth?: boolean;
};

async function adminApiRequest<T>(path: string, init?: AdminApiRequestInit) {
  const { requireAuth, headers, ...requestInit } = init ?? {};
  const session = requireAuth ? getStoredAdminSession() : null;
  const response = await fetch(`${adminApiBaseUrl}${path}`, {
    ...requestInit,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAdminSession();
    }
    const message = await readAdminApiError(response);
    throw new Error(message || `管理后端请求失败：${response.status}`);
  }

  const payload = (await response.json()) as AdminApiResponse<T>;
  return payload.data;
}

function getStoredAdminSession(walletAddress?: Address) {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as StoredAdminSession;
    if (!session.token || !session.walletAddress || Date.parse(session.expiresAt) <= Date.now() + 30_000) {
      clearAdminSession();
      return null;
    }
    if (walletAddress && session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return null;
    }
    return session;
  } catch {
    clearAdminSession();
    return null;
  }
}

function saveAdminSession(session: AdminAuthSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    ADMIN_SESSION_STORAGE_KEY,
    JSON.stringify({
      walletAddress: session.walletAddress,
      token: session.token,
      expiresAt: session.expiresAt,
    } satisfies StoredAdminSession),
  );
}

async function readAdminApiError(response: Response) {
  try {
    const payload = (await response.json()) as AdminApiErrorResponse;
    return payload.error ?? '';
  } catch {
    return '';
  }
}
