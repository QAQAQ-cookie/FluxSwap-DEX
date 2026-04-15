import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证链下签名订单的哈希、验签、成交、取消与 nonce 失效逻辑。
 * 2. 验证订单不落链主数据时，链上最小状态仍能正确防重放、防重复执行。
 * 3. 验证暂停、受限执行人、批量取消、价格未达与过期等治理风控分支。
 * 4. 验证 ERC20 -> ERC20 与 ERC20 -> ETH 的 AMM 结算路径。
 */
describe("FluxSignedOrderSettlement", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [ownerClient, makerClient, executorClient, recipientClient, strangerClient] =
    await viem.getWalletClients();

  let weth: any;
  let factory: any;
  let router: any;
  let settlement: any;
  let tokenA: any;
  let tokenB: any;

  const maxUint256 = (1n << 256n) - 1n;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

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

  async function getDeadline(offset = 3600n) {
    return (await publicClient.getBlock()).timestamp + offset;
  }

  async function addTokenLiquidity(amountA = 10_000n * 10n ** 18n, amountB = 20_000n * 10n ** 18n) {
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
  }

  async function addTokenEthLiquidity(amountToken = 10_000n * 10n ** 18n, amountEth = 20n * 10n ** 18n) {
    await tokenA.write.approve([router.address, amountToken], { account: makerClient.account.address });

    await router.write.addLiquidityETH(
      [tokenA.address, amountToken, 0n, 0n, makerClient.account.address, await getDeadline()],
      { account: makerClient.account.address, value: amountEth },
    );
  }

  async function signOrder(order: {
    maker: `0x${string}`;
    inputToken: `0x${string}`;
    outputToken: `0x${string}`;
    amountIn: bigint;
    minAmountOut: bigint;
    triggerPriceX18: bigint;
    expiry: bigint;
    nonce: bigint;
    recipient: `0x${string}`;
  }) {
    return makerClient.signTypedData({
      account: makerClient.account,
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

  beforeEach(async function () {
    weth = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [ownerClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, weth.address]);
    settlement = await viem.deployContract("FluxSignedOrderSettlement", [router.address]);

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([makerClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([makerClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([recipientClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([recipientClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: makerClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: makerClient.account.address });
    await tokenA.write.approve([settlement.address, maxUint256], { account: makerClient.account.address });

    await addTokenLiquidity();
  });

  it("should execute a signed ERC20 to ERC20 order once the trigger price is reached", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 1n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    const orderHash = await settlement.read.hashOrder([order]);
    const balanceBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });

    strictEqual(await settlement.read.orderExecuted([orderHash]), true);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 1n]), true);
    ok((await tokenB.read.balanceOf([recipientClient.account.address])) > balanceBefore);
  });

  it("should execute a signed ERC20 to ETH order", async function () {
    await factory.write.createPair([tokenA.address, weth.address], {
      account: ownerClient.account.address,
    });
    await addTokenEthLiquidity();

    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: zeroAddress,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 19n * 10n ** 16n,
      triggerPriceX18: 19n * 10n ** 14n,
      expiry: await getDeadline(),
      nonce: 2n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    const balanceBefore = await publicClient.getBalance({
      address: recipientClient.account.address,
    });

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > balanceBefore);
  });

  it("should reject execution when the signature is invalid", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 3n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await strangerClient.signTypedData({
      account: strangerClient.account,
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
          { name: "triggerPriceX18", type: "uint256" },
          { name: "expiry", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      primaryType: "SignedOrder",
      message: order,
    });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: INVALID_SIGNATURE",
    );
  });

  it("should reject execution when the trigger price is not reached", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 25n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 4n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: PRICE_NOT_REACHED",
    );
  });

  it("should reject execution once the order nonce has been invalidated", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 5n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    await settlement.write.invalidateNonce([5n], { account: makerClient.account.address });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should let the maker cancel a specific signed order hash", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 6n,
      recipient: recipientClient.account.address,
    } as const;

    const orderHash = await settlement.read.hashOrder([order]);
    await settlement.write.cancelOrder([order], { account: makerClient.account.address });

    strictEqual(await settlement.read.orderExecuted([orderHash]), false);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 6n]), true);
  });

  it("should let the maker batch cancel multiple signed orders", async function () {
    const orderA = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 90n * 10n ** 18n,
      minAmountOut: 170n * 10n ** 18n,
      triggerPriceX18: 18n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 15n,
      recipient: recipientClient.account.address,
    } as const;

    const orderB = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 110n * 10n ** 18n,
      minAmountOut: 210n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 16n,
      recipient: recipientClient.account.address,
    } as const;

    await settlement.write.batchCancelOrders([[orderA, orderB]], {
      account: makerClient.account.address,
    });

    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 15n]), true);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 16n]), true);
  });

  it("should reject batch cancel when the caller is not the maker", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 17n,
      recipient: recipientClient.account.address,
    } as const;

    await expectRevert(
      settlement.write.batchCancelOrders([[order]], { account: strangerClient.account.address }),
      "FluxSignedOrderSettlement: NOT_MAKER",
    );
  });

  it("should reject empty batch cancel requests", async function () {
    await expectRevert(
      settlement.write.batchCancelOrders([[]], { account: makerClient.account.address }),
      "FluxSignedOrderSettlement: EMPTY_BATCH",
    );
  });

  it("should support bulk nonce invalidation through cancelUpTo", async function () {
    await settlement.write.cancelUpTo([10n], { account: makerClient.account.address });

    strictEqual(await settlement.read.minValidNonce([makerClient.account.address]), 10n);

    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 9n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should only allow the maker to cancel the order", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 7n,
      recipient: recipientClient.account.address,
    } as const;

    await expectRevert(
      settlement.write.cancelOrder([order], { account: strangerClient.account.address }),
      "FluxSignedOrderSettlement: NOT_MAKER",
    );
  });

  it("should support restricted executor mode", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 8n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);

    await expectRevert(
      settlement.write.setExecutorRestriction([true], { account: ownerClient.account.address }),
      "FluxSignedOrderSettlement: ZERO_EXECUTOR",
    );

    await settlement.write.setRestrictedExecutor([executorClient.account.address], {
      account: ownerClient.account.address,
    });
    await settlement.write.setExecutorRestriction([true], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: strangerClient.account.address,
      }),
      "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN",
    );

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });
  });

  it("should block execution while paused and expose readiness reasons", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 11n,
      recipient: recipientClient.account.address,
    } as const;

    await settlement.write.pause({ account: ownerClient.account.address });

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "PAUSED");

    const signature = await signOrder(order);
    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: PAUSED",
    );
  });

  it("should report missing executor when restriction is enabled without a current executor", async function () {
    await settlement.write.setRestrictedExecutor([executorClient.account.address], {
      account: ownerClient.account.address,
    });
    await settlement.write.setExecutorRestriction([true], {
      account: ownerClient.account.address,
    });
    await settlement.write.setRestrictedExecutor([zeroAddress], {
      account: ownerClient.account.address,
    });

    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 12n,
      recipient: recipientClient.account.address,
    } as const;

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "EXECUTOR_NOT_SET");
  });

  it("should reject duplicate execution of the same signed order", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 13n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: ORDER_ALREADY_EXECUTED",
    );
  });

  it("should expose deterministic order hashing and quote lookup", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 14n,
      recipient: recipientClient.account.address,
    } as const;

    const hashA = await settlement.read.hashOrder([order]);
    const hashB = await settlement.read.hashOrder([order]);
    strictEqual(hashA, hashB);

    const quote = await settlement.read.getOrderQuote([order]);
    ok(quote >= order.minAmountOut);
  });
});
