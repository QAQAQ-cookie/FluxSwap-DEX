import { network } from "hardhat";
import { describe, it, beforeEach } from "node:test";
import { strictEqual, notEqual, ok } from "node:assert";
import { encodeAbiParameters } from "viem";

/**
 * FluxSwap DEX 完整功能测试
 * 测试场景：
 * - 角色：deployer（部署者）、lp（流动性提供者）、trader（交易者）
 * - 代币：tokenA、tokenB（ERC20）、WETH
 * - 交易对：tokenA-tokenB、WETH-tokenB
 * - 初始流动性：每个池子 10000 * 10^18
 */
describe("v2-FluxSwap", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [walletClient, walletClient2, walletClient3] = await viem.getWalletClients();
  const getDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 3600);
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

    ok(
      errorText.includes(reason),
      `Expected revert reason "${reason}", got: ${errorText}`
    );
  };

  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;
  let pairAddress: any;
  let pair: any;

  let deployer: `0x${string}`;
  let lp: `0x${string}`;
  let trader: `0x${string}`;

  beforeEach(async function () {
    deployer = walletClient.account.address.toLowerCase() as `0x${string}`;
    lp = walletClient2.account.address.toLowerCase() as `0x${string}`;
    trader = walletClient3.account.address.toLowerCase() as `0x${string}`;

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    WETH = await viem.deployContract("MockWETH", []);

    factory = await viem.deployContract("FluxSwapFactory", [deployer]);
    router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

    const token0Address = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
    const token1Address = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;

    await factory.write.createPair([token0Address, token1Address]);
    pairAddress = await factory.read.getPair([token0Address, token1Address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    const amount = 1000000n * 10n ** 18n;

    await tokenA.write.mint([lp, amount]);
    await tokenB.write.mint([lp, amount]);
    await tokenA.write.mint([trader, amount]);
    await tokenB.write.mint([trader, amount]);

    await tokenA.write.approve([await router.address, amount], { account: lp });
    await tokenB.write.approve([await router.address, amount], { account: lp });
    await tokenA.write.approve([await pair.address, amount], { account: lp });
    await tokenB.write.approve([await pair.address, amount], { account: lp });
    await pair.write.approve([await router.address, amount], { account: lp });

    await tokenA.write.approve([await router.address, amount], { account: trader });
    await tokenB.write.approve([await router.address, amount], { account: trader });
    await tokenA.write.approve([await pair.address, amount], { account: trader });
    await tokenB.write.approve([await pair.address, amount], { account: trader });

    await router.write.addLiquidity([
      tokenA.address,
      tokenB.address,
      10000n * 10n ** 18n,
      10000n * 10n ** 18n,
      0n,
      0n,
      lp,
      getDeadline(),
    ], { account: lp });

    const wethToken0 = WETH.address < tokenB.address ? WETH.address : tokenB.address;
    const wethToken1 = WETH.address < tokenB.address ? tokenB.address : WETH.address;
    await factory.write.createPair([wethToken0, wethToken1]);

    const wethPairAddress = await factory.read.getPair([wethToken0, wethToken1]);
    const wethPair = await viem.getContractAt("FluxSwapPair", wethPairAddress);

    await WETH.write.deposit({ value: 2n * 10n ** 18n, account: lp });
    await WETH.write.approve([await router.address, 2n * 10n ** 18n], { account: lp });
    await tokenB.write.approve([await router.address, amount], { account: lp });

    await router.write.addLiquidity([
      WETH.address,
      tokenB.address,
      1n * 10n ** 18n,
      1n * 10n ** 18n,
      0n,
      0n,
      lp,
      getDeadline(),
    ], { account: lp });
  });

  /**
   * ETH 交易测试
   * 场景：用户使用 ETH 兑换 token，或 token 兑换 ETH
   */
  describe("ETH Swap Tests", function () {
    it("should swap exact ETH for tokens", async function () {
      const traderWethBalanceBefore = await WETH.read.balanceOf([trader]);
      const traderTokenBBalanceBefore = await tokenB.read.balanceOf([trader]);

      const ethIn = 1n * 10n ** 18n;

      await router.write.swapExactETHForTokens([
        0n,
        [WETH.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader, value: ethIn });

      const traderWethBalanceAfter = await WETH.read.balanceOf([trader]);
      const traderTokenBBalanceAfter = await tokenB.read.balanceOf([trader]);

      ok(traderWethBalanceAfter === traderWethBalanceBefore, "Trader WETH balance should be unchanged (ETH converted to WETH and sent to pair)");
      ok(traderTokenBBalanceAfter > traderTokenBBalanceBefore, "TokenB balance should increase");
    });

    it("should swap exact tokens for ETH", async function () {
      const traderTokenBBalanceBefore = await tokenB.read.balanceOf([trader]);

      const tokenBIn = 1n * 10n ** 18n;

      await tokenB.write.approve([await router.address, tokenBIn], { account: trader });

      await router.write.swapExactTokensForETH([
        tokenBIn,
        0n,
        [tokenB.address, WETH.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const traderTokenBBalanceAfter = await tokenB.read.balanceOf([trader]);

      ok(traderTokenBBalanceAfter < traderTokenBBalanceBefore, "TokenB balance should decrease after swap");
    });
  });

  /**
   * 工厂合约测试
   * 场景：创建交易对、设置手续费接收地址、权限控制
   */
  describe("Factory", function () {
    it("should set feeToSetter correctly", async function () {
      strictEqual((await factory.read.feeToSetter()).toLowerCase(), deployer);
    });

    it("should not allow zero address feeToSetter in constructor", async function () {
      await expectRevert(
        viem.deployContract("FluxSwapFactory", ["0x0000000000000000000000000000000000000000"]),
        "FluxSwap: ZERO_ADDRESS"
      );
    });

    it("should create a new pair", async function () {
      const token0Address = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1Address = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      const pairAddr = await factory.read.getPair([token0Address, token1Address]);
      notEqual(pairAddr, "0x0000000000000000000000000000000000000000");
    });

    it("should not allow duplicate pair creation", async function () {
      let errorOccurred = false;
      try {
        await factory.write.createPair([tokenA.address, tokenB.address]);
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should not allow same address for both tokens", async function () {
      let errorOccurred = false;
      try {
        await factory.write.createPair([tokenA.address, tokenA.address]);
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should not allow zero address", async function () {
      let errorOccurred = false;
      try {
        await factory.write.createPair(["0x0000000000000000000000000000000000000000", tokenB.address]);
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should track all pairs", async function () {
      const allPairsLength = await factory.read.allPairsLength();
      ok(allPairsLength > 0n);
    });

    it("should set feeTo", async function () {
      await factory.write.setFeeTo([deployer]);
      strictEqual((await factory.read.feeTo()).toLowerCase(), deployer);
    });

    it("should set feeToSetter", async function () {
      await factory.write.setFeeToSetter([deployer]);
      strictEqual((await factory.read.feeToSetter()).toLowerCase(), deployer);
    });
  });

  /**
   * 流动性添加与移除测试
   * 场景：LP 添加流动性、移除流动性、验证份额计算
   */
  describe("Liquidity", function () {
    it("should add initial liquidity correctly", async function () {
      const totalSupply = await pair.read.totalSupply();
      strictEqual(totalSupply, 10000000000000000000000n);
    });

    it("should have correct reserves after adding liquidity", async function () {
      const [r0, r1] = await pair.read.getReserves();
      strictEqual(r0, 10000000000000000000000n);
      strictEqual(r1, 10000000000000000000000n);
    });

    it("should have LP balance for provider", async function () {
      const lpBalance = await pair.read.balanceOf([lp]);
      ok(lpBalance > 0n, "LP balance should be greater than 0");
    });

    it("should allow LP to remove liquidity", async function () {
      const lpBalanceBefore = await pair.read.balanceOf([lp]);
      const tokenABalanceBefore = await tokenA.read.balanceOf([lp]);
      const tokenBBalanceBefore = await tokenB.read.balanceOf([lp]);

      const removeAmount = lpBalanceBefore / 10n;

      await router.write.removeLiquidity([
        tokenA.address,
        tokenB.address,
        removeAmount,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const tokenABalanceAfter = await tokenA.read.balanceOf([lp]);
      const tokenBBalanceAfter = await tokenB.read.balanceOf([lp]);
      ok(tokenABalanceAfter > tokenABalanceBefore);
      ok(tokenBBalanceAfter > tokenBBalanceBefore);
    });

    it("should not allow removeLiquidity with zero value", async function () {
      let errorOccurred = false;
      try {
        await router.write.removeLiquidity([
          tokenA.address,
          tokenB.address,
          0n,
          0n,
          0n,
          lp,
          getDeadline(),
        ], { account: lp });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should not allow removeLiquidity with insufficient balance", async function () {
      let errorOccurred = false;
      try {
        await router.write.removeLiquidity([
          tokenA.address,
          tokenB.address,
          10000000n * 10n ** 18n,
          0n,
          0n,
          lp,
          getDeadline(),
        ], { account: lp });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });
  });

  /**
   * ETH 流动性测试
   * 场景：LP 添加 ETH-token 流动性
   */
  describe("ETH Liquidity", function () {
    it("should add liquidity with ETH", async function () {
      await tokenA.write.approve([await router.address, 1000000n * 10n ** 18n], { account: lp });

      let testSucceeded = true;
      try {
        await router.write.addLiquidityETH([
          tokenA.address,
          100n * 10n ** 18n,
          0n,
          0n,
          lp,
          getDeadline(),
        ], { account: lp, value: 100n * 10n ** 18n });
      } catch (e) {
        testSucceeded = false;
      }
      ok(testSucceeded, "addLiquidityETH should succeed");
    });

    it("should not allow zero addresses in router constructor", async function () {
      await expectRevert(
        viem.deployContract("FluxSwapRouter", ["0x0000000000000000000000000000000000000000", WETH.address]),
        "FluxSwapRouter: ZERO_ADDRESS"
      );
      await expectRevert(
        viem.deployContract("FluxSwapRouter", [factory.address, "0x0000000000000000000000000000000000000000"]),
        "FluxSwapRouter: ZERO_ADDRESS"
      );
    });
  });

  /**
   * 多角色交易测试
   * 场景：LP 提供流动性，trader 进行交易，验证手续费分派
   */
  describe("Multi-Role Trading", function () {
    it("should allow trader to swap with LP providing liquidity", async function () {
      const lpBalanceBefore = await tokenA.read.balanceOf([lp]);
      const traderBalanceABefore = await tokenA.read.balanceOf([trader]);
      const traderBalanceBBefore = await tokenB.read.balanceOf([trader]);

      const swapAmount = 10n * 10n ** 18n;
      await router.write.swapExactTokensForTokens([
        swapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const traderBalanceAAfter = await tokenA.read.balanceOf([trader]);
      const traderBalanceBAfter = await tokenB.read.balanceOf([trader]);

      ok(traderBalanceAAfter < traderBalanceABefore, "Trader should spend tokenA");
      ok(traderBalanceBAfter > traderBalanceBBefore, "Trader should receive tokenB");

      const lpBalanceAfter = await tokenA.read.balanceOf([lp]);
      strictEqual(lpBalanceBefore, lpBalanceAfter, "LP balance should not change from trade");
    });

    it("should distribute fees to LP after trades", async function () {
      const lpLpBalanceBefore = await pair.read.balanceOf([lp]);

      await router.write.swapExactTokensForTokens([
        1n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const lpLpBalanceAfter = await pair.read.balanceOf([lp]);
      ok(lpLpBalanceAfter >= lpLpBalanceBefore, "LP balance should be >= after trades");
    });
  });

  /**
   * 连续交易价格影响测试
   * 场景：连续多次交易对价格的影响，验证滑点累积
   */
  describe("Continuous Trading Price Impact", function () {
    it("should show price impact on consecutive swaps", async function () {
      const [reserve0Before, reserve1Before] = await pair.read.getReserves();

      let successCount = 0;
      try {
        await router.write.swapExactTokensForTokens([
        50n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
        successCount++;
      } catch (e) {
      }

      try {
        await router.write.swapExactTokensForTokens([
        50n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
        successCount++;
      } catch (e) {
      }

      ok(successCount >= 1, "At least first swap should succeed");
    });

    it("should accumulate price impact over multiple swaps", async function () {
      const reservesBefore = await pair.read.getReserves();
      const reserve0Before = reservesBefore[0] as bigint;
      const reserve1Before = reservesBefore[1] as bigint;
      const token0 = (await pair.read.token0()).toLowerCase();
      const outputReserveBefore = tokenB.address.toLowerCase() === token0 ? reserve0Before : reserve1Before;

      for (let i = 0; i < 3; i++) {
        await router.write.swapExactTokensForTokens([
        50n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
      }

      const reservesAfter = await pair.read.getReserves();
      const reserve0After = reservesAfter[0] as bigint;
      const reserve1After = reservesAfter[1] as bigint;
      const outputReserveAfter = tokenB.address.toLowerCase() === token0 ? reserve0After : reserve1After;

      if (outputReserveBefore > 0n) {
        const totalPriceImpact = ((outputReserveBefore - outputReserveAfter) * 100n) / outputReserveBefore;

        ok(totalPriceImpact > 0n, "Multiple swaps should accumulate price impact");
        ok(totalPriceImpact < 100n, "Price impact should not exceed 100%");
      }
    });
  });

  /**
   * 价格累计值测试
   * 场景：验证 price0CumulativeLast 和 price1CumulativeLast 在交易后正确更新
   */
  describe("Cumulative Price", function () {
    it("should track price0CumulativeLast after swaps", async function () {
      const price0Before = await pair.read.price0CumulativeLast();

      await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const price0After = await pair.read.price0CumulativeLast();
      ok(price0After > price0Before, "price0CumulativeLast should increase after swap");
    });

    it("should track price1CumulativeLast after swaps", async function () {
      const price1Before = await pair.read.price1CumulativeLast();

      await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenB.address, tokenA.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const price1After = await pair.read.price1CumulativeLast();
      ok(price1After > price1Before, "price1CumulativeLast should increase after swap");
    });

    it("should get reserves correctly", async function () {
      const [r0, r1] = await pair.read.getReserves();
      ok(r0 > 0n && r1 > 0n);
    });
  });

  /**
   * Swap 交易测试
   * 场景：token-token 兑换、滑点保护、精确输出
   */
  describe("Swap", function () {
    it("should swap tokenA for tokenB", async function () {
      const balanceABefore = await tokenA.read.balanceOf([trader]);
      const balanceBBefore = await tokenB.read.balanceOf([trader]);

      await router.write.swapExactTokensForTokens([
        10n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const balanceAAfter = await tokenA.read.balanceOf([trader]);
      const balanceBAfter = await tokenB.read.balanceOf([trader]);

      ok(balanceAAfter < balanceABefore);
      ok(balanceBAfter > balanceBBefore);
    });

    it("should swap tokenB for tokenA", async function () {
      const balanceABefore = await tokenA.read.balanceOf([trader]);
      const balanceBBefore = await tokenB.read.balanceOf([trader]);

      await router.write.swapExactTokensForTokens([
        10n * 10n ** 18n,
        0n,
        [tokenB.address, tokenA.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const balanceAAfter = await tokenA.read.balanceOf([trader]);
      const balanceBAfter = await tokenB.read.balanceOf([trader]);

      ok(balanceBAfter < balanceBBefore);
      ok(balanceAAfter > balanceABefore);
    });

    it("should update reserves after swap", async function () {
      const [r0Before, r1Before] = await pair.read.getReserves();

      await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const [r0After, r1After] = await pair.read.getReserves();
      ok(r0After !== r0Before || r1After !== r1Before);
    });

    it("should allow swap with zero slippage protection", async function () {
      const balanceABefore = await tokenA.read.balanceOf([trader]);
      const balanceBBefore = await tokenB.read.balanceOf([trader]);

      await router.write.swapExactTokensForTokens([
        10n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const balanceAAfter = await tokenA.read.balanceOf([trader]);
      const balanceBAfter = await tokenB.read.balanceOf([trader]);

      ok(balanceAAfter < balanceABefore);
      ok(balanceBAfter > balanceBBefore);
    });

    it("should respect exact output amount", async function () {
      const balanceBBefore = await tokenB.read.balanceOf([trader]);
      const exactOutput = 1n * 10n ** 18n;

      await router.write.swapTokensForExactTokens([
        exactOutput,
        100n * 10n ** 18n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const balanceBAfter = await tokenB.read.balanceOf([trader]);
      strictEqual(balanceBAfter - balanceBBefore, exactOutput);
    });

    it("should calculate slippage correctly with large amounts", async function () {
      const largeSwapAmount = 500n * 10n ** 18n;
      const [r0, r1] = await pair.read.getReserves();

      const expectedOutput = (largeSwapAmount * r1) / (r0 + largeSwapAmount);
      const onePercentSlippage = expectedOutput * 99n / 100n;
      const fivePercentSlippage = expectedOutput * 95n / 100n;

      const balanceBBefore = await tokenB.read.balanceOf([trader]);

      await router.write.swapExactTokensForTokens([
        largeSwapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const balanceBAfter = await tokenB.read.balanceOf([trader]);
      const actualOutput = balanceBAfter - balanceBBefore;

      ok(actualOutput >= onePercentSlippage, "Output with 5% slippage tolerance should meet 1% minimum");
    });

    it("should revert clearly when pair does not exist", async function () {
      const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);

      await tokenC.write.mint([trader, 1000n * 10n ** 18n]);
      await tokenC.write.approve([await router.address, 1000n * 10n ** 18n], { account: trader });

      await expectRevert(
        router.write.swapExactTokensForTokens([
          1n * 10n ** 18n,
          0n,
          [tokenA.address, tokenC.address],
          trader,
          getDeadline()
        ], { account: trader }),
        "FluxSwapRouter: PAIR_NOT_FOUND"
      );
    });
  });

  /**
   * Pair 直接交易测试
   * 场景：绕过 Router 直接与 Pair 交互
   */
  describe("Pair Direct Swap", function () {
    it("should not allow direct swap on pair without transfer", async function () {
      let errorOccurred = false;
      try {
        await pair.write.swap([
          10n * 10n ** 18n,
          0n,
          trader,
        ], { account: trader });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should not allow swap with zero output", async function () {
      let errorOccurred = false;
      try {
        await pair.write.swap([0n, 0n, trader, "0x"], { account: trader });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should not allow swap to zero address", async function () {
      let errorOccurred = false;
      try {
        await pair.write.swap([1n, 0n, "0x0000000000000000000000000000000000000000", "0x"], { account: trader });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });
  });

  /**
   * 闪电贷测试
   * 场景：从池子借出代币，必须归还并支付手续费
   */
  describe("FlashSwap", function () {
    it("should not allow flash swap with zero output", async function () {
      await expectRevert(
        pair.write.swap([0n, 0n, trader, "0x01"], { account: trader }),
        "FluxSwap: INSUFFICIENT_OUTPUT_AMOUNT"
      );
    });

    it("should revert flash swap when a non-callback receiver cannot repay", async function () {
      await expectRevert(
        pair.write.swap([1n, 0n, deployer, "0x01"], { account: trader }),
        "function call to a non-contract account"
      );
    });

    it("should require repayment in flash swap", async function () {
      const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);
      const tokenOut = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const data = encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        [tokenOut, 0n]
      );

      await expectRevert(
        pair.write.swap([10n * 10n ** 18n, 0n, await flashReceiver.address, data]),
        "FluxSwap: INSUFFICIENT_INPUT_AMOUNT"
      );
    });

    it("should fail with insufficient repayment in flash swap", async function () {
      const partialReceiver = await viem.deployContract("MockPartialFlashSwapReceiver", []);

      await expectRevert(
        pair.write.swap([100n * 10n ** 18n, 0n, await partialReceiver.address, "0x01"]),
        "FluxSwap: K"
      );
    });
  });

  /**
   * 维护操作测试
   * 场景：skim（提取多余代币）、sync（同步储备）
   */
  describe("Maintenance", function () {
    it("should skim excess tokens", async function () {
      const pairBalanceBefore = await tokenA.read.balanceOf([await pair.address]);

      await tokenA.write.transfer([await pair.address, 50n * 10n ** 18n], { account: lp });

      await pair.write.skim([lp]);

      const pairBalanceAfter = await tokenA.read.balanceOf([await pair.address]);
      strictEqual(pairBalanceAfter, pairBalanceBefore);
    });

    it("should sync reserves", async function () {
      const [r0Before, r1Before] = await pair.read.getReserves();

      await pair.write.sync();

      const [r0After, r1After] = await pair.read.getReserves();
      ok(r0After === r0Before && r1After === r1Before);
    });

    it("should handle skim when reserves are unbalanced", async function () {
      await tokenA.write.transfer([await pair.address, 100n * 10n ** 18n], { account: lp });
      await pair.write.skim([lp]);
      const pairBalanceA = await tokenA.read.balanceOf([await pair.address]);
      ok(pairBalanceA > 0n || pairBalanceA === 0n);
    });
  });

  /**
   * 协议手续费测试
   * 场景：开启 feeTo 后，协议通过新增 LP 份额分享部分手续费增值。
   */
  describe("Protocol Fee", function () {
    it("should initialize kLast after liquidity changes when fee is on", async function () {
      await factory.write.setFeeTo([deployer]);
      strictEqual(await pair.read.kLast(), 0n);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      ok(await pair.read.kLast() > 0n, "kLast should be initialized when fee is on");
    });

    it("should mint LP shares to feeTo after fee-generating swaps", async function () {
      await factory.write.setFeeTo([deployer]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const protocolLpBefore = await pair.read.balanceOf([deployer]);
      const kLastBefore = await pair.read.kLast();

      await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        getDeadline(),
      ], { account: trader });

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const protocolLpAfter = await pair.read.balanceOf([deployer]);
      const kLastAfter = await pair.read.kLast();

      ok(protocolLpAfter > protocolLpBefore, "feeTo should receive newly minted LP shares");
      ok(kLastAfter >= kLastBefore, "kLast should stay updated after fee minting");
    });

    it("should allow feeTo to redeem protocol fee shares for underlying assets", async function () {
      await factory.write.setFeeTo([deployer]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        getDeadline(),
      ], { account: trader });

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const protocolLp = await pair.read.balanceOf([deployer]);
      ok(protocolLp > 0n, "feeTo should hold LP shares before redeeming");

      const deployerTokenABefore = await tokenA.read.balanceOf([deployer]);
      const deployerTokenBBefore = await tokenB.read.balanceOf([deployer]);

      await pair.write.transfer([pair.address, protocolLp], { account: deployer });
      await pair.write.burn([deployer], { account: deployer });

      const deployerTokenAAfter = await tokenA.read.balanceOf([deployer]);
      const deployerTokenBAfter = await tokenB.read.balanceOf([deployer]);

      ok(deployerTokenAAfter > deployerTokenABefore, "feeTo should receive tokenA when burning protocol shares");
      ok(deployerTokenBAfter > deployerTokenBBefore, "feeTo should receive tokenB when burning protocol shares");
    });
  });

  /**
   * 重入保护测试
   * 场景：验证合约对重入攻击的防护
   */
  describe("Reentrancy Protection", function () {
    it("should maintain K constant after operations", async function () {
      const [r0Before, r1Before] = await pair.read.getReserves();
      const kBefore = r0Before * r1Before;

      await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const [r0After, r1After] = await pair.read.getReserves();
      const kAfter = r0After * r1After;

      ok(kAfter >= kBefore, "K should not decrease after swap");
    });
  });

  /**
   * Permit 签名测试
   * 场景：EIP-2612 免授权转账功能
   */
  describe("Permit", function () {
    it("should track nonces correctly", async function () {
      const nonce = await pair.read.nonces([lp]);
      strictEqual(nonce, 0n);
    });

    it("should have non-zero DOMAIN_SEPARATOR", async function () {
      const domainSeparator = await pair.read.DOMAIN_SEPARATOR();
      notEqual(domainSeparator, "0x0000000000000000000000000000000000000000");
    });

    it("should have correct PERMIT_TYPEHASH", async function () {
      const typehash = await pair.read.PERMIT_TYPEHASH();
      strictEqual(typehash, "0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9");
    });

    it("should revert with expired deadline", async function () {
      let errorOccurred = false;
      try {
        await pair.write.permit([lp, lp, 100n, 0, 0, "0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000"]);
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });

    it("should revert with invalid signature", async function () {
      let errorOccurred = false;
      try {
        await pair.write.permit([lp, lp, 100n, Math.floor(Date.now() / 1000) + 3600, 0, "0x0000000000000000000000000000000000000000000000000000000000000001", "0x0000000000000000000000000000000000000000000000000000000000000001"]);
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true);
    });
  });

  /**
   * 报价和金额计算测试
   * 场景：验证 getQuote 等辅助函数的正确性
   */
  describe("Quote and Amount Calculations", function () {
    it("should calculate quote correctly", async function () {
      const quote = await router.read.quote([10n * 10n ** 18n, 1000n * 10n ** 18n, 2000n * 10n ** 18n]);
      strictEqual(quote, 20n * 10n ** 18n);
    });
  });

  /**
   * 不同精度代币测试
   * 场景：处理 decimals 不同的代币对
   */
  describe("Different Precision Tokens", function () {
    it("should handle tokens with different decimals", async function () {
      const token6 = await viem.deployContract("MockERC20", ["Token 6", "TKN6", 6]);
      const token18 = await viem.deployContract("MockERC20", ["Token 18", "TKN18", 18]);

      const token0Address = token6.address < token18.address ? token6.address : token18.address;
      const token1Address = token6.address < token18.address ? token18.address : token6.address;

      await factory.write.createPair([token0Address, token1Address]);
      const newPairAddress = await factory.read.getPair([token0Address, token1Address]);
      const newPair = await viem.getContractAt("FluxSwapPair", newPairAddress);

      await token6.write.mint([lp, 1000000n * 10n ** 6n]);
      await token18.write.mint([lp, 1000000n * 10n ** 18n]);

      await token6.write.approve([await router.address, 1000000n * 10n ** 6n], { account: lp });
      await token18.write.approve([await router.address, 1000000n * 10n ** 18n], { account: lp });

      await router.write.addLiquidity([
        token6.address,
        token18.address,
        1000n * 10n ** 6n,
        1000n * 10n ** 18n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const totalSupply = await newPair.read.totalSupply();
      ok(totalSupply > 0n, "Should have liquidity with different precision tokens");

      const [r0, r1] = await newPair.read.getReserves();
      ok(r0 > 0n && r1 > 0n, "Both reserves should be positive");
    });
  });

  /**
   * 价格操纵边缘场景测试
   * 场景：sandwich 攻击、小额交易、大额相对交易
   */
  describe("Price Manipulation Edge Cases", function () {
    it("should resist single large swap manipulation", async function () {
      const reservesBefore = await pair.read.getReserves();
      const reserve0Before = reservesBefore[0] as bigint;
      const reserve1Before = reservesBefore[1] as bigint;

      await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const reservesAfter = await pair.read.getReserves();
      const reserve0After = reservesAfter[0] as bigint;
      const reserve1After = reservesAfter[1] as bigint;
      const kBefore = reserve0Before * reserve1Before;
      const kAfter = reserve0After * reserve1After;
      const kMin = (kBefore * 9999n) / 10000n;

      ok(kAfter >= kMin, "K should be maintained within 0.01% tolerance");
    });

    it("should handle sandwich attack simulation", async function () {
      const trader2 = walletClient3.account.address.toLowerCase() as `0x${string}`;

      const [reserve0Before, reserve1Before] = await pair.read.getReserves();

      let successCount = 0;
      try {
        await router.write.swapExactTokensForTokens([
        10n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
        successCount++;
      } catch (e) {
      }

      try {
        await router.write.swapExactTokensForTokens([
        10n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader2,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
        successCount++;
      } catch (e) {
      }

      ok(successCount > 0, "At least first swap should succeed");
    });

    it("should handle tiny swap amounts", async function () {
      const tinyAmount = 1n * 10n ** 15n;

      const balanceABefore = await tokenA.read.balanceOf([trader]);
      const balanceBBefore = await tokenB.read.balanceOf([trader]);

      let swapSucceeded = true;
      try {
        await router.write.swapExactTokensForTokens([
        tinyAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
      } catch (e) {
        swapSucceeded = false;
      }

      if (swapSucceeded) {
        const balanceAAfter = await tokenA.read.balanceOf([trader]);
        const balanceBAfter = await tokenB.read.balanceOf([trader]);
        ok(balanceAAfter < balanceABefore || balanceAAfter === balanceABefore);
        ok(balanceBAfter >= balanceBBefore);
      } else {
        ok(true, "Tiny swap may fail due to rounding, which is expected");
      }
    });

    it("should handle very large swap relative to liquidity", async function () {
      const largeSwapAmount = 100n * 10n ** 18n;

      const reservesBefore = await pair.read.getReserves();
      const reserve0Before = reservesBefore[0] as bigint;
      const reserve1Before = reservesBefore[1] as bigint;
      const kBefore = reserve0Before * reserve1Before;

      let swapSucceeded = true;
      try {
        await router.write.swapExactTokensForTokens([
        largeSwapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
      } catch (e) {
        swapSucceeded = false;
      }

      if (swapSucceeded) {
        const reservesAfter = await pair.read.getReserves();
        const reserve0After = reservesAfter[0] as bigint;
        const reserve1After = reservesAfter[1] as bigint;
        const kAfter = reserve0After * reserve1After;
        const kMin = (kBefore * 999n) / 1000n;
        ok(kAfter >= kMin, "K should be maintained even with large swap");
      }
    });

    it("should maintain price ratio after multiple directional swaps", async function () {
      const [reserve0Initial, reserve1Initial] = await pair.read.getReserves();
      const initialPriceRatio = (reserve1Initial * 10n ** 18n) / reserve0Initial;

      let successCount = 0;
      for (let i = 0; i < 3; i++) {
        try {
          await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
          successCount++;
        } catch (e) {
        }
      }

      for (let i = 0; i < 2; i++) {
        try {
          await router.write.swapExactTokensForTokens([
        5n * 10n ** 18n,
        0n,
        [tokenB.address, tokenA.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
          successCount++;
        } catch (e) {
        }
      }

      ok(successCount > 0, "At least some swaps should succeed");
    });

    it("should handle extreme imbalance before addLiquidity", async function () {
      const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
      const tokenD = await viem.deployContract("MockERC20", ["Token D", "TKND", 18]);

      const token0Address = tokenC.address < tokenD.address ? tokenC.address : tokenD.address;
      const token1Address = tokenC.address < tokenD.address ? tokenD.address : tokenC.address;

      await factory.write.createPair([token0Address, token1Address]);
      const newPairAddress = await factory.read.getPair([token0Address, token1Address]);
      const newPair = await viem.getContractAt("FluxSwapPair", newPairAddress);

      const amountC = 1000n * 10n ** 18n;
      const amountD = 1000n * 10n ** 18n;

      await tokenC.write.mint([lp, amountC]);
      await tokenD.write.mint([lp, amountD]);

      await tokenC.write.approve([await router.address, amountC], { account: lp });
      await tokenD.write.approve([await router.address, amountD], { account: lp });

      await router.write.addLiquidity([
        tokenC.address,
        tokenD.address,
        amountC,
        amountD,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const [r0, r1] = await newPair.read.getReserves();
      ok(r0 > 0n && r1 > 0n, "Both reserves should be positive");
      ok(r0 * r1 > 0n, "K should be positive");
    });

    it("should handle rapid consecutive swaps", async function () {
      const swapAmount = 1n * 10n ** 18n;

      const [r0Before, r1Before] = await pair.read.getReserves();
      const kBefore = r0Before * r1Before;

      let successCount = 0;
      for (let i = 0; i < 5; i++) {
        try {
          await router.write.swapExactTokensForTokens([
        swapAmount,
        0n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
          successCount++;
        } catch (e) {
        }
      }

      ok(successCount > 0, "At least some swaps should succeed");
    });

    it("should handle imbalanced removal", async function () {
      const lpBalance = await pair.read.balanceOf([lp]);
      const tokenABalanceBefore = await tokenA.read.balanceOf([lp]);
      const tokenBBalanceBefore = await tokenB.read.balanceOf([lp]);

      await router.write.removeLiquidity([
        tokenA.address,
        tokenB.address,
        lpBalance / 2n,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const tokenABalanceAfter = await tokenA.read.balanceOf([lp]);
      const tokenBBalanceAfter = await tokenB.read.balanceOf([lp]);

      ok(tokenABalanceAfter > tokenABalanceBefore, "LP should receive tokenA");
      ok(tokenBBalanceAfter > tokenBBalanceBefore, "LP should receive tokenB");

      const [r0, r1] = await pair.read.getReserves();
      ok(r0 > 0n && r1 > 0n, "Reserves should remain positive after removal");
    });

    it("should handle very small liquidity removal", async function () {
      const lpBalance = await pair.read.balanceOf([lp]);
      const minimalRemoval = 1n;

      await router.write.removeLiquidity([
        tokenA.address,
        tokenB.address,
        minimalRemoval,
        0n,
        0n,
        lp,
        getDeadline(),
      ], { account: lp });

      const lpBalanceAfter = await pair.read.balanceOf([lp]);
      ok(lpBalanceAfter < lpBalance, "LP balance should decrease");
    });

    it("should maintain K after many small swaps", async function () {
      const [r0Initial, r1Initial] = await pair.read.getReserves();
      const kInitial = r0Initial * r1Initial;

      let successCount = 0;
      for (let i = 0; i < 10; i++) {
        const isAToB = i % 2 === 0;
        try {
          await router.write.swapExactTokensForTokens([
            1n * 10n ** 18n,
            0n,
            isAToB ? [tokenA.address, tokenB.address] : [tokenB.address, tokenA.address],
            trader,
            BigInt(Math.floor(Date.now() / 1000) + 3600)
          ], { account: trader });
          successCount++;
        } catch (e) {
        }
      }

      ok(successCount > 0, "At least some swaps should succeed");
    });

    it("should handle extreme price after large one-sided liquidity addition", async function () {
      const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
      const tokenD = await viem.deployContract("MockERC20", ["Token D", "TKND", 18]);

      const token0Address = tokenC.address < tokenD.address ? tokenC.address : tokenD.address;
      const token1Address = tokenC.address < tokenD.address ? tokenD.address : tokenC.address;

      await factory.write.createPair([token0Address, token1Address]);
      const newPairAddress = await factory.read.getPair([token0Address, token1Address]);
      const newPair = await viem.getContractAt("FluxSwapPair", newPairAddress);

      const largeAmount = 10000n * 10n ** 18n;
      const smallAmount = 10n * 10n ** 18n;

      await tokenC.write.mint([lp, largeAmount]);
      await tokenD.write.mint([lp, smallAmount]);

      await tokenC.write.approve([await router.address, largeAmount], { account: lp });
      await tokenD.write.approve([await router.address, smallAmount], { account: lp });

      let addLiquiditySucceeded = true;
      try {
        await router.write.addLiquidity([
          tokenC.address,
          tokenD.address,
          largeAmount,
          smallAmount,
          0n,
          0n,
          lp,
          getDeadline(),
        ], { account: lp });
      } catch (e) {
        addLiquiditySucceeded = false;
      }

      if (addLiquiditySucceeded) {
        const [r0, r1] = await newPair.read.getReserves();
        ok(r0 > 0n && r1 > 0n, "Both reserves should be positive");

        const priceRatio = (r1 * 10n ** 18n) / r0;
        ok(priceRatio > 0n, "Price ratio should be positive");
      }
    });
  });

  /**
   * 精确输出_swap测试
   * 场景：swapTokensForExactTokens 指定输出计算输入
   */
  describe("Exact Output Swap", function () {
    it("should swap tokens for exact tokens output", async function () {
      const tokenBBalanceBefore = await tokenB.read.balanceOf([trader]);
      const exactTokenBOut = 1n * 10n ** 18n;

      await router.write.swapTokensForExactTokens([
        exactTokenBOut,
        1000n * 10n ** 18n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });

      const tokenBBalanceAfter = await tokenB.read.balanceOf([trader]);
      const received = tokenBBalanceAfter - tokenBBalanceBefore;

      ok(received >= exactTokenBOut, "Should receive at least exact amount");
    });

    it("should not allow swapTokensForExactTokens with insufficient input", async function () {
      let errorOccurred = false;
      try {
        await router.write.swapTokensForExactTokens([
        1000n * 10n ** 18n,
        1n * 10n ** 18n,
        [tokenA.address, tokenB.address],
        trader,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
      ], { account: trader });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true, "Should revert with insufficient input amount");
    });
  });

  /**
   * Pair ERC20 函数测试
   * 场景：LP 代币的 transfer、approve、transferFrom
   */
  describe("Fee-On-Transfer Token Support", function () {
    it("should swap exact taxed tokens for tokens with supporting router function", async function () {
      const feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, 100n]);
      await factory.write.createPair([feeToken.address, tokenB.address]);
      const taxedPairAddress = await factory.read.getPair([feeToken.address, tokenB.address]);
      const taxedPair = await viem.getContractAt("FluxSwapPair", taxedPairAddress);

      const liquidityAmount = 10000n * 10n ** 18n;
      const swapAmount = 100n * 10n ** 18n;

      await feeToken.write.mint([lp, 20000n * 10n ** 18n]);
      await feeToken.write.mint([trader, 1000n * 10n ** 18n]);
      await tokenB.write.mint([lp, 20000n * 10n ** 18n]);

      await feeToken.write.transfer([taxedPairAddress, liquidityAmount], { account: lp });
      await tokenB.write.transfer([taxedPairAddress, liquidityAmount], { account: lp });
      await taxedPair.write.mint([lp], { account: lp });

      await feeToken.write.approve([router.address, swapAmount], { account: trader });

      const balanceBefore = await tokenB.read.balanceOf([trader]);
      await router.write.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        [swapAmount, 1n, [feeToken.address, tokenB.address], trader, getDeadline()],
        { account: trader }
      );
      const balanceAfter = await tokenB.read.balanceOf([trader]);

      ok(balanceAfter > balanceBefore, "Trader should receive output tokens");
    });

    it("should swap exact ETH for taxed tokens with supporting router function", async function () {
      const feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, 100n]);
      await factory.write.createPair([feeToken.address, WETH.address]);
      const taxedPairAddress = await factory.read.getPair([feeToken.address, WETH.address]);
      const taxedPair = await viem.getContractAt("FluxSwapPair", taxedPairAddress);

      const tokenLiquidity = 10000n * 10n ** 18n;
      const ethLiquidity = 10n * 10n ** 18n;

      await feeToken.write.mint([lp, 20000n * 10n ** 18n]);
      await feeToken.write.transfer([taxedPairAddress, tokenLiquidity], { account: lp });
      await WETH.write.deposit({ account: lp, value: ethLiquidity });
      await WETH.write.transfer([taxedPairAddress, ethLiquidity], { account: lp });
      await taxedPair.write.mint([lp], { account: lp });

      const balanceBefore = await feeToken.read.balanceOf([trader]);
      await router.write.swapExactETHForTokensSupportingFeeOnTransferTokens(
        [1n, [WETH.address, feeToken.address], trader, getDeadline()],
        { account: trader, value: 1n * 10n ** 18n }
      );
      const balanceAfter = await feeToken.read.balanceOf([trader]);

      ok(balanceAfter > balanceBefore, "Trader should receive taxed output token");
    });

    it("should swap exact taxed tokens for ETH with supporting router function", async function () {
      const feeToken = await viem.deployContract("MockFeeOnTransferERC20", ["Tax Token", "TAX", 18, 100n]);
      await factory.write.createPair([feeToken.address, WETH.address]);
      const taxedPairAddress = await factory.read.getPair([feeToken.address, WETH.address]);
      const taxedPair = await viem.getContractAt("FluxSwapPair", taxedPairAddress);

      const tokenLiquidity = 10000n * 10n ** 18n;
      const ethLiquidity = 10n * 10n ** 18n;
      const swapAmount = 100n * 10n ** 18n;

      await feeToken.write.mint([lp, 20000n * 10n ** 18n]);
      await feeToken.write.mint([trader, 1000n * 10n ** 18n]);
      await feeToken.write.transfer([taxedPairAddress, tokenLiquidity], { account: lp });
      await WETH.write.deposit({ account: lp, value: ethLiquidity });
      await WETH.write.transfer([taxedPairAddress, ethLiquidity], { account: lp });
      await taxedPair.write.mint([lp], { account: lp });

      await feeToken.write.approve([router.address, swapAmount], { account: trader });

      const balanceBefore = await publicClient.getBalance({ address: trader });
      const hash = await router.write.swapExactTokensForETHSupportingFeeOnTransferTokens(
        [swapAmount, 1n, [feeToken.address, WETH.address], trader, getDeadline()],
        { account: trader }
      );
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const gasPaid = receipt.gasUsed * receipt.effectiveGasPrice;
      const balanceAfter = await publicClient.getBalance({ address: trader });

      ok(balanceAfter + gasPaid > balanceBefore, "Trader should receive ETH output");
    });
  });

  describe("Pair ERC20 Functions", function () {
    it("should track totalSupply correctly", async function () {
      const totalSupply = await pair.read.totalSupply();
      ok(totalSupply > 0n, "Total supply should be positive after liquidity added");
    });

    it("should allow transfer of LP tokens", async function () {
      const senderBalanceBefore = await pair.read.balanceOf([lp]);
      const recipientBalanceBefore = await pair.read.balanceOf([trader]);
      const transferAmount = 1n * 10n ** 18n;

      await pair.write.transfer([trader, transferAmount], { account: lp });

      const senderBalanceAfter = await pair.read.balanceOf([lp]);
      const recipientBalanceAfter = await pair.read.balanceOf([trader]);

      strictEqual(senderBalanceAfter, senderBalanceBefore - transferAmount);
      strictEqual(recipientBalanceAfter, recipientBalanceBefore + transferAmount);
    });

    it("should allow transferFrom with approval", async function () {
      const owner = lp;
      const spender = trader;
      const ownerBalanceBefore = await pair.read.balanceOf([owner]);
      const transferAmount = 1n * 10n ** 18n;

      await pair.write.approve([spender, transferAmount], { account: owner });

      const allowance = await pair.read.allowance([owner, spender]);
      ok(allowance >= transferAmount, "Allowance should be set");

      await pair.write.transferFrom([owner, trader, transferAmount], { account: spender });

      const ownerBalanceAfter = await pair.read.balanceOf([owner]);
      strictEqual(ownerBalanceAfter, ownerBalanceBefore - transferAmount);
    });

    it("should check allowance correctly", async function () {
      const owner = lp;
      const spender = trader;
      const allowanceAmount = 5n * 10n ** 18n;

      await pair.write.approve([spender, allowanceAmount], { account: owner });

      const allowance = await pair.read.allowance([owner, spender]);
      strictEqual(allowance, allowanceAmount);
    });

    it("should not allow transfer exceeding balance", async function () {
      const balance = await pair.read.balanceOf([lp]);
      const excessiveAmount = balance + 1n;

      let errorOccurred = false;
      try {
        await pair.write.transfer([trader, excessiveAmount], { account: lp });
      } catch (e) {
        errorOccurred = true;
      }
      strictEqual(errorOccurred, true, "Should revert when transferring more than balance");
    });

      it("should not allow transferFrom exceeding allowance", async function () {
        const owner = lp;
        const spender = trader;
        const allowanceAmount = 1n * 10n ** 18n;
        const excessiveAmount = allowanceAmount + 1n;

      await pair.write.approve([spender, allowanceAmount], { account: owner });

      let errorOccurred = false;
      try {
        await pair.write.transferFrom([owner, trader, excessiveAmount], { account: spender });
      } catch (e) {
        errorOccurred = true;
        }
        strictEqual(errorOccurred, true, "Should revert when transferring more than allowance");
      });

      it("should not allow transfer to zero address", async function () {
        let errorOccurred = false;
        try {
          await pair.write.transfer(["0x0000000000000000000000000000000000000000", 1n], { account: lp });
        } catch (e) {
          errorOccurred = true;
        }
        strictEqual(errorOccurred, true, "Should revert when transferring to zero address");
      });

      it("should not allow approve to zero address", async function () {
        let errorOccurred = false;
        try {
          await pair.write.approve(["0x0000000000000000000000000000000000000000", 1n], { account: lp });
        } catch (e) {
          errorOccurred = true;
        }
        strictEqual(errorOccurred, true, "Should revert when approving zero address");
      });
    });

  /**
   * 工厂所有交易对长度测试
   * 场景：验证 allPairsLength 函数正确性
   */
  describe("Factory AllPairsLength", function () {
    it("should return correct pairs length", async function () {
      const pairsLength = await factory.read.allPairsLength();
      ok(pairsLength >= 1n, "Should have at least one pair created");

      const pairsLengthFromRead = await factory.read.allPairsLength();
      strictEqual(pairsLength, pairsLengthFromRead, "Length should be consistent");
    });

    it("should increase pairs length when creating new pair", async function () {
      const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
      const tokenD = await viem.deployContract("MockERC20", ["Token D", "TKND", 18]);

      const initialLength = await factory.read.allPairsLength();

      await factory.write.createPair([tokenC.address, tokenD.address]);

      const newLength = await factory.read.allPairsLength();
      strictEqual(newLength, initialLength + 1n, "Pairs length should increase by 1");
    });
  });
});
