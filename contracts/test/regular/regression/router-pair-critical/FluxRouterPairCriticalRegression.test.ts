import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";
import { encodeAbiParameters, parseSignature } from "viem";

// 回归目标：
// 1. 锁住多跳、ETH、token-WETH 等关键 swap 入口的协议费记账资产归属。
// 2. 锁住 fee-on-transfer 路径必须按真实净输入计费，而不是按名义输入误记。
// 3. 锁住 permit 与非 permit 两类移除流动性路径都能稳定赎回。
// 4. 锁住 flash swap 成功/失败分支、超小额 rounding、full unwind 最小流动性等 Pair 关键边界。
describe("FluxRouterPairCriticalRegression", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient, recipientClient] =
    await viem.getWalletClients();

  const maxUint256 = (1n << 256n) - 1n;
  const timelockDelay = 3600n;
  const feeBase = 10000n;
  const protocolFeeBps = 5n;
  const totalFeeBps = 30n;
  const feeOnTransferBps = 100n;

  let WETH: any;
  let factory: any;
  let router: any;

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

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

  function applyTransferFee(amount: bigint) {
    return amount - (amount * feeOnTransferBps) / feeBase;
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
    factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);
  });

  // 模块一：多跳、ETH 与 token-WETH 路径的协议费记账
  // 对应 README 已覆盖点：
  // - exact-output 多跳路径下，两跳输入资产都必须正确向 treasury 支付协议费。
  // - exact-input 多跳路径下，两跳输入资产也必须分别正确向 treasury 支付协议费。
  // - exact-output ETH 路径下，协议费必须记在真实输入资产上，不会把 token / WETH 记混。
  // - token-WETH 路径在 exact-input / exact-output 的不同 swap 入口下，协议费资产归属保持一致。
  it("should keep exact-output multi-hop fee accounting on both hop input assets", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 2_000_000n * 10n ** 18n]);
    await tokenC.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenC.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });

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

    await router.write.addLiquidity(
      [
        tokenB.address,
        tokenC.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    const desiredOutput = 75n * 10n ** 18n;
    const path = [tokenA.address, tokenB.address, tokenC.address];
    const amounts = await router.read.getAmountsIn([desiredOutput, path]);

    // 这里锁住 exact-output 多跳时，两跳输入资产都必须各自向 treasury 支付协议费。
    await router.write.swapTokensForExactTokens(
      [desiredOutput, amounts[0], path, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await tokenA.read.balanceOf([treasury.address]), (amounts[0] * protocolFeeBps) / feeBase);
    strictEqual(await tokenB.read.balanceOf([treasury.address]), (amounts[1] * protocolFeeBps) / feeBase);
    strictEqual(await tokenC.read.balanceOf([recipientClient.account.address]), desiredOutput);
  });

  it("should keep exact-input multi-hop fee accounting on both hop input assets", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 2_000_000n * 10n ** 18n]);
    await tokenC.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenC.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });

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

    await router.write.addLiquidity(
      [
        tokenB.address,
        tokenC.address,
        10_000n * 10n ** 18n,
        10_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );

    const amountIn = 100n * 10n ** 18n;
    const path = [tokenA.address, tokenB.address, tokenC.address];
    const amounts = await router.read.getAmountsOut([amountIn, path]);

    // 这里锁住 exact-input 多跳时的双资产计费：第一跳按 tokenA，第二跳按 tokenB，各自都必须记到 treasury。
    await router.write.swapExactTokensForTokens(
      [amountIn, 0n, path, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await tokenA.read.balanceOf([treasury.address]), (amountIn * protocolFeeBps) / feeBase);
    strictEqual(await tokenB.read.balanceOf([treasury.address]), (amounts[1] * protocolFeeBps) / feeBase);
    strictEqual(await tokenC.read.balanceOf([recipientClient.account.address]), amounts[2]);
  });

  it("should keep exact-output ETH routes charging treasury fees in the true input asset", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const token = await viem.deployContract("MockERC20", ["Output Flow Token", "OFT", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await token.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await token.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });

    await router.write.addLiquidityETH(
      [token.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );

    const desiredEthOut = 5n * 10n ** 17n;
    const tokenToEthPath = [token.address, WETH.address];
    const tokenToEthAmounts = await router.read.getAmountsIn([desiredEthOut, tokenToEthPath]);
    const tokenFee = (tokenToEthAmounts[0] * protocolFeeBps) / feeBase;

    // 这里锁住 token -> exact ETH 路径：协议费必须记在真实输入资产 token 上，而不是记成 WETH/ETH。
    await router.write.swapTokensForExactETH(
      [desiredEthOut, tokenToEthAmounts[0], tokenToEthPath, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await token.read.balanceOf([treasury.address]), tokenFee);

    const desiredTokenOut = 50n * 10n ** 18n;
    const ethToTokenPath = [WETH.address, token.address];
    const ethToTokenAmounts = await router.read.getAmountsIn([desiredTokenOut, ethToTokenPath]);
    const wethFee = (ethToTokenAmounts[0] * protocolFeeBps) / feeBase;
    const treasuryWethBefore = await WETH.read.balanceOf([treasury.address]);

    // 这里再锁住 exact ETH -> token 路径：协议费必须记在真实输入资产 WETH 上。
    await router.write.swapETHForExactTokens(
      [desiredTokenOut, ethToTokenPath, recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: ethToTokenAmounts[0] }
    );

    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBefore, wethFee);
    strictEqual(await token.read.balanceOf([recipientClient.account.address]), desiredTokenOut);
  });

  it("should keep protocol-fee accounting consistent across exact-input and exact-output token-WETH entrypoints", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const token = await viem.deployContract("MockERC20", ["Wrapped Flow Token", "WFT", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await token.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });
    await token.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });

    await router.write.addLiquidityETH(
      [token.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );

    const tokenIn = 100n * 10n ** 18n;
    const tokenExactInFee = (tokenIn * protocolFeeBps) / feeBase;
    const treasuryTokenBeforeExactIn = await token.read.balanceOf([treasury.address]);
    await router.write.swapExactTokensForETH(
      [tokenIn, 0n, [token.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
    strictEqual((await token.read.balanceOf([treasury.address])) - treasuryTokenBeforeExactIn, tokenExactInFee);

    const desiredEthOut = 5n * 10n ** 17n;
    const tokenExactOutAmounts = await router.read.getAmountsIn([desiredEthOut, [token.address, WETH.address]]);
    const tokenExactOutFee = (tokenExactOutAmounts[0] * protocolFeeBps) / feeBase;
    const treasuryTokenBeforeExactOut = await token.read.balanceOf([treasury.address]);
    await router.write.swapTokensForExactETH(
      [desiredEthOut, tokenExactOutAmounts[0], [token.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
    strictEqual((await token.read.balanceOf([treasury.address])) - treasuryTokenBeforeExactOut, tokenExactOutFee);

    const ethIn = 1n * 10n ** 18n;
    const wethExactInFee = (ethIn * protocolFeeBps) / feeBase;
    const treasuryWethBeforeExactIn = await WETH.read.balanceOf([treasury.address]);
    await router.write.swapExactETHForTokens(
      [0n, [WETH.address, token.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: ethIn }
    );
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBeforeExactIn, wethExactInFee);

    const desiredTokenOut = 50n * 10n ** 18n;
    const wethExactOutAmounts = await router.read.getAmountsIn([desiredTokenOut, [WETH.address, token.address]]);
    const wethExactOutFee = (wethExactOutAmounts[0] * protocolFeeBps) / feeBase;
    const treasuryWethBeforeExactOut = await WETH.read.balanceOf([treasury.address]);
    await router.write.swapETHForExactTokens(
      [desiredTokenOut, [WETH.address, token.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: wethExactOutAmounts[0] }
    );
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBeforeExactOut, wethExactOutFee);
  });

  // 模块二：fee-on-transfer 路径按真实净输入计费
  // 对应 README 已覆盖点：
  // - fee-on-transfer 路径必须按真实净输入计费，而不是按名义输入计费。
  // - fee-on-transfer 的 ETH supporting 路径也必须分别把协议费记在真实输入资产 WETH / feeToken 上。
  it("should keep fee-on-transfer routes charging treasury fees from the real net input amount", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    const feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, feeOnTransferBps]);
    const quoteToken = await viem.deployContract("MockERC20", ["Quote Token", "USDX", 18]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await feeToken.write.mint([lpClient.account.address, 50_000n * 10n ** 18n]);
    await feeToken.write.mint([traderClient.account.address, 5_000n * 10n ** 18n]);
    await quoteToken.write.mint([lpClient.account.address, 20_000n * 10n ** 18n]);

    await feeToken.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });

    await factory.write.createPair([feeToken.address, quoteToken.address]);
    const pairAddress = await factory.read.getPair([feeToken.address, quoteToken.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    await feeToken.write.transfer([pair.address, 10_000n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await quoteToken.write.transfer([pair.address, 9_900n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await pair.write.mint([lpClient.account.address], {
      account: lpClient.account.address,
    });

    const taxedInput = 100n * 10n ** 18n;
    const expectedTreasuryReceive = applyTransferFee((applyTransferFee(taxedInput) * protocolFeeBps) / feeBase);

    // 这里锁住 fee-on-transfer 代币必须按真实到达 Pair 的净输入计费，而不是按用户名义输入计费。
    await router.write.swapExactTokensForTokensSupportingFeeOnTransferTokens(
      [taxedInput, 1n, [feeToken.address, quoteToken.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await feeToken.read.balanceOf([treasury.address]), expectedTreasuryReceive);
    ok(await quoteToken.read.balanceOf([recipientClient.account.address]) > 0n);
  });

  it("should keep fee-on-transfer ETH supporting routes charging treasury fees in the real input asset", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, feeOnTransferBps]);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await feeToken.write.mint([lpClient.account.address, 50_000n * 10n ** 18n]);
    await feeToken.write.mint([traderClient.account.address, 5_000n * 10n ** 18n]);
    await feeToken.write.approve([router.address, maxUint256], {
      account: traderClient.account.address,
    });

    await factory.write.createPair([feeToken.address, WETH.address]);
    const pairAddress = await factory.read.getPair([feeToken.address, WETH.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    await feeToken.write.transfer([pair.address, 10_000n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await WETH.write.deposit({
      account: lpClient.account.address,
      value: 10n * 10n ** 18n,
    });
    await WETH.write.transfer([pair.address, 10n * 10n ** 18n], {
      account: lpClient.account.address,
    });
    await pair.write.mint([lpClient.account.address], {
      account: lpClient.account.address,
    });

    const wethInput = 1n * 10n ** 18n;
    const wethProtocolFee = (wethInput * protocolFeeBps) / feeBase;
    const feeTokenRecipientBefore = await feeToken.read.balanceOf([recipientClient.account.address]);
    const treasuryWethBefore = await WETH.read.balanceOf([treasury.address]);

    // 这里锁住 supportingFeeOnTransfer 的 ETH -> token 分支，协议费必须记在真实输入资产 WETH 上。
    await router.write.swapExactETHForTokensSupportingFeeOnTransferTokens(
      [1n, [WETH.address, feeToken.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address, value: wethInput }
    );

    ok(await feeToken.read.balanceOf([recipientClient.account.address]) > feeTokenRecipientBefore);
    strictEqual((await WETH.read.balanceOf([treasury.address])) - treasuryWethBefore, wethProtocolFee);

    const taxedInput = 100n * 10n ** 18n;
    const netTaxedInput = applyTransferFee(taxedInput);
    const netTaxedProtocolFee = applyTransferFee((netTaxedInput * protocolFeeBps) / feeBase);
    const ethRecipientBefore = await publicClient.getBalance({ address: recipientClient.account.address });
    const treasuryFeeTokenBefore = await feeToken.read.balanceOf([treasury.address]);

    // 这里再锁住 token -> ETH 分支，fee-on-transfer 代币的协议费必须按净输入并计入 feeToken。
    await router.write.swapExactTokensForETHSupportingFeeOnTransferTokens(
      [taxedInput, 1n, [feeToken.address, WETH.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > ethRecipientBefore);
    strictEqual((await feeToken.read.balanceOf([treasury.address])) - treasuryFeeTokenBefore, netTaxedProtocolFee);
  });

  // 模块三：permit 与非 permit 的移除流动性路径
  // 对应 README 已覆盖点：
  // - permit 移除流动性路径必须在无预授权前提下正常工作。
  // - 非 permit 的 removeLiquidityETH 路径也必须稳定赎回 token 和原生 ETH。
  it("should keep permit liquidity removal working without any prior LP approval", async function () {
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });

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

    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const liquidity = (await pair.read.balanceOf([lpClient.account.address])) / 5n;
    const deadline = await getDeadline();
    const signature = await signPairPermit(lpClient, pair, liquidity, deadline);

    strictEqual(await pair.read.allowance([lpClient.account.address, router.address]), 0n);

    await router.write.removeLiquidityWithPermit(
      [
        tokenA.address,
        tokenB.address,
        liquidity,
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

    strictEqual(await pair.read.allowance([lpClient.account.address, router.address]), 0n);
    strictEqual(await pair.read.nonces([lpClient.account.address]), 1n);
    ok(await tokenA.read.balanceOf([recipientClient.account.address]) > 0n);
    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > 0n);

    const wethPairAddress = await factory.read.getPair([tokenB.address, WETH.address]);
    const wethPair = await viem.getContractAt("FluxSwapPair", wethPairAddress);
    const wethLiquidity = (await wethPair.read.balanceOf([lpClient.account.address])) / 5n;
    const wethDeadline = await getDeadline();
    const wethSignature = await signPairPermit(lpClient, wethPair, wethLiquidity, wethDeadline, true);

    await router.write.removeLiquidityETHWithPermit(
      [
        tokenB.address,
        wethLiquidity,
        0n,
        0n,
        recipientClient.account.address,
        wethDeadline,
        true,
        wethSignature.v,
        wethSignature.r,
        wethSignature.s,
      ],
      { account: lpClient.account.address }
    );

    ok(await tokenB.read.balanceOf([recipientClient.account.address]) > 0n);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > 0n);
  });

  it("should keep removeLiquidityETH redeeming both token and native ETH on the non-permit path", async function () {
    const token = await viem.deployContract("MockERC20", ["Wrapped Flow Token", "WFT", 18]);

    await token.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await token.write.approve([router.address, maxUint256], {
      account: lpClient.account.address,
    });

    await router.write.addLiquidityETH(
      [token.address, 10_000n * 10n ** 18n, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address, value: 10n * 10n ** 18n }
    );

    const pairAddress = await factory.read.getPair([token.address, WETH.address]);
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const lpLiquidity = await pair.read.balanceOf([lpClient.account.address]);

    await pair.write.approve([router.address, lpLiquidity], {
      account: lpClient.account.address,
    });

    const recipientTokenBeforeRemove = await token.read.balanceOf([recipientClient.account.address]);
    const recipientEthBeforeRemove = await publicClient.getBalance({ address: recipientClient.account.address });

    // 这里锁住 removeLiquidityETH 的普通路径，避免后续只保住 permit 分支而把常规赎回分支改坏。
    await router.write.removeLiquidityETH(
      [token.address, lpLiquidity, 0n, 0n, recipientClient.account.address, await getDeadline()],
      { account: lpClient.account.address }
    );

    ok(await token.read.balanceOf([recipientClient.account.address]) > recipientTokenBeforeRemove);
    ok((await publicClient.getBalance({ address: recipientClient.account.address })) > recipientEthBeforeRemove);
    strictEqual(await pair.read.balanceOf([lpClient.account.address]), 0n);

    const [reserve0AfterRemove, reserve1AfterRemove] = await pair.read.getReserves();
    ok(reserve0AfterRemove > 0n && reserve1AfterRemove > 0n);
  });

  // 模块四：flash swap 成功/失败分支与协议费沉淀
  // 对应 README 已覆盖点：
  // - flash swap 成功回调时，协议费也必须稳定沉淀到 treasury，不能只锁失败分支。
  // - flash swap 必须归还带手续费的金额，不能只还本金。
  it("should keep flash swaps requiring repayment plus fee instead of allowing principal-only repayment", async function () {
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);
    const partialReceiver = await viem.deployContract("MockPartialFlashSwapReceiver", []);

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });

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
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const token0Address = String(await pair.read.token0()).toLowerCase();
    const flashToken = token0Address === String(tokenA.address).toLowerCase() ? tokenA : tokenB;

    const amountOut = 100n * 10n ** 18n;
    const repayAmount = (amountOut * feeBase) / (feeBase - totalFeeBps) + 1n;
    const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [flashToken.address, repayAmount]);

    await flashToken.write.mint([flashReceiver.address, repayAmount]);

    // 这里锁住 flash swap 的核心约束：必须按带手续费的金额归还，不能只还本金。
    await pair.write.swap([amountOut, 0n, flashReceiver.address, data], {
      account: traderClient.account.address,
    });

    strictEqual(await flashToken.read.balanceOf([flashReceiver.address]), amountOut);

    await expectRevert(
      pair.write.swap([amountOut, 0n, partialReceiver.address, "0x01"], {
        account: traderClient.account.address,
      }),
      "FluxSwap: K"
    );
  });

  it("should keep successful flash-swap callbacks accruing protocol fees into treasury", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });

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
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
    const token0Address = String(await pair.read.token0()).toLowerCase();
    const flashToken = token0Address === String(tokenA.address).toLowerCase() ? tokenA : tokenB;
    const [reserve0Before, reserve1Before] = await pair.read.getReserves();

    const amountOut = 100n * 10n ** 18n;
    const repayAmount = (amountOut * feeBase) / (feeBase - totalFeeBps) + 1n;
    const protocolFee = (repayAmount * protocolFeeBps) / feeBase;
    const expectedReserve0After = reserve0Before - amountOut + repayAmount - protocolFee;
    const data = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [flashToken.address, repayAmount]);

    await flashToken.write.mint([flashReceiver.address, repayAmount]);

    // 这里锁住 flash swap 成功回调路径：归还本金加手续费后，协议费必须正确沉淀到 treasury。
    await pair.write.swap([amountOut, 0n, flashReceiver.address, data], {
      account: traderClient.account.address,
    });

    strictEqual(await flashToken.read.balanceOf([treasury.address]), protocolFee);
    strictEqual(await flashToken.read.balanceOf([flashReceiver.address]), amountOut);
    strictEqual((await pair.read.getReserves())[0], expectedReserve0After);
    strictEqual((await pair.read.getReserves())[1], reserve1Before);
  });

  // 模块五：超小额 rounding 与 full unwind 后的最小流动性
  // 对应 README 已覆盖点：
  // - 超小额 swap 的协议费 rounding 行为必须稳定。
  // - full unwind 后 Pair 仍保留最小流动性，不会把池子彻底烧空。
  it("should preserve tiny-swap rounding behavior and minimum liquidity after a full LP unwind", async function () {
    const treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    await factory.write.setTreasury([treasury.address], {
      account: multisigClient.account.address,
    });

    await tokenA.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenB.write.mint([lpClient.account.address, 1_000_000n * 10n ** 18n]);
    await tokenA.write.mint([traderClient.account.address, 1_000_000n * 10n ** 18n]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });

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
    const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    // 锁住超小额 swap 的 rounding 行为：输出仍能成交，但协议费应当向下取整为 0。
    await router.write.swapExactTokensForTokens(
      [1_000n, 0n, [tokenA.address, tokenB.address], recipientClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );

    strictEqual(await tokenA.read.balanceOf([treasury.address]), 0n);

    const lpLiquidity = await pair.read.balanceOf([lpClient.account.address]);
    await pair.write.approve([router.address, lpLiquidity], {
      account: lpClient.account.address,
    });
    await router.write.removeLiquidity(
      [tokenA.address, tokenB.address, lpLiquidity, 0n, 0n, lpClient.account.address, await getDeadline()],
      { account: lpClient.account.address }
    );

    // 再锁住 full unwind 后 Pair 仍保留最小流动性，不会把池子彻底烧空。
    const [reserve0AfterRemove, reserve1AfterRemove] = await pair.read.getReserves();
    ok(reserve0AfterRemove > 0n && reserve1AfterRemove > 0n);
    strictEqual(await pair.read.totalSupply(), 1_000n);
    strictEqual(await pair.read.balanceOf([zeroAddress]), 1_000n);
  });
});
