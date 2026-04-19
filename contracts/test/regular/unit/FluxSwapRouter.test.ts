import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { parseSignature } from "viem";

/*
 * 单元目标：
 * 1. 验证构造参数、报价 helper 与无效 helper 输入。
 * 2. 验证过期调用、非法 ETH path、缺失 pair 等前置校验。
 * 3. 验证 exact-input / exact-output 的 token、ETH 各类 swap 入口。
 * 4. 验证 token 与 ETH 流动性的添加、移除、permit 移除路径。
 * 5. 验证 amountMin / liquidityMin 等滑点保护与非法 path 拒绝逻辑。
 */
describe("FluxSwapRouter", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [deployerClient, lpClient, traderClient, recipientClient] = await viem.getWalletClients();

  let factory: any;
  let router: any;
  let pair: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;

  const maxUint256 = (1n << 256n) - 1n;

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

  async function signPairPermit(ownerClient: any, pairContract: any, value: bigint, deadline: bigint, approveMax = false) {
    const nonce = await pairContract.read.nonces([ownerClient.account.address]);
    const signature = await ownerClient.signTypedData({
      account: ownerClient.account,
      domain: {
        name: "FluxSwap LP",
        version: "1",
        chainId: Number(await publicClient.getChainId()),
        verifyingContract: pairContract.address,
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
        spender: router.address,
        value: approveMax ? maxUint256 : value,
        nonce,
        deadline,
      },
    });

    return parseSignature(signature);
  }

  async function createTokenEthLiquidity(token: any, amountToken = 10_000n * 10n ** 18n, amountETH = 10n * 10n ** 18n) {
    await token.write.approve([router.address, amountToken], {
      account: lpClient.account.address,
    });

    await router.write.addLiquidityETH(
      [token.address, amountToken, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: amountETH }
    );

    const pairAddress = await factory.read.getPair([token.address, WETH.address]);
    return viem.getContractAt("FluxSwapPair", pairAddress);
  }

  beforeEach(async function () {
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [deployerClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: traderClient.account.address });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);
  });

  it("should validate constructor inputs", async function () {
    await expectRevert(
      viem.deployContract("FluxSwapRouter", ["0x0000000000000000000000000000000000000000", WETH.address]),
      "FluxSwapRouter: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxSwapRouter", [factory.address, "0x0000000000000000000000000000000000000000"]),
      "FluxSwapRouter: ZERO_ADDRESS"
    );
  });

  it("should expose helper functions and reject invalid helper inputs", async function () {
    strictEqual(await router.read.quote([1_000n, 2_000n, 4_000n]), 2_000n);
    strictEqual(await router.read.getAmountOut([1_000n, 10_000n, 20_000n]) > 0n, true);
    strictEqual(await router.read.getAmountIn([1_000n, 20_000n, 10_000n]) > 1_000n, true);

    await expectRevert(router.read.quote([0n, 2_000n, 4_000n]), "FluxSwapRouter: INSUFFICIENT_AMOUNT");
    await expectRevert(
      router.read.getAmountOut([0n, 10_000n, 20_000n]),
      "FluxSwapRouter: INSUFFICIENT_INPUT_AMOUNT"
    );
    await expectRevert(
      router.read.getAmountIn([0n, 20_000n, 10_000n]),
      "FluxSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT"
    );
    await expectRevert(router.read.getAmountsOut([1n, [tokenA.address]]), "FluxSwapRouter: INVALID_PATH");
    await expectRevert(router.read.getAmountsIn([1n, [tokenA.address]]), "FluxSwapRouter: INVALID_PATH");
  });

  it("should reject expired calls, invalid ETH paths, and missing pairs", async function () {
    const expiredDeadline = (await publicClient.getBlock()).timestamp - 1n;
    const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);

    await expectRevert(
      router.write.swapExactTokensForTokens(
        [1n, 0n, [tokenA.address, tokenB.address], traderClient.account.address, expiredDeadline],
        { account: traderClient.account.address }
      ),
      "FluxSwapRouter: EXPIRED"
    );

    await expectRevert(
      router.write.swapExactTokensForTokens(
        [1n, 0n, [tokenA.address], traderClient.account.address, await getDeadline()],
        { account: traderClient.account.address }
      ),
      "FluxSwapRouter: INVALID_PATH"
    );

    await expectRevert(
      router.write.swapExactETHForTokens(
        [0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
        { account: traderClient.account.address, value: 1n }
      ),
      "FluxSwapRouter: INVALID_PATH"
    );

    await expectRevert(
      router.write.swapExactTokensForETH(
        [1n, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
        { account: traderClient.account.address }
      ),
      "FluxSwapRouter: INVALID_PATH"
    );

    await expectRevert(
      router.read.getAmountsOut([1n, [tokenA.address, tokenC.address]]),
      "FluxSwapRouter: PAIR_NOT_FOUND"
    );
  });

  it("should swap exact tokens for tokens through the configured pair", async function () {
    const balanceBefore = await tokenB.read.balanceOf([traderClient.account.address]);

    await router.write.swapExactTokensForTokens(
      [100n * 10n ** 18n, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    ok(await tokenB.read.balanceOf([traderClient.account.address]) > balanceBefore);
  });

  it("should support exact output swaps for tokens and ETH", async function () {
    const desiredTokenOut = 50n * 10n ** 18n;
    const tokenBBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await router.write.swapTokensForExactTokens(
      [
        desiredTokenOut,
        1_000n * 10n ** 18n,
        [tokenA.address, tokenB.address],
        recipientClient.account.address,
        await getDeadline(),
      ],
      { account: traderClient.account.address }
    );

    strictEqual(
      await tokenB.read.balanceOf([recipientClient.account.address]) - tokenBBefore,
      desiredTokenOut
    );

    await expectRevert(
      router.write.swapTokensForExactTokens(
        [
          desiredTokenOut,
          1n,
          [tokenA.address, tokenB.address],
          recipientClient.account.address,
          await getDeadline(),
        ],
        { account: traderClient.account.address }
      ),
      "FluxSwapRouter: EXCESSIVE_INPUT_AMOUNT"
    );

    await createTokenEthLiquidity(tokenB);
    const desiredEthSwapOut = 5n * 10n ** 17n;
    const recipientEthBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    await router.write.swapTokensForExactETH(
      [
        desiredEthSwapOut,
        1_000n * 10n ** 18n,
        [tokenB.address, WETH.address],
        recipientClient.account.address,
        await getDeadline(),
      ],
      { account: traderClient.account.address }
    );

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBefore,
      desiredEthSwapOut
    );

    const exactTokenOut = 2n * 10n ** 17n;
    const tokenBRecipientBefore = await tokenB.read.balanceOf([recipientClient.account.address]);
    await router.write.swapETHForExactTokens(
      [exactTokenOut, [WETH.address, tokenB.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: 1n * 10n ** 18n }
    );

    strictEqual(
      (await tokenB.read.balanceOf([recipientClient.account.address])) - tokenBRecipientBefore,
      exactTokenOut
    );
  });

  it("should support ETH swap variants", async function () {
    await createTokenEthLiquidity(tokenB);

    const tokenRecipientBefore = await tokenB.read.balanceOf([recipientClient.account.address]);
    await router.write.swapExactETHForTokens(
      [0n, [WETH.address, tokenB.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: 1n * 10n ** 18n }
    );
    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > tokenRecipientBefore);

    const ethRecipientBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    await router.write.swapExactTokensForETH(
      [100n * 10n ** 18n, 1n, [tokenB.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > ethRecipientBefore);
  });

  it("should remove token liquidity with and without permit", async function () {
    const liquidity = await pair.read.balanceOf([lpClient.account.address]);
    const removeAmount = liquidity / 10n;

    const tokenABefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    const tokenBBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await pair.write.approve([router.address, removeAmount], {
      account: lpClient.account.address,
    });
    await router.write.removeLiquidity(
      [
        tokenA.address,
        tokenB.address,
        removeAmount,
        0n,
        0n,
        recipientClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenA.read.balanceOf([recipientClient.account.address]) > tokenABefore);
    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > tokenBBefore);

    const permitAmount = (await pair.read.balanceOf([lpClient.account.address])) / 10n;
    const deadline = await getDeadline();
    const signature = await signPairPermit(lpClient, pair, permitAmount, deadline);
    const tokenAAfterNormal = await tokenA.read.balanceOf([recipientClient.account.address]);
    const tokenBAfterNormal = await tokenB.read.balanceOf([recipientClient.account.address]);

    await router.write.removeLiquidityWithPermit(
      [
        tokenA.address,
        tokenB.address,
        permitAmount,
        0n,
        0n,
        recipientClient.account.address,
        deadline,
        false,
        signature.v,
        signature.r,
        signature.s,
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenA.read.balanceOf([recipientClient.account.address]) > tokenAAfterNormal);
    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > tokenBAfterNormal);
  });

  it("should remove ETH liquidity with and without permit", async function () {
    const wethPair = await createTokenEthLiquidity(tokenB);
    const liquidity = await wethPair.read.balanceOf([lpClient.account.address]);
    const removeAmount = liquidity / 10n;

    await wethPair.write.approve([router.address, removeAmount], {
      account: lpClient.account.address,
    });

    const tokenBefore = await tokenB.read.balanceOf([recipientClient.account.address]);
    const ethBefore = await publicClient.getBalance({ address: recipientClient.account.address });

    await router.write.removeLiquidityETH(
      [tokenB.address, removeAmount, 0n, 0n, recipientClient.account.address, await getDeadline()],
      { account: lpClient.account.address }
    );

    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > tokenBefore);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > ethBefore);

    const permitAmount = (await wethPair.read.balanceOf([lpClient.account.address])) / 10n;
    const deadline = await getDeadline();
    const signature = await signPairPermit(lpClient, wethPair, permitAmount, deadline, true);
    const tokenAfterNormal = await tokenB.read.balanceOf([recipientClient.account.address]);
    const ethAfterNormal = await publicClient.getBalance({ address: recipientClient.account.address });

    await router.write.removeLiquidityETHWithPermit(
      [
        tokenB.address,
        permitAmount,
        0n,
        0n,
        recipientClient.account.address,
        deadline,
        true,
        signature.v,
        signature.r,
        signature.s,
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > tokenAfterNormal);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > ethAfterNormal);
  });

  it("should enforce amount minimums on token and ETH liquidity provisioning", async function () {
    const isolatedFactory = await viem.deployContract("FluxSwapFactory", [deployerClient.account.address]);
    const isolatedRouter = await viem.deployContract("FluxSwapRouter", [isolatedFactory.address, WETH.address]);
    const isolatedTokenA = await viem.deployContract("MockERC20", ["Isolated Token A", "ITKA", 18]);
    const isolatedTokenB = await viem.deployContract("MockERC20", ["Isolated Token B", "ITKB", 18]);
    const isolatedTokenC = await viem.deployContract("MockERC20", ["Isolated Token C", "ITKC", 18]);

    await isolatedTokenA.write.mint([lpClient.account.address, 1_000n * 10n ** 18n]);
    await isolatedTokenB.write.mint([lpClient.account.address, 1_000n * 10n ** 18n]);
    await isolatedTokenC.write.mint([lpClient.account.address, 1_000n * 10n ** 18n]);
    await isolatedTokenA.write.approve([isolatedRouter.address, maxUint256], { account: lpClient.account.address });
    await isolatedTokenB.write.approve([isolatedRouter.address, maxUint256], { account: lpClient.account.address });
    await isolatedTokenC.write.approve([isolatedRouter.address, maxUint256], { account: lpClient.account.address });

    await expectRevert(
      isolatedRouter.write.addLiquidity(
        [
          isolatedTokenA.address,
          isolatedTokenB.address,
          100n * 10n ** 18n,
          100n * 10n ** 18n,
          101n * 10n ** 18n,
          100n * 10n ** 18n,
          lpClient.account.address,
          await getDeadline(),
        ],
        { account: lpClient.account.address }
      ),
      "FluxSwapRouter: INSUFFICIENT_A_AMOUNT"
    );

    await expectRevert(
      router.write.addLiquidity(
        [
          tokenA.address,
          tokenB.address,
          2n * 10n ** 18n,
          1n * 10n ** 18n,
          0n,
          1n * 10n ** 18n + 1n,
          lpClient.account.address,
          await getDeadline(),
        ],
        { account: lpClient.account.address }
      ),
      "FluxSwapRouter: INSUFFICIENT_B_AMOUNT"
    );

    await expectRevert(
      isolatedRouter.write.addLiquidityETH(
        [
          isolatedTokenC.address,
          100n * 10n ** 18n,
          101n * 10n ** 18n,
          100n * 10n ** 18n,
          lpClient.account.address,
          await getDeadline(),
        ],
        { account: lpClient.account.address, value: 100n * 10n ** 18n }
      ),
      "FluxSwapRouter: INSUFFICIENT_TOKEN_AMOUNT"
    );

    await expectRevert(
      router.write.addLiquidityETH(
        [
          tokenB.address,
          2n * 10n ** 18n,
          0n,
          1n * 10n ** 18n + 1n,
          lpClient.account.address,
          await getDeadline(),
        ],
        { account: lpClient.account.address, value: 1n * 10n ** 18n }
      ),
      "FluxSwapRouter: INSUFFICIENT_ETH_AMOUNT"
    );
  });

});
