import { network } from "hardhat";
import path from "node:path";
import { readFile } from "node:fs/promises";

import JSON5 from "json5";
import { parseAbi, type Address, type Hash } from "viem";

type InitMode = "plan" | "schedule" | "execute" | "all";
type AddressAlias =
  | "token"
  | "treasury"
  | "factory"
  | "router"
  | "manager"
  | "poolFactory"
  | "buybackExecutor"
  | "revenueDistributor"
  | "weth"
  | "mockUsdt"
  | "mockUsdc"
  | "mockWbtc";
type AddressLike = AddressAlias | "native" | Address;

interface DeploymentConfig {
  source?: "ignition";
  deploymentId?: string;
  deploymentsDir?: string;
  moduleId?: string;
  futureIds?: Partial<Record<AddressAlias, string>>;
  addresses?: Partial<Record<AddressAlias, Address>>;
}

interface ScriptOptions {
  autoMineTimelockOnLocal?: boolean;
  executeCaller?: AddressLike;
  defaultFundingSender?: AddressLike;
}

interface AllowedTokenConfig {
  token: AddressLike;
  allowed: boolean;
  delay?: bigint | number | string;
}

interface AllowedRecipientConfig {
  recipient: AddressLike;
  allowed: boolean;
  delay?: bigint | number | string;
}

interface DailySpendCapConfig {
  token: AddressLike;
  amount: bigint | number | string;
  delay?: bigint | number | string;
}

interface SpenderApprovalConfig {
  token: AddressLike;
  spender: AddressLike;
  amount: bigint | number | string;
  delay?: bigint | number | string;
}

interface SpenderRevocationConfig {
  token: AddressLike;
  spender: AddressLike;
  delay?: bigint | number | string;
}

interface TreasuryInitConfig {
  allowedTokens?: AllowedTokenConfig[];
  allowedRecipients?: AllowedRecipientConfig[];
  dailySpendCaps?: DailySpendCapConfig[];
  spenderApprovals?: SpenderApprovalConfig[];
  spenderRevocations?: SpenderRevocationConfig[];
}

interface NativeTransferConfig {
  to: AddressLike;
  amount: bigint | number | string;
  sender?: AddressLike;
}

interface TokenMintConfig {
  token: AddressLike;
  to: AddressLike;
  amount: bigint | number | string;
  sender?: AddressLike;
}

interface TokenTransferConfig {
  token: AddressLike;
  to: AddressLike;
  amount: bigint | number | string;
  sender?: AddressLike;
}

interface FundingConfig {
  nativeTransfers?: NativeTransferConfig[];
  tokenMints?: TokenMintConfig[];
  tokenTransfers?: TokenTransferConfig[];
}

interface OwnershipTransferConfig {
  contract: AddressLike;
  newOwner: AddressLike;
  sender?: AddressLike;
}

interface PostDeployInitConfig {
  deployment?: DeploymentConfig;
  options?: ScriptOptions;
  treasury?: TreasuryInitConfig;
  funding?: FundingConfig;
  ownershipTransfers?: OwnershipTransferConfig[];
}

interface CliArgs {
  mode: InitMode;
  configPath: string;
}

interface AddressBook {
  token?: Address;
  treasury?: Address;
  factory?: Address;
  router?: Address;
  manager?: Address;
  poolFactory?: Address;
  buybackExecutor?: Address;
  revenueDistributor?: Address;
  weth?: Address;
  mockUsdt?: Address;
  mockUsdc?: Address;
  mockWbtc?: Address;
}

