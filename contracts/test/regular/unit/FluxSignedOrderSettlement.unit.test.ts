import { ethers } from "ethers";
import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 鍗曞厓鐩爣锛? * 1. 楠岃瘉绛惧悕璁㈠崟鐨勫搱甯屻€侀獙绛俱€佹垚浜や笌 nonce 澶辨晥璇箟銆? * 2. 楠岃瘉鎵ц璐逛粠鎴愪氦杈撳嚭涓墸闄わ紝骞跺垎鍒粨绠楃粰鐢ㄦ埛涓庢墽琛屽櫒銆? * 3. 楠岃瘉绛惧悕鎵归噺 nonce 澶辨晥鎺ュ彛鏇夸唬鏃ч摼涓婃挙鍗曟帴鍙ｅ悗鐨勮涓鸿竟鐣屻€? * 4. 楠岃瘉鏆傚仠銆佸彈闄愭墽琛屽櫒銆佹姤浠蜂笌 readiness reason 绛夊彧璇绘不鐞嗗彛寰勩€? * 5. 楠岃瘉 ERC20 -> ERC20銆丒RC20 -> ETH銆佸師鐢熻緭鍏ヨ涔変笁绫荤粨绠楄矾寰勩€? */
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
  const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

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

  it("should execute a signed ERC20 to ERC20 order and split surplus reward between recipient and executor", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 1n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const orderHash = await settlement.read.hashOrder([order]);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const balanceBefore = await tokenB.read.balanceOf([recipientClient.account.address]);
    const executorBefore = await tokenB.read.balanceOf([executorClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
    });

    strictEqual(await settlement.read.orderExecuted([orderHash]), true);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 1n]), true);
    strictEqual(
      await tokenB.read.balanceOf([recipientClient.account.address]),
      balanceBefore + quote - executorReward,
    );
    strictEqual(
      await tokenB.read.balanceOf([executorClient.account.address]),
      executorBefore + executorReward,
    );
    strictEqual(await tokenB.read.balanceOf([settlement.address]), 0n);
  });

  it("should execute a signed ERC20 to ETH order and pay the executor in ETH", async function () {
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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 14n,
      expiry: await getDeadline(),
      nonce: 2n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const balanceBefore = await publicClient.getBalance({
      address: recipientClient.account.address,
    });
    const executorBefore = await publicClient.getBalance({
      address: executorClient.account.address,
    });

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
      gas: 3_000_000n,
    });

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) >= balanceBefore + quote - executorReward);
    ok((await publicClient.getBalance({ address: executorClient.account.address })) > executorBefore);
    strictEqual(await publicClient.getBalance({ address: settlement.address }), 0n);
  });

  it("should execute a signed native-input order by settling through maker WETH", async function () {
    await factory.write.createPair([tokenA.address, weth.address], {
      account: ownerClient.account.address,
    });
    await addTokenEthLiquidity();

    await weth.write.deposit({
      account: makerClient.account.address,
      value: 5n * 10n ** 18n,
    });
    await weth.write.approve([settlement.address, maxUint256], {
      account: makerClient.account.address,
    });

    const order = {
      maker: makerClient.account.address,
      inputToken: zeroAddress,
      outputToken: tokenA.address,
      amountIn: 1n * 10n ** 18n,
      minAmountOut: 400n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 400n * 10n ** 18n,
      expiry: await getDeadline(),
      nonce: 21n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);
    const quote = await settlement.read.getOrderQuote([order]);
    const executorReward = calculateExecutorReward(order, quote);
    const tokenBefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    const executorBefore = await tokenA.read.balanceOf([executorClient.account.address]);
    const wethBefore = await weth.read.balanceOf([makerClient.account.address]);

    await settlement.write.executeOrder([order, signature, await getDeadline(), executorReward], {
      account: executorClient.account.address,
    });

    strictEqual(await tokenA.read.balanceOf([recipientClient.account.address]), tokenBefore + quote - executorReward);
    strictEqual(await tokenA.read.balanceOf([executorClient.account.address]), executorBefore + executorReward);
    ok((await weth.read.balanceOf([makerClient.account.address])) < wethBefore);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 21n]), true);
    strictEqual(await tokenA.read.balanceOf([settlement.address]), 0n);
  });

  it("should reject execution when the signature is invalid", async function () {
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

    const signature = await signOrder(order, strangerClient);

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 25n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 4n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: PRICE_NOT_REACHED",
    );
  });

  it("should reject execution once the order nonce has been invalidated by signature", async function () {
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

    const deadline = await getDeadline();
    const signature = await signOrder(order);
    const revokeSignature = await signInvalidateNonces([5n], deadline);

    await settlement.write.invalidateNoncesBySig(
      [makerClient.account.address, [5n], deadline, revokeSignature],
      { account: executorClient.account.address },
    );

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should invalidate multiple nonces with a single maker signature", async function () {
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces([15n, 16n], deadline);

    await settlement.write.invalidateNoncesBySig(
      [makerClient.account.address, [15n, 16n], deadline, revokeSignature],
      { account: strangerClient.account.address },
    );

    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 15n]), true);
    strictEqual(await settlement.read.invalidatedNonce([makerClient.account.address, 16n]), true);
  });

  it("should reject batch nonce invalidation when the signature is not from maker", async function () {
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces(
      [17n],
      deadline,
      strangerClient,
      makerClient.account.address,
    );

    await expectRevert(
      settlement.write.invalidateNoncesBySig(
        [makerClient.account.address, [17n], deadline, revokeSignature],
        { account: executorClient.account.address },
      ),
      "FluxSignedOrderSettlement: INVALID_SIGNATURE",
    );
  });

  it("should reject expired batch nonce invalidation signatures", async function () {
    const expiredDeadline = (await publicClient.getBlock()).timestamp - 1n;
    const revokeSignature = await signInvalidateNonces([18n], expiredDeadline);

    await expectRevert(
      settlement.write.invalidateNoncesBySig(
        [makerClient.account.address, [18n], expiredDeadline, revokeSignature],
        { account: executorClient.account.address },
      ),
      "FluxSignedOrderSettlement: EXPIRED",
    );
  });

  it("should reject empty nonce invalidation requests", async function () {
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces([], deadline);

    await expectRevert(
      settlement.write.invalidateNoncesBySig(
        [makerClient.account.address, [], deadline, revokeSignature],
        { account: executorClient.account.address },
      ),
      "FluxSignedOrderSettlement: EMPTY_NONCES",
    );
  });

  it("should reject duplicate nonces inside the same invalidation batch", async function () {
    const deadline = await getDeadline();
    const revokeSignature = await signInvalidateNonces([19n, 19n], deadline);

    await expectRevert(
      settlement.write.invalidateNoncesBySig(
        [makerClient.account.address, [19n, 19n], deadline, revokeSignature],
        { account: executorClient.account.address },
      ),
      "FluxSignedOrderSettlement: NONCE_INVALIDATED",
    );
  });

  it("should support restricted executor mode", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 8n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

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
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: strangerClient.account.address,
      }),
      "FluxSignedOrderSettlement: EXECUTOR_FORBIDDEN",
    );

    await settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 11n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    await settlement.write.pause({ account: ownerClient.account.address });

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "PAUSED");

    const signature = await signOrder(order);
    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 12n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 13n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const signature = await signOrder(order);

    await settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
      account: executorClient.account.address,
    });

    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
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
      maxExecutorRewardBps: 3_000n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 14n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const hashA = await settlement.read.hashOrder([order]);
    const hashB = await settlement.read.hashOrder([order]);
    strictEqual(hashA, hashB);

    const quote = await settlement.read.getOrderQuote([order]);
    ok(quote >= order.minAmountOut);
  });

  it("should reject orders whose executor reward bps is above 100%", async function () {
    const order = {
      maker: makerClient.account.address,
      inputToken: tokenA.address,
      outputToken: tokenB.address,
      amountIn: 100n * 10n ** 18n,
      minAmountOut: 190n * 10n ** 18n,
      maxExecutorRewardBps: 10_001n,
      triggerPriceX18: 19n * 10n ** 17n,
      expiry: await getDeadline(),
      nonce: 22n,
      recipient: recipientClient.account.address,
    } as const satisfies SettlementOrder;

    const readiness = await settlement.read.canExecuteOrder([order]);
    strictEqual(readiness[0], false);
    strictEqual(readiness[1], "INVALID_EXECUTOR_REWARD_BPS");

    const signature = await signOrder(order);
    await expectRevert(
      settlement.write.executeOrder([order, signature, await getDeadline(), 0n], {
        account: executorClient.account.address,
      }),
      "FluxSignedOrderSettlement: INVALID_EXECUTOR_REWARD_BPS",
    );
  });
});
