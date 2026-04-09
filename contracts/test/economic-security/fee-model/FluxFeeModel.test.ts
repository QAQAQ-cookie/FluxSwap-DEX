import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { strictEqual } from "node:assert";

/**
 * 手续费模型测试
 * 1. 校验 AMM 协议费按 5 bps 精确沉淀到 treasury，并在多次交易与多跳路径上逐跳累加。
 * 2. 校验 factory 切换 treasury 指针后，历史手续费与新手续费不会串账。
 * 3. 校验 revenueDistributor 的 buyback / burn / distribute 分账能和 buybackBps、burnBps 精确对账。
 * 4. 校验 multi-pool manager 的舍入余量会先留存在 undistributedRewards，再在后续分发中补齐。
 */
describe("FluxFeeModel", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, traderClient] =
    await viem.getWalletClients();

  const bpsBase = 10_000n;
  const protocolFeeBps = 5n;
  const timelockDelay = 3_600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;

  const getDeadline = async () => (await publicClient.getBlock()).timestamp + 3_600n;
  const getProtocolFee = (amountIn: bigint) => (amountIn * protocolFeeBps) / bpsBase;
  const sumBigInts = (values: bigint[]) => values.reduce((sum, value) => sum + value, 0n);
  const getReserveForToken = async (pair: any, tokenAddress: `0x${string}`) => {
    const [reserve0, reserve1] = await pair.read.getReserves();
    const token0 = (await pair.read.token0()).toLowerCase();
    return tokenAddress.toLowerCase() === token0 ? reserve0 : reserve1;
  };

  async function scheduleAndExecute(
    treasury: any,
    operationId: `0x${string}`,
    execute: () => Promise<unknown>
  ) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function approveTreasurySpender(
    treasury: any,
    tokenAddress: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(treasury, approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
    );
  }

  describe("AMM 协议费沉淀", function () {
    let factory: any;
    let router: any;
    let WETH: any;
    let tokenA: any;
    let tokenB: any;
    let tokenC: any;
    let pairAB: any;

    const treasuryPrimary = multisigClient.account.address;
    const treasurySecondary = guardianClient.account.address;
    const lp = lpClient.account.address;
    const trader = traderClient.account.address;

    beforeEach(async function () {
      tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
      WETH = await viem.deployContract("MockWETH", []);

      factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
      router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

      const mintAmount = 1_000_000n * 10n ** 18n;

      await tokenA.write.mint([lp, mintAmount]);
      await tokenB.write.mint([lp, mintAmount]);
      await tokenC.write.mint([lp, mintAmount]);
      await tokenA.write.mint([trader, mintAmount]);
      await tokenB.write.mint([trader, mintAmount]);
      await tokenC.write.mint([trader, mintAmount]);

      for (const token of [tokenA, tokenB, tokenC]) {
        await token.write.approve([router.address, maxUint256], { account: lp });
        await token.write.approve([router.address, maxUint256], { account: trader });
      }

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100_000n * 10n ** 18n,
        100_000n * 10n ** 18n,
        0n,
        0n,
        lp,
        await getDeadline(),
      ], { account: lp });

      await router.write.addLiquidity([
        tokenB.address,
        tokenC.address,
        100_000n * 10n ** 18n,
        100_000n * 10n ** 18n,
        0n,
        0n,
        lp,
        await getDeadline(),
      ], { account: lp });

      const pairABAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
      pairAB = await viem.getContractAt("FluxSwapPair", pairABAddress);

      await factory.write.setTreasury([treasuryPrimary], {
        account: multisigClient.account.address,
      });
    });

    it("should accumulate exact protocol fees across repeated single-hop swaps", async function () {
      const swapAmounts = [
        100n * 10n ** 18n,
        333n * 10n ** 18n,
        777n * 10n ** 18n,
      ];
      const expectedProtocolFee = sumBigInts(swapAmounts.map(getProtocolFee));
      const expectedReserveDelta = sumBigInts(swapAmounts) - expectedProtocolFee;

      const treasuryBefore = await tokenA.read.balanceOf([treasuryPrimary]);
      const reserveBefore = await getReserveForToken(pairAB, tokenA.address);
      const totalSupplyBefore = await pairAB.read.totalSupply();

      for (const swapAmount of swapAmounts) {
        await router.write.swapExactTokensForTokens([
          swapAmount,
          0n,
          [tokenA.address, tokenB.address],
          trader,
          await getDeadline(),
        ], { account: trader });
      }

      const treasuryAfter = await tokenA.read.balanceOf([treasuryPrimary]);
      const reserveAfter = await getReserveForToken(pairAB, tokenA.address);
      const totalSupplyAfter = await pairAB.read.totalSupply();

      strictEqual(treasuryAfter - treasuryBefore, expectedProtocolFee);
      strictEqual(reserveAfter - reserveBefore, expectedReserveDelta);
      strictEqual(totalSupplyAfter, totalSupplyBefore);
    });

    it("should route only future protocol fees to the new treasury after a handoff", async function () {
      const firstSwapAmount = 250n * 10n ** 18n;
      const secondSwapAmount = 400n * 10n ** 18n;

      await router.write.swapExactTokensForTokens([
        firstSwapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        await getDeadline(),
      ], { account: trader });

      const primaryAfterFirstSwap = await tokenA.read.balanceOf([treasuryPrimary]);
      strictEqual(primaryAfterFirstSwap, getProtocolFee(firstSwapAmount));

      await factory.write.setTreasury([treasurySecondary], {
        account: multisigClient.account.address,
      });

      await router.write.swapExactTokensForTokens([
        secondSwapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        await getDeadline(),
      ], { account: trader });

      strictEqual(await tokenA.read.balanceOf([treasuryPrimary]), getProtocolFee(firstSwapAmount));
      strictEqual(await tokenA.read.balanceOf([treasurySecondary]), getProtocolFee(secondSwapAmount));
    });

    it("should charge protocol fees on every hop using each hop's actual input token", async function () {
      const swapAmount = 500n * 10n ** 18n;
      const path = [tokenA.address, tokenB.address, tokenC.address];
      const amounts = await router.read.getAmountsOut([swapAmount, path]);

      const treasuryTokenABefore = await tokenA.read.balanceOf([treasuryPrimary]);
      const treasuryTokenBBefore = await tokenB.read.balanceOf([treasuryPrimary]);

      await router.write.swapExactTokensForTokens([
        swapAmount,
        0n,
        path,
        trader,
        await getDeadline(),
      ], { account: trader });

      const treasuryTokenAAfter = await tokenA.read.balanceOf([treasuryPrimary]);
      const treasuryTokenBAfter = await tokenB.read.balanceOf([treasuryPrimary]);

      strictEqual(treasuryTokenAAfter - treasuryTokenABefore, getProtocolFee(amounts[0]));
      strictEqual(treasuryTokenBAfter - treasuryTokenBBefore, getProtocolFee(amounts[1]));
    });
  });

  describe("Revenue 分账模型", function () {
    let treasury: any;
    let fluxToken: any;
    let revenueToken: any;
    let WETH: any;
    let factory: any;
    let router: any;
    let manager: any;
    let buybackExecutor: any;
    let revenueDistributor: any;
    let stakingPool: any;

    beforeEach(async function () {
      treasury = await viem.deployContract("FluxSwapTreasury", [
        multisigClient.account.address,
        guardianClient.account.address,
        operatorClient.account.address,
        timelockDelay,
      ]);

      fluxToken = await viem.deployContract("FluxToken", [
        "Flux Token",
        "FLUX",
        multisigClient.account.address,
        treasury.address,
        initialSupply,
        cap,
      ]);

      revenueToken = await viem.deployContract("MockERC20", ["Revenue Token", "USDX", 18]);
      WETH = await viem.deployContract("MockWETH", []);
      factory = await viem.deployContract("FluxSwapFactory", [multisigClient.account.address]);
      router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

      manager = await viem.deployContract("FluxMultiPoolManager", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        fluxToken.address,
      ]);

      stakingPool = await viem.deployContract("FluxSwapStakingRewards", [
        multisigClient.account.address,
        fluxToken.address,
        fluxToken.address,
        manager.address,
        manager.address,
      ]);
      await stakingPool.write.setRewardConfiguration([manager.address, stakingPool.address], {
        account: multisigClient.account.address,
      });
      await manager.write.addPool([stakingPool.address, 100n, true], {
        account: multisigClient.account.address,
      });

      buybackExecutor = await viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        router.address,
        fluxToken.address,
        treasury.address,
      ]);

      revenueDistributor = await viem.deployContract("FluxRevenueDistributor", [
        multisigClient.account.address,
        operatorClient.account.address,
        buybackExecutor.address,
        manager.address,
        2_500n,
        2_000n,
      ]);

      await buybackExecutor.write.setOperator([revenueDistributor.address], {
        account: multisigClient.account.address,
      });
      await manager.write.setOperator([revenueDistributor.address], {
        account: multisigClient.account.address,
      });
      await factory.write.setTreasury([treasury.address], {
        account: multisigClient.account.address,
      });

      await fluxToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n], {
        account: multisigClient.account.address,
      });
      await revenueToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n]);
      await revenueToken.write.mint([traderClient.account.address, 50_000n * 10n ** 18n]);

      await fluxToken.write.approve([router.address, maxUint256], {
        account: lpClient.account.address,
      });
      await revenueToken.write.approve([router.address, maxUint256], {
        account: lpClient.account.address,
      });
      await revenueToken.write.approve([router.address, maxUint256], {
        account: traderClient.account.address,
      });

      await router.write.addLiquidity([
        fluxToken.address,
        revenueToken.address,
        100_000n * 10n ** 18n,
        100_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ], { account: lpClient.account.address });
    });

    it("should split accumulated revenue into treasury carry, burn, and distributed rewards using configured bps", async function () {
      const swapAmounts = [
        1_000n * 10n ** 18n,
        2_500n * 10n ** 18n,
      ];
      const newBuybackBps = 4_000n;
      const newBurnBps = 2_500n;
      const totalProtocolRevenue = sumBigInts(swapAmounts.map(getProtocolFee));

      for (const swapAmount of swapAmounts) {
        await router.write.swapExactTokensForTokens([
          swapAmount,
          0n,
          [revenueToken.address, fluxToken.address],
          traderClient.account.address,
          await getDeadline(),
        ], { account: traderClient.account.address });
      }

      strictEqual(await revenueToken.read.balanceOf([treasury.address]), totalProtocolRevenue);

      await revenueDistributor.write.setRevenueConfiguration([newBuybackBps, newBurnBps], {
        account: multisigClient.account.address,
      });

      const buybackAmountIn = (totalProtocolRevenue * newBuybackBps) / bpsBase;
      const path = [revenueToken.address, fluxToken.address];
      const expectedOut = (await router.read.getAmountsOut([buybackAmountIn, path]))[1];
      const burnedAmount = (expectedOut * newBurnBps) / bpsBase;
      const distributedAmount = expectedOut - burnedAmount;
      const buybackProtocolFee = getProtocolFee(buybackAmountIn);
      const totalSupplyBefore = await fluxToken.read.totalSupply();

      await approveTreasurySpender(treasury, revenueToken.address, buybackExecutor.address, buybackAmountIn);
      if (burnedAmount > 0n) {
        await approveTreasurySpender(treasury, fluxToken.address, revenueDistributor.address, burnedAmount);
      }
      if (distributedAmount > 0n) {
        await approveTreasurySpender(treasury, fluxToken.address, manager.address, distributedAmount);
      }

      await revenueDistributor.write.executeBuybackAndDistribute(
        [revenueToken.address, totalProtocolRevenue, expectedOut, path, await getDeadline()],
        { account: operatorClient.account.address }
      );

      strictEqual(
        await revenueToken.read.balanceOf([treasury.address]),
        totalProtocolRevenue - buybackAmountIn + buybackProtocolFee
      );
      strictEqual(await fluxToken.read.totalSupply(), totalSupplyBefore - burnedAmount);
      strictEqual(await fluxToken.read.balanceOf([manager.address]), distributedAmount);
      strictEqual(await manager.read.pendingPoolRewards([stakingPool.address]), distributedAmount);
      strictEqual(await manager.read.undistributedRewards(), 0n);
      strictEqual(
        await treasury.read.approvedSpendRemaining([revenueToken.address, buybackExecutor.address]),
        0n
      );

      if (burnedAmount > 0n) {
        strictEqual(
          await treasury.read.approvedSpendRemaining([fluxToken.address, revenueDistributor.address]),
          0n
        );
      }
      if (distributedAmount > 0n) {
        strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
      }
    });
  });

  describe("Manager 舍入余量", function () {
    let treasury: any;
    let fluxToken: any;
    let manager: any;

    const poolA = lpClient.account.address;
    const poolB = traderClient.account.address;

    beforeEach(async function () {
      treasury = await viem.deployContract("FluxSwapTreasury", [
        multisigClient.account.address,
        guardianClient.account.address,
        operatorClient.account.address,
        timelockDelay,
      ]);

      fluxToken = await viem.deployContract("FluxToken", [
        "Flux Token",
        "FLUX",
        multisigClient.account.address,
        treasury.address,
        initialSupply,
        cap,
      ]);

      manager = await viem.deployContract("FluxMultiPoolManager", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        fluxToken.address,
      ]);

      await manager.write.addPool([poolA, 2n, true], {
        account: multisigClient.account.address,
      });
      await manager.write.addPool([poolB, 1n, true], {
        account: multisigClient.account.address,
      });
    });

    it("should carry undistributed dust into the next reward distribution", async function () {
      await approveTreasurySpender(treasury, fluxToken.address, manager.address, 3n);

      await manager.write.distributeRewards([1n], {
        account: operatorClient.account.address,
      });

      strictEqual(await manager.read.undistributedRewards(), 1n);
      strictEqual(await manager.read.pendingPoolRewards([poolA]), 0n);
      strictEqual(await manager.read.pendingPoolRewards([poolB]), 0n);

      await manager.write.distributeRewards([2n], {
        account: operatorClient.account.address,
      });

      strictEqual(await manager.read.undistributedRewards(), 0n);
      strictEqual(await manager.read.pendingPoolRewards([poolA]), 2n);
      strictEqual(await manager.read.pendingPoolRewards([poolB]), 1n);
      strictEqual(await fluxToken.read.balanceOf([manager.address]), 3n);
      strictEqual(await treasury.read.approvedSpendRemaining([fluxToken.address, manager.address]), 0n);
    });
  });
});
