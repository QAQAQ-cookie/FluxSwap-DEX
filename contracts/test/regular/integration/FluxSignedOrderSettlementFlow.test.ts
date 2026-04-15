import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 集成目标：
 * 1. 验证签名订单结算合约与 Factory / Router / Pair 的真实联动。
 * 2. 验证链下签名订单在链上达价后，可通过真实 AMM 路径完成 Token -> Token 与 Token -> ETH 结算。
 * 3. 验证取消、批量 nonce 失效、暂停、受限执行人等最小状态控制在真实流程中生效。
 */
describe("FluxSignedOrderSettlementFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [ownerClient, makerClient, executorClient, recipientClient, strangerClient] =
    await viem.getWalletClients();

  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const maxUint256 = (1n << 256n) - 1n;

  let weth: any;
  let factory: any;
  let router: any;
  let settlement: any;
  let tokenA: any;
  let tokenB: any;
  let pair: any;

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

  it("should settle a signed token-to-token order through the live router and update reserves", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 250n * 10n ** 18n,
      minAmountOut: 480n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 1n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    const reservesBefore = await pair.read.getReserves();
    const recipientBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });

    const reservesAfter = await pair.read.getReserves();
    ok((await tokenB.read.balanceOf([recipientClient.account.address])) > recipientBefore);
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
      triggerPriceX18: 15n * 10n ** 14n,
      expiry: await getDeadline(),
      nonce: 2n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    const balanceBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
      account: executorClient.account.address,
    });

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > balanceBefore);
  });

  it("should block execution after maker cancels the signed order", async function () {
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

    const signature = await signOrder(order);
    await settlement.write.cancelOrder([order], { account: makerClient.account.address });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should block execution for every order inside a batch cancel request", async function () {
    const orderA = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 31n,
      recipient: recipientClient.account.address,
    } as const;

    const orderB = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 120n * 10n ** 18n,
      minAmountOut: 220n * 10n ** 18n,
      triggerPriceX18: 18n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 32n,
      recipient: recipientClient.account.address,
    } as const;

    const signatureA = await signOrder(orderA);
    const signatureB = await signOrder(orderB);

    await settlement.write.batchCancelOrders([[orderA, orderB]], {
      account: makerClient.account.address,
    });

    await expectRevert(
      settlement.write.executeOrder([orderA, signatureA, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );

    await expectRevert(
      settlement.write.executeOrder([orderB, signatureB, await getDeadline()], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should block execution after cancelUpTo invalidates older nonces", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 4n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);
    await settlement.write.cancelUpTo([5n], { account: makerClient.account.address });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
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
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 5n,
      recipient: recipientClient.account.address,
    } as const;

    const signature = await signOrder(order);

    await settlement.write.pause({ account: ownerClient.account.address });
    const pausedReadiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(pausedReadiness[0], false);
    strictEqual(pausedReadiness[1], "PAUSED");

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline()], {
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
      settlement.write.executeOrder([order, signature, await getDeadline()], {
        account: strangerClient.account.address,
      }),
      "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN",
    );

    await settlement.write.executeOrder([order, signature, await getDeadline()], {
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
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(3n),
      nonce: 6n,
      recipient: recipientClient.account.address,
    } as const;

    await networkHelpers.time.increase(5);

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "ORDER_EXPIRED");
  });
});
