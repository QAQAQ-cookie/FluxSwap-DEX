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

type ExecutorGrpcClient = grpc.Client & {
  CreateOrder: (
    payload: CreateOrderPayload,
    callback: (error: grpc.ServiceError | null, response: GrpcCreateOrderResponse) => void,
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

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function requireString(payload: Partial<CreateOrderPayload>, field: keyof CreateOrderPayload) {
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
