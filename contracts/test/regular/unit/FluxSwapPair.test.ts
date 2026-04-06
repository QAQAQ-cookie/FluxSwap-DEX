import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { encodeAbiParameters, parseSignature } from "viem";

describe("FluxSwapPair", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [deployerClient, lpClient, traderClient, recipientClient, otherClient] = await viem.getWalletClients();

  let factory: any;
  let pair: any;
  let tokenA: any;
  let tokenB: any;

  const feeBase = 10000n;
  const totalFeeBps = 30n;
  const protocolFeeBps = 5n;

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

  const getAmountOut = (amountIn: bigint, reserveIn: bigint, reserveOut: bigint) => {
    const amountInWithFee = amountIn * (feeBase - totalFeeBps);
    return (amountInWithFee * reserveOut) / (reserveIn * feeBase + amountInWithFee);
  };

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  async function signPermit(ownerClient: any, spender: `0x${string}`, value: bigint, deadline: bigint) {
    const nonce = await pair.read.nonces([ownerClient.account.address]);
    const signature = await ownerClient.signTypedData({
      account: ownerClient.account,
      domain: {
        name: "FluxSwap LP",
        version: "1",
        chainId: Number(await publicClient.getChainId()),
        verifyingContract: pair.address,
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: ownerClient.account.address,
        spender,
        value,
        nonce,
        deadline,
      },
    });

    return parseSignature(signature);
  }

  async function seedLiquidity(amountA = 10_000n * 10n ** 18n, amountB = 10_000n * 10n ** 18n) {
    await tokenA.write.transfer([pair.address, amountA], { account: lpClient.account.address });
    await tokenB.write.transfer([pair.address, amountB], { account: lpClient.account.address });
    await pair.write.mint([lpClient.account.address], { account: lpClient.account.address });
  }

  beforeEach(async function () {
    factory = await viem.deployContract("FluxSwapFactory", [deployerClient.account.address]);
    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await factory.write.createPair([tokenA.address, tokenB.address]);
    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
  });

  it("should only allow the factory to initialize a pair once with valid tokens", async function () {
    const standalonePair = await viem.deployContract("FluxSwapPair", []);

    await expectRevert(
      standalonePair.write.initialize([tokenA.address, tokenB.address], {
        account: otherClient.account.address,
      }),
      "FluxSwap: FORBIDDEN"
    );

    await expectRevert(
      standalonePair.write.initialize([tokenA.address, tokenA.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: IDENTICAL_ADDRESSES"
    );

    await expectRevert(
      standalonePair.write.initialize(["0x0000000000000000000000000000000000000000", tokenB.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: ZERO_ADDRESS"
    );

    await standalonePair.write.initialize([tokenA.address, tokenB.address], {
      account: deployerClient.account.address,
    });

    await expectRevert(
      standalonePair.write.initialize([tokenB.address, tokenA.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: ALREADY_INITIALIZED"
    );
  });

  it("should mint initial liquidity, update reserves, and lock minimum liquidity", async function () {
    await seedLiquidity();

    const [reserve0, reserve1] = await pair.read.getReserves();
    const totalSupply = await pair.read.totalSupply();
    const burnedLiquidity = await pair.read.balanceOf(["0x0000000000000000000000000000000000000000"]);

    strictEqual(reserve0, 10_000n * 10n ** 18n);
    strictEqual(reserve1, 10_000n * 10n ** 18n);
    strictEqual(burnedLiquidity, 1000n);
    ok(totalSupply > burnedLiquidity, "liquidity should be minted to the LP after locking the minimum");
  });

  it("should burn LP tokens back into the underlying assets proportionally", async function () {
    await seedLiquidity();

    const liquidity = await pair.read.balanceOf([lpClient.account.address]);
    const tokenABefore = await tokenA.read.balanceOf([lpClient.account.address]);
    const tokenBBefore = await tokenB.read.balanceOf([lpClient.account.address]);

    await pair.write.transfer([pair.address, liquidity], { account: lpClient.account.address });
    await pair.write.burn([lpClient.account.address], { account: lpClient.account.address });

    ok(await tokenA.read.balanceOf([lpClient.account.address]) > tokenABefore);
    ok(await tokenB.read.balanceOf([lpClient.account.address]) > tokenBBefore);
    strictEqual(await pair.read.balanceOf([lpClient.account.address]), 0n);
  });

  it("should collect protocol fees during swaps when a treasury is configured", async function () {
    await seedLiquidity();
    await factory.write.setTreasury([recipientClient.account.address], {
      account: deployerClient.account.address,
    });

    const pairToken0 = String(await pair.read.token0()).toLowerCase();
    const pairToken1 = String(await pair.read.token1()).toLowerCase();
    const tokenAAddress = String(tokenA.address).toLowerCase();
    const tokenBAddress = String(tokenB.address).toLowerCase();
    const [reserve0, reserve1] = await pair.read.getReserves();

    const amountIn = 100n * 10n ** 18n;
    const reserveA = pairToken0 === tokenAAddress ? reserve0 : reserve1;
    const reserveB = pairToken1 === tokenBAddress ? reserve1 : reserve0;
    const amountOut = getAmountOut(amountIn, reserveA, reserveB);
    const expectedProtocolFee = (amountIn * protocolFeeBps) / feeBase;
    const traderTokenBBefore = await tokenB.read.balanceOf([traderClient.account.address]);
    const amount0Out = pairToken0 === tokenBAddress ? amountOut : 0n;
    const amount1Out = pairToken1 === tokenBAddress ? amountOut : 0n;

    await tokenA.write.transfer([pair.address, amountIn], { account: traderClient.account.address });
    await pair.write.swap([amount0Out, amount1Out, traderClient.account.address, "0x"], {
      account: traderClient.account.address,
    });

    strictEqual(await tokenA.read.balanceOf([recipientClient.account.address]), expectedProtocolFee);
    ok(await tokenB.read.balanceOf([traderClient.account.address]) > traderTokenBBefore);
  });

  it("should reject invalid swap outputs, recipients, and liquidity requests", async function () {
    await seedLiquidity();
    const [reserve0] = await pair.read.getReserves();

    await expectRevert(
      pair.write.swap([0n, 0n, traderClient.account.address, "0x"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    );

    await expectRevert(
      pair.write.swap([reserve0, 0n, traderClient.account.address, "0x"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: INSUFFICIENT_LIQUIDITY"
    );

    await expectRevert(
      pair.write.swap([1n, 0n, await pair.read.token0(), "0x"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: INVALID_TO"
    );

    await expectRevert(
      pair.write.swap([1n, 0n, traderClient.account.address, "0x"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: INSUFFICIENT_INPUT_AMOUNT"
    );
  });

  it("should reject swaps that break the constant product invariant", async function () {
    await seedLiquidity();

    const pairToken0 = String(await pair.read.token0()).toLowerCase();
    const tokenAAddress = String(tokenA.address).toLowerCase();
    const tokenBAddress = String(tokenB.address).toLowerCase();
    const [reserve0, reserve1] = await pair.read.getReserves();
    const reserveIn = pairToken0 === tokenAAddress ? reserve0 : reserve1;
    const reserveOut = pairToken0 === tokenAAddress ? reserve1 : reserve0;
    const amountIn = 1n * 10n ** 18n;
    const excessiveOut = getAmountOut(amountIn, reserveIn, reserveOut) + 1n;

    await tokenA.write.transfer([pair.address, amountIn], { account: traderClient.account.address });

    await expectRevert(
      pair.write.swap(
        [
          pairToken0 === tokenBAddress ? excessiveOut : 0n,
          pairToken0 === tokenAAddress ? excessiveOut : 0n,
          traderClient.account.address,
          "0x",
        ],
        { account: traderClient.account.address }
      ),
      "FluxSwap: K"
    );
  });

  it("should support flash swaps with full repayment and reject partial repayment", async function () {
    await seedLiquidity();

    const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);
    const partialReceiver = await viem.deployContract("MockPartialFlashSwapReceiver", []);
    const token0Address = String(await pair.read.token0()).toLowerCase();
    const token0Contract = token0Address === String(tokenA.address).toLowerCase() ? tokenA : tokenB;
    const [reserve0Before] = await pair.read.getReserves();

    const amountOut = 100n * 10n ** 18n;
    const repayAmount = (amountOut * feeBase) / (feeBase - totalFeeBps) + 1n;
    await token0Contract.write.mint([flashReceiver.address, repayAmount]);

    const data = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [token0Contract.address, repayAmount]
    );

    await pair.write.swap([amountOut, 0n, flashReceiver.address, data], {
      account: traderClient.account.address,
    });

    strictEqual((await pair.read.getReserves())[0], reserve0Before - amountOut + repayAmount);

    await expectRevert(
      pair.write.swap([amountOut, 0n, partialReceiver.address, "0x01"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: K"
    );
  });

  it("should support permit-based approvals and transferFrom through the inherited ERC20 layer", async function () {
    await seedLiquidity();

    const transferAmount = 1n * 10n ** 18n;
    const deadline = await getDeadline();
    const signature = await signPermit(lpClient, traderClient.account.address, transferAmount, deadline);

    await pair.write.permit(
      [
        lpClient.account.address,
        traderClient.account.address,
        transferAmount,
        deadline,
        signature.v,
        signature.r,
        signature.s,
      ],
      { account: traderClient.account.address }
    );

    strictEqual(await pair.read.allowance([lpClient.account.address, traderClient.account.address]), transferAmount);
    strictEqual(await pair.read.nonces([lpClient.account.address]), 1n);

    await pair.write.transferFrom([lpClient.account.address, recipientClient.account.address, transferAmount], {
      account: traderClient.account.address,
    });

    strictEqual(await pair.read.balanceOf([recipientClient.account.address]), transferAmount);
    strictEqual(await pair.read.allowance([lpClient.account.address, traderClient.account.address]), 0n);
  });

  it("should skim excess balances and sync reserves to actual balances", async function () {
    await seedLiquidity();

    const pairToken0 = String(await pair.read.token0()).toLowerCase();
    const token0Contract = pairToken0 === String(tokenA.address).toLowerCase() ? tokenA : tokenB;
    const token1Contract = pairToken0 === String(tokenA.address).toLowerCase() ? tokenB : tokenA;
    const [reserve0Before, reserve1Before] = await pair.read.getReserves();

    const skimAmount = 50n * 10n ** 18n;
    const syncAmount = 25n * 10n ** 18n;
    const recipientBefore = await token0Contract.read.balanceOf([recipientClient.account.address]);

    await token0Contract.write.transfer([pair.address, skimAmount], { account: lpClient.account.address });
    await pair.write.skim([recipientClient.account.address], { account: traderClient.account.address });

    strictEqual(
      (await token0Contract.read.balanceOf([recipientClient.account.address])) - recipientBefore,
      skimAmount
    );
    strictEqual((await pair.read.getReserves())[0], reserve0Before);
    strictEqual((await pair.read.getReserves())[1], reserve1Before);

    await token1Contract.write.transfer([pair.address, syncAmount], { account: lpClient.account.address });
    await pair.write.sync({ account: traderClient.account.address });

    const [reserve0AfterSync, reserve1AfterSync] = await pair.read.getReserves();
    strictEqual(await token0Contract.read.balanceOf([pair.address]), reserve0AfterSync);
    strictEqual(await token1Contract.read.balanceOf([pair.address]), reserve1AfterSync);
    strictEqual(reserve0AfterSync, reserve0Before);
    strictEqual(reserve1AfterSync, reserve1Before + syncAmount);
  });
});
