import { NextResponse } from 'next/server';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';

export const runtime = 'nodejs';

type CreateOrderPayload = {
  chainId: number;
  settlementAddress: string;
  orderHash: string;
  maker: string;
  inputToken: string;
  outputToken: string;
  amountIn: string;
  minAmountOut: string;
  maxExecutorRewardBps: string;
  triggerPriceX18: string;
  expiry: string;
  nonce: string;
  recipient: string;
  signature: string;
  source?: string;
};

type CancelOrderItemPayload = {
  chainId: number;
  settlementAddress: string;
  orderHash: string;
  maker: string;
  reason?: string;
};

type CancelOrdersPayload = {
  orders: CancelOrderItemPayload[];
  cancelTxHash: string;
};

type GrpcCreateOrderResponse = {
  order?: unknown;
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
};

type GrpcCancelOrdersResponse = {
  total?: number | string;
  cancelledCount?: number | string;
  results?: Array<{
    chainId?: number | string;
    settlementAddress?: string;
    orderHash?: string;
    cancelled?: boolean;
    error?: string;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
    order?: GrpcLimitOrder;
  }>;
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
};

type ListOrdersPayload = {
  chainId: number;
  settlementAddress?: string;
  maker: string;
  statuses?: string[];
  limit?: number;
  cursor?: string;
};

type GrpcLimitOrder = {
  chainId?: number | string;
  settlementAddress?: string;
  orderHash?: string;
  maker?: string;
  inputToken?: string;
  outputToken?: string;
  amountIn?: string;
  minAmountOut?: string;
  maxExecutorRewardBps?: string;
  triggerPriceX18?: string;
  expiry?: string;
  nonce?: string;
  recipient?: string;
  source?: string;
  status?: string;
  statusReason?: string;
  cancelledTxHash?: string;
  createdAt?: string;
  updatedAt?: string;
};

type GrpcListOrdersResponse = {
  orders?: GrpcLimitOrder[];
  nextCursor?: string;
  hasMore?: boolean;
  updatesCursor?: string;
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
};

type LimitOrderRecord = {
  chainId: number;
  settlementAddress: string;
  orderHash: string;
  maker: string;
  inputToken: string;
  outputToken: string;
  amountIn: string;
  minAmountOut: string;
  maxExecutorRewardBps: string;
  triggerPriceX18: string;
  expiry: string;
  nonce: string;
  recipient: string;
  source: string;
  status: string;
  statusReason?: string;
  cancelledTxHash?: string;
  createdAt: string;
  updatedAt: string;
};

type ExecutorGrpcClient = grpc.Client & {
  CreateOrder: (
    payload: CreateOrderPayload,
    callback: (error: grpc.ServiceError | null, response: GrpcCreateOrderResponse) => void,
  ) => void;
  CancelOrders: (
    payload: CancelOrdersPayload,
    callback: (error: grpc.ServiceError | null, response: GrpcCancelOrdersResponse) => void,
  ) => void;
  ListOrders: (
    payload: ListOrdersPayload,
    callback: (error: grpc.ServiceError | null, response: GrpcListOrdersResponse) => void,
  ) => void;
  ListOrderUpdates: (
    payload: ListOrdersPayload,
    callback: (error: grpc.ServiceError | null, response: GrpcListOrdersResponse) => void,
  ) => void;
};

type ExecutorGrpcConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => ExecutorGrpcClient;

const DEFAULT_BACKEND_GRPC_URL = '127.0.0.1:9001';

function getBackendGrpcUrl() {
  return process.env.BACKEND_GRPC_URL ?? DEFAULT_BACKEND_GRPC_URL;
}