interface TimelockOperation {
  kind:
    | "setAllowedToken"
    | "setAllowedRecipient"
    | "setDailySpendCap"
    | "approveSpender"
    | "revokeSpender";
  description: string;
  delay: bigint;
  desiredStateDescription: string;
  isAlreadyApplied: () => Promise<boolean>;
  getOperationId: () => Promise<Hash>;
  getReadyAt: (operationId: Hash) => Promise<bigint>;
  schedule: (operationId: Hash) => Promise<Hash>;
  execute: (operationId: Hash) => Promise<Hash>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const DEFAULT_DEPLOYMENT_FUTURE_IDS: Record<AddressAlias, string> = {
  token: "FluxCoreModule#FluxToken",
  treasury: "FluxCoreModule#FluxSwapTreasury",
  factory: "FluxCoreModule#FluxSwapFactory",
  router: "FluxCoreModule#FluxSwapRouter",
  manager: "FluxCoreModule#FluxMultiPoolManager",
  poolFactory: "FluxCoreModule#FluxPoolFactory",
  buybackExecutor: "FluxCoreModule#FluxBuybackExecutor",
  revenueDistributor: "FluxCoreModule#FluxRevenueDistributor",
  weth: "FluxCoreModule#MockWETH",
  mockUsdt: "FluxCoreModule#mockUsdt",
  mockUsdc: "FluxCoreModule#mockUsdc",
  mockWbtc: "FluxCoreModule#mockWbtc",
};

function parseCliArgs(argv: string[]): CliArgs {
  let mode = (process.env.FLUX_INIT_MODE as InitMode | undefined) ?? "plan";
  let configPath =
    process.env.FLUX_INIT_CONFIG ?? "./ignition/parameters/post-deploy-init.local.sample.json5";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--mode") {
      const value = argv[i + 1];
      if (value !== "plan" && value !== "schedule" && value !== "execute" && value !== "all") {
        throw new Error(`Unsupported --mode value: ${value ?? "<empty>"}`);
      }
      mode = value;
      i += 1;
      continue;
    }

    if (arg === "--init-config") {
      configPath = argv[i + 1] ?? configPath;
      i += 1;
      continue;
    }
  }

  if (mode !== "plan" && mode !== "schedule" && mode !== "execute" && mode !== "all") {
    throw new Error(`Unsupported init mode: ${mode}`);
  }

  return {
    mode,
    configPath,
  };
}

function normalizeBigInt(value: bigint | number | string | undefined, fallback = 0n): bigint {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  const trimmed = value.trim();
  return BigInt(trimmed);
}

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function resolveAddressLike(value: AddressLike, addressBook: AddressBook): Address {
  if (value === "native") {
    return ZERO_ADDRESS;
  }

  if (isAddress(value)) {
    return value;
  }

  const resolved = addressBook[value];
  if (resolved === undefined) {
    throw new Error(`Address alias "${value}" is not available in the resolved address book`);
  }

  return resolved;
}

async function loadConfig(configPath: string): Promise<PostDeployInitConfig> {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  const raw = await readFile(resolvedPath, "utf8");
  return JSON5.parse(raw) as PostDeployInitConfig;
}

async function resolveAddressBook(
  deployment: DeploymentConfig | undefined,
  chainId: bigint,
): Promise<AddressBook> {
  const addressBook: AddressBook = {
    ...(deployment?.addresses ?? {}),
  };

  const shouldReadIgnition = deployment?.source === "ignition" || deployment?.deploymentId !== undefined;
  if (!shouldReadIgnition) {
    return addressBook;
  }

  const deploymentId = deployment?.deploymentId ?? `chain-${chainId.toString()}`;
  const deploymentsDir =
    deployment?.deploymentsDir ?? path.join(process.cwd(), "ignition", "deployments");
  const deployedAddressesPath = path.join(deploymentsDir, deploymentId, "deployed_addresses.json");
  const raw = await readFile(deployedAddressesPath, "utf8");
  const deployedAddresses = JSON.parse(raw) as Record<string, string>;

  for (const [alias, defaultFutureId] of Object.entries(DEFAULT_DEPLOYMENT_FUTURE_IDS) as Array<
    [AddressAlias, string]
  >) {
    if (addressBook[alias] !== undefined) {
      continue;
    }

    const futureId = deployment?.futureIds?.[alias] ?? defaultFutureId;
    const resolved = deployedAddresses[futureId];
    if (resolved !== undefined && isAddress(resolved)) {
      addressBook[alias] = resolved;
    }
  }

  return addressBook;
}

function logSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function formatReadyAt(readyAt: bigint): string {
  if (readyAt === 0n) {
    return "未排期";
  }

  return `${readyAt.toString()} (${new Date(Number(readyAt) * 1000).toLocaleString("zh-CN")})`;
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  const config = await loadConfig(cli.configPath);

  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const currentBlock = await publicClient.getBlock();
  const addressBook = await resolveAddressBook(config.deployment, BigInt(chainId));

  const availableWallets = new Map(
    walletClients.map((walletClient) => [walletClient.account.address.toLowerCase(), walletClient]),
  );

  const findWalletClient = (address: Address) => availableWallets.get(address.toLowerCase());

  const requireWalletClient = (address: Address, label: string) => {
    const walletClient = findWalletClient(address);
    if (walletClient === undefined) {
      throw new Error(`当前网络未提供 ${label} 对应的钱包签名能力: ${address}`);
    }
    return walletClient;
  };

  const defaultWalletClient = walletClients[0];
  if (defaultWalletClient === undefined) {
    throw new Error("当前网络没有可用的钱包客户端");
  }

  if (addressBook.treasury === undefined) {
    throw new Error("未解析到 treasury 地址，初始化脚本无法继续");
  }

  const treasuryReader = await viem.getContractAt("FluxSwapTreasury", addressBook.treasury, {
    client: {
      public: publicClient,
      wallet: defaultWalletClient,
    },
  });

  const treasuryMultisig = await treasuryReader.read.multisig();
  const treasuryMinDelay = await treasuryReader.read.minDelay();
  const executeCaller =
    config.options?.executeCaller === undefined
      ? defaultWalletClient.account.address
      : resolveAddressLike(config.options.executeCaller, addressBook);

  const executorWallet = requireWalletClient(executeCaller, "executeCaller");
  const treasuryScheduler = await viem.getContractAt("FluxSwapTreasury", addressBook.treasury, {
    client: {
      public: publicClient,
      wallet: requireWalletClient(treasuryMultisig, "Treasury multisig"),
    },
  });
  const treasuryExecutor = await viem.getContractAt("FluxSwapTreasury", addressBook.treasury, {
    client: {
      public: publicClient,
      wallet: executorWallet,
    },
  });

  const timelockOperations: TimelockOperation[] = [];

  for (const item of config.treasury?.allowedTokens ?? []) {
    const token = resolveAddressLike(item.token, addressBook);
    const desired = item.allowed;
    const delay = normalizeBigInt(item.delay, treasuryMinDelay);

    timelockOperations.push({
      kind: "setAllowedToken",
      description: `允许 Treasury 使用代币 ${token}`,
      delay,
      desiredStateDescription: `allowedTokens[${token}] = ${desired}`,
      isAlreadyApplied: async () => (await treasuryReader.read.allowedTokens([token])) === desired,
      getOperationId: async () => treasuryReader.read.hashSetAllowedToken([token, desired]),
      getReadyAt: async (operationId) => treasuryReader.read.operationReadyAt([operationId]),
      schedule: async (operationId) => treasuryScheduler.write.scheduleOperation([operationId, delay]),
      execute: async (operationId) => treasuryExecutor.write.executeSetAllowedToken([token, desired, operationId]),
    });
  }

  for (const item of config.treasury?.allowedRecipients ?? []) {
    const recipient = resolveAddressLike(item.recipient, addressBook);
    const desired = item.allowed;
    const delay = normalizeBigInt(item.delay, treasuryMinDelay);

    timelockOperations.push({
      kind: "setAllowedRecipient",
      description: `更新 Treasury 收款白名单 ${recipient}`,
      delay,
      desiredStateDescription: `allowedRecipients[${recipient}] = ${desired}`,
      isAlreadyApplied: async () => (await treasuryReader.read.allowedRecipients([recipient])) === desired,
      getOperationId: async () => treasuryReader.read.hashSetAllowedRecipient([recipient, desired]),
      getReadyAt: async (operationId) => treasuryReader.read.operationReadyAt([operationId]),
      schedule: async (operationId) => treasuryScheduler.write.scheduleOperation([operationId, delay]),
      execute: async (operationId) =>
        treasuryExecutor.write.executeSetAllowedRecipient([recipient, desired, operationId]),
    });
  }

  for (const item of config.treasury?.dailySpendCaps ?? []) {
    const token = resolveAddressLike(item.token, addressBook);
    const amount = normalizeBigInt(item.amount);
    const delay = normalizeBigInt(item.delay, treasuryMinDelay);

    timelockOperations.push({
      kind: "setDailySpendCap",
      description: `设置 Treasury 日限额 ${token}`,
      delay,
      desiredStateDescription: `dailySpendCap[${token}] = ${amount.toString()}`,
      isAlreadyApplied: async () => (await treasuryReader.read.dailySpendCap([token])) === amount,
      getOperationId: async () => treasuryReader.read.hashSetDailySpendCap([token, amount]),
      getReadyAt: async (operationId) => treasuryReader.read.operationReadyAt([operationId]),
      schedule: async (operationId) => treasuryScheduler.write.scheduleOperation([operationId, delay]),
      execute: async (operationId) =>
        treasuryExecutor.write.executeSetDailySpendCap([token, amount, operationId]),
    });
  }

  for (const item of config.treasury?.spenderApprovals ?? []) {
    const token = resolveAddressLike(item.token, addressBook);
    const spender = resolveAddressLike(item.spender, addressBook);
    const amount = normalizeBigInt(item.amount);
    const delay = normalizeBigInt(item.delay, treasuryMinDelay);

    timelockOperations.push({
      kind: "approveSpender",
      description: `批准 Treasury spender ${spender} 使用 ${token}`,
      delay,
      desiredStateDescription: `approvedSpendRemaining[${token}][${spender}] = ${amount.toString()}`,
      isAlreadyApplied: async () =>
        (await treasuryReader.read.approvedSpendRemaining([token, spender])) === amount,
      getOperationId: async () => treasuryReader.read.hashApproveSpender([token, spender, amount]),
      getReadyAt: async (operationId) => treasuryReader.read.operationReadyAt([operationId]),
      schedule: async (operationId) => treasuryScheduler.write.scheduleOperation([operationId, delay]),
      execute: async (operationId) =>
        treasuryExecutor.write.executeApproveSpender([token, spender, amount, operationId]),
    });
  }

  for (const item of config.treasury?.spenderRevocations ?? []) {
    const token = resolveAddressLike(item.token, addressBook);
    const spender = resolveAddressLike(item.spender, addressBook);
    const delay = normalizeBigInt(item.delay, treasuryMinDelay);

    timelockOperations.push({
      kind: "revokeSpender",
      description: `撤销 Treasury spender ${spender} 对 ${token} 的额度`,
      delay,
      desiredStateDescription: `approvedSpendRemaining[${token}][${spender}] = 0`,
      isAlreadyApplied: async () =>
        (await treasuryReader.read.approvedSpendRemaining([token, spender])) === 0n,
      getOperationId: async () => treasuryReader.read.hashRevokeSpender([token, spender]),
      getReadyAt: async (operationId) => treasuryReader.read.operationReadyAt([operationId]),
      schedule: async (operationId) => treasuryScheduler.write.scheduleOperation([operationId, delay]),
      execute: async (operationId) =>
        treasuryExecutor.write.executeRevokeSpender([token, spender, operationId]),
    });
  }

  logSection("初始化上下文");
  console.log(`模式: ${cli.mode}`);
  console.log(`配置文件: ${path.resolve(process.cwd(), cli.configPath)}`);
  console.log(`网络: ${connection.networkName}`);
  console.log(`chainId: ${chainId.toString()}`);
  console.log(`当前区块时间: ${currentBlock.timestamp.toString()} (${new Date(Number(currentBlock.timestamp) * 1000).toLocaleString("zh-CN")})`);
  console.log(`Treasury: ${addressBook.treasury}`);
  console.log(`Treasury.multisig: ${treasuryMultisig}`);
  console.log(`Treasury.minDelay: ${treasuryMinDelay.toString()}`);
  console.log(`executeCaller: ${executeCaller}`);

  logSection("已解析合约地址");
  for (const [alias, resolved] of Object.entries(addressBook) as Array<[AddressAlias, Address | undefined]>) {
    console.log(`${alias}: ${resolved ?? "未解析"}`);
  }

  logSection("Timelock 计划");
  if (timelockOperations.length === 0) {
    console.log("未配置任何 Treasury timelock 初始化项");
  } else {
    for (const operation of timelockOperations) {
      const operationId = await operation.getOperationId();
      const alreadyApplied = await operation.isAlreadyApplied();
      const readyAt = await operation.getReadyAt(operationId);
      console.log(`- ${operation.description}`);
      console.log(`  desired: ${operation.desiredStateDescription}`);
      console.log(`  delay: ${operation.delay.toString()}`);
      console.log(`  operationId: ${operationId}`);
      console.log(`  readyAt: ${formatReadyAt(readyAt)}`);
      console.log(`  currentState: ${alreadyApplied ? "已满足" : "未满足"}`);
    }
  }

  if (cli.mode === "plan") {
    logSection("Funding 计划");
    for (const nativeTransfer of config.funding?.nativeTransfers ?? []) {
      console.log(
        `- 原生币转账: ${normalizeBigInt(nativeTransfer.amount).toString()} -> ${resolveAddressLike(nativeTransfer.to, addressBook)}`,
      );
    }
    for (const tokenMint of config.funding?.tokenMints ?? []) {
      console.log(
        `- 代币 mint: token=${resolveAddressLike(tokenMint.token, addressBook)}, to=${resolveAddressLike(tokenMint.to, addressBook)}, amount=${normalizeBigInt(tokenMint.amount).toString()}`,
      );
    }
    for (const tokenTransfer of config.funding?.tokenTransfers ?? []) {
      console.log(
        `- 代币转账: token=${resolveAddressLike(tokenTransfer.token, addressBook)}, to=${resolveAddressLike(tokenTransfer.to, addressBook)}, amount=${normalizeBigInt(tokenTransfer.amount).toString()}`,
      );
    }
    for (const transfer of config.ownershipTransfers ?? []) {
      console.log(
        `- ownership transfer: contract=${resolveAddressLike(transfer.contract, addressBook)} -> ${resolveAddressLike(transfer.newOwner, addressBook)}`,
      );
    }
    return;
  }

  const scheduledOperations: Array<{ operation: TimelockOperation; operationId: Hash; readyAt: bigint }> = [];
  const executableOperations: Array<{ operation: TimelockOperation; operationId: Hash }> = [];

  for (const operation of timelockOperations) {
    const alreadyApplied = await operation.isAlreadyApplied();
    if (alreadyApplied) {
      continue;
    }

    const operationId = await operation.getOperationId();
    let readyAt = await operation.getReadyAt(operationId);

    if ((cli.mode === "schedule" || cli.mode === "all") && readyAt === 0n) {
      const txHash = await operation.schedule(operationId);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      readyAt = await operation.getReadyAt(operationId);
      console.log(`已排期: ${operation.description}, tx=${txHash}, readyAt=${formatReadyAt(readyAt)}`);
    }

    if (readyAt > 0n) {
      scheduledOperations.push({ operation, operationId, readyAt });
    }
  }

  const localChain =
    chainId === 31337 &&
    (connection.networkName === "localhost" ||
      connection.networkName.startsWith("hardhat"));

  if (cli.mode === "all" && scheduledOperations.length > 0) {
    const nowTimestamp = (await publicClient.getBlock()).timestamp;
    const maxReadyAt = scheduledOperations.reduce(
      (maxValue, item) => (item.readyAt > maxValue ? item.readyAt : maxValue),
      0n,
    );

    if (maxReadyAt > nowTimestamp) {
      if (localChain && config.options?.autoMineTimelockOnLocal !== false) {
        const secondsToAdvance = maxReadyAt - nowTimestamp + 1n;
        try {
          await connection.networkHelpers.time.increase(Number(secondsToAdvance));
        } catch {
          await connection.provider.request({
            method: "evm_increaseTime",
            params: [Number(secondsToAdvance)],
          });
          await connection.provider.request({
            method: "evm_mine",
            params: [],
          });
        }
        console.log(`本地链已快进 timelock: +${secondsToAdvance.toString()} 秒`);
      } else {
        throw new Error("当前模式是 all，但存在尚未到期的 timelock 操作；非本地链请先 schedule，等待延迟结束后再 execute");
      }
    }
  }

  if (cli.mode === "execute" || cli.mode === "all") {
    for (const operation of timelockOperations) {
      const alreadyApplied = await operation.isAlreadyApplied();
      if (alreadyApplied) {
        continue;
      }

      const operationId = await operation.getOperationId();
      const readyAt = await operation.getReadyAt(operationId);
      if (readyAt === 0n) {
        console.log(`跳过执行(未排期): ${operation.description}`);
        continue;
      }

      const latestTimestamp = (await publicClient.getBlock()).timestamp;
      if (latestTimestamp < readyAt) {
        console.log(`跳过执行(尚未到期): ${operation.description}, readyAt=${formatReadyAt(readyAt)}`);
        continue;
      }

      executableOperations.push({ operation, operationId });
    }

    for (const item of executableOperations) {
      const txHash = await item.operation.execute(item.operationId);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`已执行: ${item.operation.description}, tx=${txHash}`);
    }
  }

  const ownableAbi = parseAbi(["function owner() view returns (address)", "function transferOwnership(address newOwner)"]);
  const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
  const mintableAbi = parseAbi(["function mint(address to, uint256 amount) returns (bool)"]);

  const defaultFundingSender =
    config.options?.defaultFundingSender === undefined
      ? defaultWalletClient.account.address
      : resolveAddressLike(config.options.defaultFundingSender, addressBook);

  if (cli.mode === "execute" || cli.mode === "all") {
    logSection("Funding 执行");

    for (const item of config.funding?.nativeTransfers ?? []) {
      const sender = resolveAddressLike(item.sender ?? defaultFundingSender, addressBook);
      const to = resolveAddressLike(item.to, addressBook);
      const amount = normalizeBigInt(item.amount);
      const senderWallet = requireWalletClient(sender, "native funding sender");
      const txHash = await senderWallet.sendTransaction({
        to,
        value: amount,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`原生币转账完成: ${amount.toString()} -> ${to}, tx=${txHash}`);
    }

    for (const item of config.funding?.tokenMints ?? []) {
      const sender = resolveAddressLike(item.sender ?? defaultFundingSender, addressBook);
      const token = resolveAddressLike(item.token, addressBook);
      const to = resolveAddressLike(item.to, addressBook);
      const amount = normalizeBigInt(item.amount);
      const senderWallet = requireWalletClient(sender, "token mint sender");
      const txHash = await senderWallet.writeContract({
        address: token,
        abi: mintableAbi,
        functionName: "mint",
        args: [to, amount],
        chain: senderWallet.chain,
        account: senderWallet.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`代币 mint 完成: token=${token}, to=${to}, amount=${amount.toString()}, tx=${txHash}`);
    }

    for (const item of config.funding?.tokenTransfers ?? []) {
      const sender = resolveAddressLike(item.sender ?? defaultFundingSender, addressBook);
      const token = resolveAddressLike(item.token, addressBook);
      const to = resolveAddressLike(item.to, addressBook);
      const amount = normalizeBigInt(item.amount);
      const senderWallet = requireWalletClient(sender, "token transfer sender");
      const txHash = await senderWallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
        chain: senderWallet.chain,
        account: senderWallet.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`代币转账完成: token=${token}, to=${to}, amount=${amount.toString()}, tx=${txHash}`);
    }

    logSection("Ownership 收口");
    for (const item of config.ownershipTransfers ?? []) {
      const contractAddress = resolveAddressLike(item.contract, addressBook);
      const newOwner = resolveAddressLike(item.newOwner, addressBook);
      const ownerReader = await publicClient.readContract({
        address: contractAddress,
        abi: ownableAbi,
        functionName: "owner",
      });

      if (ownerReader.toLowerCase() === newOwner.toLowerCase()) {
        console.log(`已跳过 ownership transfer(已是目标 owner): ${contractAddress}`);
        continue;
      }

      const sender = item.sender === undefined ? ownerReader : resolveAddressLike(item.sender, addressBook);
      const senderWallet = requireWalletClient(sender, "ownership sender");
      const txHash = await senderWallet.writeContract({
        address: contractAddress,
        abi: ownableAbi,
        functionName: "transferOwnership",
        args: [newOwner],
        chain: senderWallet.chain,
        account: senderWallet.account,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`ownership transfer 完成: contract=${contractAddress}, newOwner=${newOwner}, tx=${txHash}`);
    }
  }
}

await main();
