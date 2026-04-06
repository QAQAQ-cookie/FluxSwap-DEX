import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { parseSignature } from "viem";

describe("FluxPermitLiquidityFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [deployerClient, lpClient, traderClient, recipientClient] = await viem.getWalletClients();

  const maxUint256 = (1n << 256n) - 1n;

  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  async function signPairPermit(
    ownerClient: any,
    pairContract: any,
    value: bigint,
    deadline: bigint,
    approveMax = false
  ) {
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

  beforeEach(async function () {
    WETH = await viem.deployContract("MockWETH", []);
    factory = await viem.deployContract("FluxSwapFactory", [deployerClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 100_000n * 10n ** 18n]);
    await tokenB.write.mint([traderClient.account.address, 100_000n * 10n ** 18n]);

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

    await router.write.addLiquidityETH(
      [tokenB.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );

    await router.write.swapExactTokensForTokens(
      [100n * 10n ** 18n, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    await router.write.swapExactTokensForETH(
      [100n * 10n ** 18n, 1n, [tokenB.address, WETH.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
  });

  it("should let an LP exit both token and ETH positions through permit signatures without prior approvals", async function () {
    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const tokenPairLiquidity = (await pair.read.balanceOf([lpClient.account.address])) / 5n;
    const tokenDeadline = await getDeadline();
    const tokenSignature = await signPairPermit(lpClient, pair, tokenPairLiquidity, tokenDeadline);

    const recipientTokenABefore = await tokenA.read.balanceOf([recipientClient.account.address]);
    const recipientTokenBBefore = await tokenB.read.balanceOf([recipientClient.account.address]);

    await router.write.removeLiquidityWithPermit(
      [
        tokenA.address,
        tokenB.address,
        tokenPairLiquidity,
        0n,
        0n,
        recipientClient.account.address,
        tokenDeadline,
        false,
        tokenSignature.v,
        tokenSignature.r,
        tokenSignature.s,
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenA.read.balanceOf([recipientClient.account.address]) > recipientTokenABefore);
    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > recipientTokenBBefore);
    strictEqual(await pair.read.allowance([lpClient.account.address, router.address]), 0n);
    strictEqual(await pair.read.nonces([lpClient.account.address]), 1n);

    const wethPairAddress = await factory.read.getPair([tokenB.address, WETH.address]);
    const wethPair = await viem.getContractAt("FluxSwapPair", wethPairAddress);
    const ethPairLiquidity = (await wethPair.read.balanceOf([lpClient.account.address])) / 5n;
    const ethDeadline = await getDeadline();
    const ethSignature = await signPairPermit(lpClient, wethPair, ethPairLiquidity, ethDeadline, true);

    const recipientTokenBBeforeEthExit = await tokenB.read.balanceOf([recipientClient.account.address]);
    const recipientEthBeforeEthExit = await publicClient.getBalance({ address: recipientClient.account.address });

    await router.write.removeLiquidityETHWithPermit(
      [
        tokenB.address,
        ethPairLiquidity,
        0n,
        0n,
        recipientClient.account.address,
        ethDeadline,
        true,
        ethSignature.v,
        ethSignature.r,
        ethSignature.s,
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > recipientTokenBBeforeEthExit);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > recipientEthBeforeEthExit);
    strictEqual(await wethPair.read.allowance([lpClient.account.address, router.address]), maxUint256);
    strictEqual(await wethPair.read.nonces([lpClient.account.address]), 1n);
  });
});