function getExecutorClient() {
  const protoPath = path.join(process.cwd(), '..', 'backend', 'rpc', 'proto', 'executor.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    defaults: false,
    enums: String,
    keepCase: false,
    longs: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as {
    executor?: {
      Executor?: ExecutorGrpcConstructor;
    };
  };
  const Executor = loaded.executor?.Executor;

  if (!Executor) {
    throw new Error('Executor gRPC service is not available from executor.proto');
  }

  return new Executor(getBackendGrpcUrl(), grpc.credentials.createInsecure());
}

function createOrder(payload: CreateOrderPayload) {
  const client = getExecutorClient();

  return new Promise<GrpcCreateOrderResponse>((resolve, reject) => {
    client.CreateOrder(payload, (error, response) => {
      client.close();

      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function cancelOrders(payload: CancelOrdersPayload) {
  const client = getExecutorClient();

  return new Promise<GrpcCancelOrdersResponse>((resolve, reject) => {
    client.CancelOrders(payload, (error, response) => {
      client.close();

      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function listOrders(payload: ListOrdersPayload, view: 'orders' | 'updates') {
  const client = getExecutorClient();

  return new Promise<GrpcListOrdersResponse>((resolve, reject) => {
    const invoke = view === 'updates' ? client.ListOrderUpdates.bind(client) : client.ListOrders.bind(client);

    invoke(payload, (error, response) => {
      client.close();

      if (error) {
        reject(error);
        return;
      }

      resolve(response);
    });
  });
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function requireString<T extends Record<string, unknown>>(payload: T, field: keyof T & string) {
  const value = payload[field];

  if (!isString(value)) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function normalizeCreateOrderBody(body: unknown): CreateOrderPayload {
  const payload = body as Partial<CreateOrderPayload>;
  const chainId = Number(payload.chainId);

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('chainId must be a positive integer');
  }

  return {
    chainId,
    settlementAddress: requireString(payload, 'settlementAddress'),
    orderHash: requireString(payload, 'orderHash'),
    maker: requireString(payload, 'maker'),
    inputToken: requireString(payload, 'inputToken'),
    outputToken: requireString(payload, 'outputToken'),
    amountIn: requireString(payload, 'amountIn'),
    minAmountOut: requireString(payload, 'minAmountOut'),
    maxExecutorRewardBps: requireString(payload, 'maxExecutorRewardBps'),
    triggerPriceX18: requireString(payload, 'triggerPriceX18'),
    expiry: requireString(payload, 'expiry'),
    nonce: requireString(payload, 'nonce'),
    recipient: requireString(payload, 'recipient'),
    signature: requireString(payload, 'signature'),
    source: isString(payload.source) ? payload.source.trim() : 'frontend',
  };
}

function normalizeCancelOrderItem(value: unknown, index: number): CancelOrderItemPayload {
  const item = value as Partial<CancelOrderItemPayload>;
  const chainId = Number(item.chainId);

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`orders[${index}].chainId must be a positive integer`);
  }

  return {
    chainId,
    settlementAddress: requireString(item, 'settlementAddress'),
    orderHash: requireString(item, 'orderHash'),
    maker: requireString(item, 'maker'),
    reason: isString(item.reason) ? item.reason.trim() : '',
  };
}

function normalizeCancelOrdersBody(body: unknown): CancelOrdersPayload {
  const payload = body as Partial<CancelOrdersPayload>;
  const orders = Array.isArray(payload.orders) ? payload.orders : [];

  if (orders.length === 0) {
    throw new Error('orders must not be empty');
  }

  return {
    orders: orders.map((item, index) => normalizeCancelOrderItem(item, index)),
    cancelTxHash: requireString(payload, 'cancelTxHash'),
  };
}

function parsePositiveInteger(value: string | null, field: string, fallback?: number) {
  if (value === null || value.trim() === '') {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${field} is required`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return parsed;
}

function normalizeListOrdersQuery(
  request: Request,
): {
  view: 'orders' | 'updates';
  payload: ListOrdersPayload;
} {
  const url = new URL(request.url);
  const statuses = [
    ...url.searchParams.getAll('status'),
    ...url.searchParams
      .getAll('statuses')
      .flatMap((value) => value.split(',')),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    view: url.searchParams.get('view') === 'updates' ? 'updates' : 'orders',
    payload: {
      chainId: parsePositiveInteger(url.searchParams.get('chainId'), 'chainId'),
      settlementAddress: url.searchParams.get('settlementAddress')?.trim() || undefined,
      maker: (() => {
        const maker = url.searchParams.get('maker');
        if (!maker || !maker.trim()) {
          throw new Error('maker is required');
        }
        return maker.trim();
      })(),
      statuses,
      limit: parsePositiveInteger(url.searchParams.get('limit'), 'limit', 100),
      cursor: url.searchParams.get('cursor')?.trim() || undefined,
    } satisfies ListOrdersPayload,
  };
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return fallback;
}

function mapGrpcOrderToLimitOrderRecord(order: GrpcLimitOrder, fallbackChainId: number): LimitOrderRecord | null {
  const orderHash = readString(order.orderHash);
  if (!orderHash) {
    return null;
  }

  const chainId = Number(readString(order.chainId, String(fallbackChainId)));

  return {
    chainId: Number.isSafeInteger(chainId) && chainId > 0 ? chainId : fallbackChainId,
    settlementAddress: readString(order.settlementAddress),
    orderHash,
    maker: readString(order.maker),
    inputToken: readString(order.inputToken),
    outputToken: readString(order.outputToken),
    amountIn: readString(order.amountIn, '0'),
    minAmountOut: readString(order.minAmountOut, '0'),
    maxExecutorRewardBps: readString(order.maxExecutorRewardBps, '0'),
    triggerPriceX18: readString(order.triggerPriceX18, '0'),
    expiry: readString(order.expiry, '0'),
    nonce: readString(order.nonce, '0'),
    recipient: readString(order.recipient),
    source: readString(order.source, 'backend'),
    status: readString(order.status, 'open'),
    statusReason: readString(order.statusReason),
    cancelledTxHash: readString(order.cancelledTxHash),
    createdAt: readString(order.createdAt),
    updatedAt: readString(order.updatedAt),
  };
}

export async function GET(request: Request) {
  try {
    const { view, payload } = normalizeListOrdersQuery(request);
    const response = await listOrders(payload, view);
    const status = response.notice?.success === false ? 400 : 200;

    return NextResponse.json(
      {
        orders: (response.orders ?? [])
          .map((order) => mapGrpcOrderToLimitOrderRecord(order, payload.chainId))
          .filter((order): order is LimitOrderRecord => order !== null),
        nextCursor: response.nextCursor ?? '',
        hasMore: response.hasMore === true,
        updatesCursor: response.updatesCursor ?? '',
        notice: response.notice,
      },
      { status },
    );
  } catch (error) {
    const url = new URL(request.url);
    const isUpdatesView = url.searchParams.get('view') === 'updates';
    const message = error instanceof Error ? error.message : 'List orders request failed';

    return NextResponse.json(
      {
        orders: [],
        nextCursor: '',
        hasMore: false,
        updatesCursor: '',
        notice: {
          success: false,
          code: isUpdatesView ? 'LIST_ORDER_UPDATES_PROXY_FAILED' : 'LIST_ORDERS_PROXY_FAILED',
          message,
          hint: 'Please confirm the backend gRPC service is running and BACKEND_GRPC_URL is configured correctly.',
          stage: 'frontend_api_proxy',
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = normalizeCreateOrderBody(await request.json());
    const response = await createOrder(payload);
    const status = response.notice?.success === false ? 400 : 200;

    return NextResponse.json(response, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Create order request failed';

    return NextResponse.json(
      {
        notice: {
          success: false,
          code: 'CREATE_ORDER_PROXY_FAILED',
          message,
          hint: '请确认后端 gRPC 服务已启动，并且 BACKEND_GRPC_URL 配置正确。',
          stage: 'frontend_api_proxy',
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = normalizeCancelOrdersBody(await request.json());
    const response = await cancelOrders(payload);
    const status = response.notice?.success === false ? 400 : 200;
    const fallbackChainId = payload.orders[0]?.chainId ?? 0;

    return NextResponse.json(
      {
        total: Number(response.total ?? 0),
        cancelledCount: Number(response.cancelledCount ?? 0),
        results: (response.results ?? []).map((result) => ({
          chainId: Number(result.chainId ?? fallbackChainId),
          settlementAddress: readString(result.settlementAddress),
          orderHash: readString(result.orderHash),
          cancelled: result.cancelled === true,
          error: readString(result.error),
          code: readString(result.code),
          message: readString(result.message),
          hint: readString(result.hint),
          stage: readString(result.stage),
          order: result.order ? mapGrpcOrderToLimitOrderRecord(result.order, fallbackChainId) : null,
        })),
        notice: response.notice,
      },
      { status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel orders request failed';

    return NextResponse.json(
      {
        total: 0,
        cancelledCount: 0,
        results: [],
        notice: {
          success: false,
          code: 'CANCEL_ORDERS_PROXY_FAILED',
          message,
          hint: 'Please confirm the backend gRPC service is running and BACKEND_GRPC_URL is configured correctly.',
          stage: 'frontend_api_proxy',
        },
      },
      { status: 500 },
    );
  }
}
