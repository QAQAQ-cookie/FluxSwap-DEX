import { ethers } from "ethers";
import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 闆嗘垚鐩爣锛? * 1. 楠岃瘉绛惧悕璁㈠崟缁撶畻鍚堢害涓?Factory銆丷outer銆丳air 鐨勭湡瀹炶仈鍔ㄣ€? * 2. 楠岃瘉閾句笅绛惧悕璁㈠崟鍦ㄩ摼涓婅揪鍒版潯浠跺悗锛屽彲浠ヨ蛋鐪熷疄 AMM 璺緞瀹屾垚缁撶畻涓庢墽琛岃垂鍒嗛厤銆? * 3. 楠岃瘉绛惧悕鎵归噺 nonce 澶辨晥銆佹殏鍋滀笌 restricted executor 绛栫暐鍦ㄩ泦鎴愭祦杞腑鐢熸晥銆? */
describe("FluxSignedOrderSettlementFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [ownerClient, makerClient, executorClient, recipientClient, strangerClient] =
    await viem.getWalletClients();

  const zeroAddress = "0x0000000000000000000000000000000000000000" as const;
  const maxUint256 = (1n << 256n) - 1n;

  let weth: any;
  let factory: any;
  let router: any;
  let settlement: any;
  let tokenA: any;
  let tokenB: any;
  let pair: any;

  type SettlementOrder = {
    maker: `0x${string}`;
    inputToken: `0x${string}`;
    outputToken: `0x${string}`;
    amountIn: bigint;
    minAmountOut: bigint;
    maxExecutorRewardBps: bigint;
    triggerPriceX18: bigint;
    expiry: bigint;
    nonce: bigint;
    recipient: `0x${string}`;
  };

  async function getDeadline(offset = 3600n) {
    return (await publicClient.getBlock()).timestamp + offset;
  }

  const expectRevert = async (promise: Promise<unknown>, reason: string) => {
    let error: any;
    try {
      await promise;
    } catch (e) {
      error = e;
    }

    ok(error, `Expected revert with reason: ${reason}`);

    const errorText = [error?.details, error?.shortMessage, error?.message, String(error)]
      .filter((value): value is string => typeof value === "string")
      .join("\n");

    ok(errorText.includes(reason), `Expected revert reason "${reason}", got: ${errorText}`);
  };

  async function signOrder(order: SettlementOrder, signer = makerClient) {
    return signer.signTypedData({
      account: signer.account,
      domain: {
        name: "Flux Signed Order Settlement",
        version: "1",
        chainId: Number(await publicClient.getChainId()),
        verifyingContract: settlement.address,
      },
      types: {
        SignedOrder: [
          { name: "maker", type: "address" },
          { name: "inputToken", type: "address" },
          { name: "outputToken", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "maxExecutorRewardBps", type: "uint256" },
          { name: "triggerPriceX18", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      primaryType: "SignedOrder",
      message: order,
    });
  }

  function calculateExecutorReward(order: SettlementOrder, amountOut: bigint) {
    if (amountOut <= order.minAmountOut) {
      return 0n;
    }

    const surplus = amountOut - order.minAmountOut;
    return (surplus * order.maxExecutorRewardBps) / 10_000n;
  }

  async function signInvalidateNonces(
    nonces: bigint[],
    deadline: bigint,
    signer = makerClient,
    maker = makerClient.account.address,
  ) {
    const noncesHash =
      nonces.length === 0
        ? ethers.keccak256("0x")
        : ethers.solidityPackedKeccak256(
            new Array(nonces.length).fill("uint256"),
            nonces,
          );

    return signer.signTypedData({
      account: signer.account,
      domain: {
        name: "Flux Signed Order Settlement",
        version: "1",
        chainId: Number(await publicClient.getChainId()),
        verifyingContract: settlement.address,
      },
      types: {
        InvalidateNonces: [
          { name: "maker", type: "address" },
          { name: "noncesHash", type: "bytes32" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "InvalidateNonces",
      message: {
        maker,
        noncesHash,
        deadline,
      },
    });
  }

  async function seedTokenPair(amountA = 20_000n * 10n ** 18n, amountB = 40_000n * 10n ** 18n) {
    await tokenA.write.approve([router.address, amountA], { account: makerClient.account.address });
    await tokenB.write.approve([router.address, amountB], { account: makerClient.account.address });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        0n,
        0n,
        makerClient.account.address,
        await getDeadline(),
      ],
      { account: makerClient.account.address },
    );

    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);
  }

  async function seedTokenEthPair(amountToken = 20_000n * 10n ** 18n, amountEth = 40n * 10n ** 18n) {
    await tokenA.write.approve([router.address, amountToken], { account: makerClient.account.address });
    await router.write.addLiquidityETH(
      [tokenA.address, amountToken, 0n, 0n, makerClient.account.address, await getDeadline()],
      { account: makerClient.account.address, value: amountEth },
    );
  }

  beforeEach(async function () {
    weth = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [ownerClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, weth.address]);
    settlement = await viem.deployContract("FluxSignedOrderSettlement", [router.address]);

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([makerClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([makerClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.approve([router.address, maxUint256], { account: makerClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: makerClient.account.address });
    await tokenA.write.approve([settlement.address, maxUint256], { account: makerClient.account.address });

    await seedTokenPair();
  });

  it("should settle a signed token-to-token order through the live router and split surplus reward", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 250n * 10n ** 18n,
      minAmountOut: 480n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 1n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const reservesBefore = await pair.read.getReserves();
    const recipientBefore = await tokenB.read.balanceOf([recipientClient.account.address]);
    const executorBefore = await tokenB.read.balanceOf([executorClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
    });

    const reservesAfter = await pair.read.getReserves();
    strictEqual(
      await tokenB.read.balanceOf([recipientClient.account.address]),
      recipientBefore + quote - executorReward,
    );
    strictEqual(
      await tokenB.read.balanceOf([executorClient.account.address]),
      executorBefore + executorReward,
    );
    strictEqual(await tokenB.read.balanceOf([settlement.address]), 0n);
    ok(reservesBefore[0] !== reservesAfter[0] || reservesBefore[1] !== reservesAfter[1]);
  });

  it("should settle a signed token-to-ETH order through the live router", async function () {
    await factory.write.createPair([tokenA.address, weth.address], {
      account: ownerClient.account.address,
    });
    await seedTokenEthPair();

    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: zeroAddress,
      amountIn: 200n * 10n ** 18n,
      minAmountOut: 3n * 10n ** 17n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 15n * 10n ** 14n,
      expiry: await getDeadline(),
      nonce: 2n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const balanceBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
      gas: 3_000_000n,
    });

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) >= balanceBefore + quote - executorReward);
    strictEqual(await publicClient.getBalance({ address: settlement.address }), 0n);
  });

  it("should settle a signed native-input order through WETH in the live router", async function () {
    await factory.write.createPair([tokenA.address, weth.address], {
      account: ownerClient.account.address,
    });
    await seedTokenEthPair();

    await weth.write.deposit({
      account: makerClient.account.address,
      value: 5n * 10n ** 18n,
    });
    await weth.write.approve([settlement.address, maxUint256], {
      account: makerClient.account.address,
    });

    const wethPairAddress = await factory.read.getPair([tokenA.address, weth.address]);
    const wethPair = await viem.getContractAt("FluxSwapPair", wethPairAddress);

    const order = {
      maker: makerClient.account.address,
      inputToken: zeroAddress,
      outputToken: tokenA.address,
      amountIn: 1n * 10n ** 18n,
      minAmountOut: 400n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 400n * 10n ** 18n,
      expiry: await getDeadline(),
      nonce: 7n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const reservesBefore = await wethPair.read.getReserves();
    const tokenBefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    const executorBefore = await tokenA.read.balanceOf([executorClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
    });

    const reservesAfter = await wethPair.read.getReserves();
    strictEqual(await tokenA.read.balanceOf([recipientClient.account.address]), tokenBefore + quote - executorReward);
    strictEqual(await tokenA.read.balanceOf([executorClient.account.address]), executorBefore + executorReward);
    strictEqual(await tokenA.read.balanceOf([settlement.address]), 0n);
    ok(reservesBefore[0] !== reservesAfter[0] || reservesBefore[1] !== reservesAfter[1]);
  });

  it("should block execution after maker invalidates the signed order nonce by signature", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 3n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces([3n], deadline);

    await settlement.write.invalidateNoncesBySig(
      [makerClient.account.address, [3n], deadline, revokeSignature],
      { account: strangerClient.account.address },
    );

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should block execution for every order inside a signed nonce invalidation batch", async function () {
    const orderA = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 31n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const orderB = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 120n * 10n ** 18n,
      minAmountOut: 220n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 18n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 32n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signatureA = await signOrder(orderA);
    const signatureB = await signOrder(orderB);
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces([31n, 32n], deadline);

    await settlement.write.invalidateNoncesBySig(
      [makerClient.account.address, [31n, 32n], deadline, revokeSignature],
      { account: executorClient.account.address },
    );

    await expectRevert(
      settlement.write.executeOrder([orderA, signatureA, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );

    await expectRevert(
      settlement.write.executeOrder([orderB, signatureB, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should enforce pause and restricted executor policy in the integrated flow", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 5n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);

    await settlement.write.pause({ account: ownerClient.account.address });
    const pausedReadiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(pausedReadiness[0], false);
    strictEqual(pausedReadiness[1], "PAUSED");

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: PAUSED",
    );

    await settlement.write.unpause({ account: ownerClient.account.address });
    await settlement.write.setRestrictedExecutor([executorClient.account.address], {
      account: ownerClient.account.address,
    });
    await settlement.write.setExecutorRestriction([true], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: strangerClient.account.address,
      }),
      "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN",
    );

    await settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
      account: executorClient.account.address,
    });
  });

  it("should report expired signed orders as non-executable", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(3n),
      nonce: 6n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    await networkHelpers.time.increase(5);

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "ORDER_EXPIRED");
  });
});
