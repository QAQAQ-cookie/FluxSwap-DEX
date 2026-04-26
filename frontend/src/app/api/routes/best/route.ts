import { NextResponse } from "next/server";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";

export const runtime = "nodejs";

type GetBestRoutePayload = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  maxHops?: number;
  quoteType: "ROUTE_QUOTE_TYPE_EXACT_INPUT" | "ROUTE_QUOTE_TYPE_EXACT_OUTPUT";
};

type GrpcRouteView = {
  pathTokens?: string[];
  executionPath?: string[];
  hops?: number;
  isDirect?: boolean;
  isMultiHop?: boolean;
  amountIn?: string;
  amountOut?: string;
  gasEstimate?: string;
  gasCostInInputToken?: string;
  gasCostInOutputToken?: string;
  gasAdjustedAmountIn?: string;
  gasAdjustedAmountOut?: string;
  rankingMetric?: string;
};

type GrpcGetBestRouteResponse = {
  notice?: {
    success?: boolean;
    code?: string;
    message?: string;
    hint?: string;
    stage?: string;
  };
  selectedRoute?: GrpcRouteView;
  alternativeRoutes?: GrpcRouteView[];
  execution?: {
    routerPath?: string[];
    isMultiHop?: boolean;
    strategy?: string;
  };
  selectionReason?: string;
  usedGasAdjustedRanking?: boolean;
  quote?: {
    quoteType?: string;
    amountIn?: string;
    amountOut?: string;
  };
};

type ExecutorGrpcClient = grpc.Client & {
  GetBestRoute: (
    payload: GetBestRoutePayload,
    callback: (
      error: grpc.ServiceError | null,
      response: GrpcGetBestRouteResponse,
    ) => void,
  ) => void;
};

type ExecutorGrpcConstructor = new (
  address: string,
  credentials: grpc.ChannelCredentials,
) => ExecutorGrpcClient;

const DEFAULT_BACKEND_GRPC_URL = "127.0.0.1:9001";

function getBackendGrpcUrl() {
  return process.env.BACKEND_GRPC_URL ?? DEFAULT_BACKEND_GRPC_URL;
}

function getExecutorClient() {
  const protoPath = path.join(
    process.cwd(),
    "..",
    "backend",
    "rpc",
    "proto",
    "executor.proto",
  );
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
    throw new Error(
      "Executor gRPC service is not available from executor.proto",
    );
  }

  return new Executor(getBackendGrpcUrl(), grpc.credentials.createInsecure());
}

function getBestRoute(payload: GetBestRoutePayload) {
  const client = getExecutorClient();

  return new Promise<GrpcGetBestRouteResponse>((resolve, reject) => {
    client.GetBestRoute(payload, (error, response) => {
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
  return typeof value === "string" && value.trim() !== "";
}

function requireString(
  payload: Partial<GetBestRoutePayload>,
  field: keyof GetBestRoutePayload,
) {
  const value = payload[field];

  if (!isString(value)) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function normalizeGetBestRouteBody(body: unknown): GetBestRoutePayload {
  const payload = body as Partial<GetBestRoutePayload>;
  const chainId = Number(payload.chainId);
  const maxHops = payload.maxHops === undefined ? 1 : Number(payload.maxHops);

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("chainId must be a positive integer");
  }

  if (!Number.isSafeInteger(maxHops) || maxHops < 0) {
    throw new Error("maxHops must be a non-negative integer");
  }

  return {
    chainId,
    tokenIn: requireString(payload, "tokenIn"),
    tokenOut: requireString(payload, "tokenOut"),
    amount: requireString(payload, "amount"),
    maxHops,
    quoteType:
      payload.quoteType === "ROUTE_QUOTE_TYPE_EXACT_OUTPUT"
        ? "ROUTE_QUOTE_TYPE_EXACT_OUTPUT"
        : "ROUTE_QUOTE_TYPE_EXACT_INPUT",
  };
}

export async function POST(request: Request) {
  try {
    const payload = normalizeGetBestRouteBody(await request.json());
    const response = await getBestRoute(payload);
    const status = response.notice?.success === false ? 400 : 200;

    return NextResponse.json(response, { status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Get best route request failed";

    return NextResponse.json(
      {
        notice: {
          success: false,
          code: "GET_BEST_ROUTE_PROXY_FAILED",
          message,
          hint: "Please confirm the backend gRPC service is running and BACKEND_GRPC_URL is configured correctly.",
          stage: "frontend_api_proxy",
        },
      },
      { status: 500 },
    );
  }
}
