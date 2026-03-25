import { network } from "hardhat";
import { describe, it, beforeEach } from "node:test";

describe("FluxSwap DEX", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();

  let factory: any;
  let router: any;
  let tokenA: any;
  let tokenB: any;
  let WETH: any;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    const deployer = walletClient.account.address;

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
    WETH = await viem.deployContract("MockWETH", []);

    factory = await viem.deployContract("FluxSwapFactory", [deployer]);
    router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);
  });

  describe("Factory", async function () {
    it("should set feeToSetter correctly", async function () {
      const deployer = walletClient.account.address.toLowerCase();
      const feeToSetter = (await factory.read.feeToSetter()).toLowerCase();
      strictEqual(feeToSetter, deployer);
    });

    it("should create a new pair", async function () {
      const token0Address = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1Address = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;

      await factory.write.createPair([tokenA.address, tokenB.address]);

      const pairAddress = await factory.read.getPair([token0Address, token1Address]);
      notStrictEqual(pairAddress, ZERO_ADDRESS);
    });

    it("should not allow duplicate pair creation", async function () {
      await factory.write.createPair([tokenA.address, tokenB.address]);

      let error: any;
      try {
        await factory.write.createPair([tokenA.address, tokenB.address]);
      } catch (e) {
        error = e;
      }
      if (!error) throw new Error("Should have reverted");
    });

    it("should not allow same address for both tokens", async function () {
      let error: any;
      try {
        await factory.write.createPair([tokenA.address, tokenA.address]);
      } catch (e) {
        error = e;
      }
      if (!error) throw new Error("Should have reverted");
    });

    it("should not allow zero address", async function () {
      let error: any;
      try {
        await factory.write.createPair([ZERO_ADDRESS, tokenA.address]);
      } catch (e) {
        error = e;
      }
      if (!error) throw new Error("Should have reverted");
    });

    it("should track all pairs", async function () {
      const tokenC = await viem.deployContract("MockERC20", ["Token C", "TKNC", 18]);
      const tokenD = await viem.deployContract("MockERC20", ["Token D", "TKND", 18]);

      await factory.write.createPair([tokenA.address, tokenB.address]);
      await factory.write.createPair([tokenC.address, tokenD.address]);

      const pairsLength = await factory.read.allPairsLength();
      strictEqual(pairsLength, 2n);
    });

    it("should set feeTo", async function () {
      const newFeeTo = walletClient.account.address.toLowerCase();
      await factory.write.setFeeTo([newFeeTo]);
      const feeTo = (await factory.read.feeTo()).toLowerCase();
      strictEqual(feeTo, newFeeTo);
    });

    it("should set feeToSetter", async function () {
      const newFeeToSetter = walletClient.account.address;
      await factory.write.setFeeToSetter([newFeeToSetter]);
      const feeToSetter = (await factory.read.feeToSetter()).toLowerCase();
      strictEqual(feeToSetter, newFeeToSetter.toLowerCase());
    });
  });

  describe("Router - Add Liquidity", async function () {
    beforeEach(async function () {
      const user = walletClient.account.address;
      const amount = 1000000n * 10n ** 18n;

      await tokenA.write.mint([user, amount]);
      await tokenB.write.mint([user, amount]);

      await tokenA.write.approve([await router.address, amount]);
      await tokenB.write.approve([await router.address, amount]);
    });

    it("should add initial liquidity", async function () {
      const user = walletClient.account.address;
      const amountA = 100n * 10n ** 18n;
      const amountB = 100n * 10n ** 18n;

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        amountA,
        amountB,
        0n,
        0n,
        user,
      ]);

      const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const [reserve0, reserve1] = await pair.read.getReserves();

      strictEqual(reserve0, amountA);
      strictEqual(reserve1, amountB);
    });

    it("should add more liquidity", async function () {
      const user = walletClient.account.address;

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        user,
      ]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        50n * 10n ** 18n,
        50n * 10n ** 18n,
        0n,
        0n,
        user,
      ]);

      const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const [reserve0, reserve1] = await pair.read.getReserves();

      strictEqual(reserve0, 150n * 10n ** 18n);
      strictEqual(reserve1, 150n * 10n ** 18n);
    });
  });

  describe("Router - Remove Liquidity", async function () {
    let pairAddress: any;
    let lpTokenAmount: any;

    beforeEach(async function () {
      const user = walletClient.account.address;
      const amount = 1000000n * 10n ** 18n;

      await tokenA.write.mint([user, amount]);
      await tokenB.write.mint([user, amount]);
      await tokenA.write.approve([await router.address, amount]);
      await tokenB.write.approve([await router.address, amount]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        100n * 10n ** 18n,
        100n * 10n ** 18n,
        0n,
        0n,
        user,
      ]);

      const token0Address = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1Address = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      pairAddress = await factory.read.getPair([token0Address, token1Address]);

      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      lpTokenAmount = await pair.read.balanceOf([user]);
    });

    it("should remove liquidity", async function () {
      const user = walletClient.account.address;
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      await pair.write.approve([await router.address, lpTokenAmount]);

      const balanceABefore = await tokenA.read.balanceOf([user]);
      const balanceBBefore = await tokenB.read.balanceOf([user]);

      await router.write.removeLiquidity([
        tokenA.address,
        tokenB.address,
        lpTokenAmount,
        0n,
        0n,
        user,
      ]);

      const balanceAAfter = await tokenA.read.balanceOf([user]);
      const balanceBAfter = await tokenB.read.balanceOf([user]);

      const totalSupply = await pair.read.totalSupply();
      if (totalSupply >= lpTokenAmount) throw new Error("Liquidity should be removed");

      if (balanceAAfter <= balanceABefore) throw new Error("Should receive tokenA");
      if (balanceBAfter <= balanceBBefore) throw new Error("Should receive tokenB");
    });
  });

  describe("Router - Swap", async function () {
    beforeEach(async function () {
      const user = walletClient.account.address;
      const amount = 1000000n * 10n ** 18n;

      await tokenA.write.mint([user, amount]);
      await tokenB.write.mint([user, amount]);
      await tokenA.write.approve([await router.address, amount]);
      await tokenB.write.approve([await router.address, amount]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        10000n * 10n ** 18n,
        10000n * 10n ** 18n,
        0n,
        0n,
        user,
      ]);
    });

    it("should swap tokens (exact input)", async function () {
      const user = walletClient.account.address;
      const swapAmount = 100n * 10n ** 18n;
      const userBalanceBefore = await tokenB.read.balanceOf([user]);

      await router.write.swapExactTokensForTokens([
        swapAmount,
        0n,
        [tokenA.address, tokenB.address],
        user,
      ]);

      const userBalanceAfter = await tokenB.read.balanceOf([user]);
      const balanceDiff = userBalanceAfter - userBalanceBefore;
      if (balanceDiff <= 0n) throw new Error("Swap should have increased balance");
    });
  });

  describe("Router - WETH Swap", async function () {
    beforeEach(async function () {
      const user = walletClient.account.address;
      const tokenAmount = 200n * 10n ** 18n;
      const ethAmount = 10n * 10n ** 18n;

      await tokenA.write.mint([user, tokenAmount]);
      await tokenA.write.approve([await router.address, tokenAmount]);

      await factory.write.createPair([WETH.address, tokenA.address]);

      await router.write.addLiquidityETH([tokenA.address, 100n * 10n ** 18n, 0n, 0n, user], { value: ethAmount });
    });

    it("should swap tokens for ETH", async function () {
      const user = walletClient.account.address;
      const swapAmount = 10n * 10n ** 18n;
      const userETHBalanceBefore = await publicClient.getBalance({ address: user });

      await router.write.swapExactTokensForETH([
        swapAmount,
        0n,
        [tokenA.address, WETH.address],
        user,
      ]);

      const userETHBalanceAfter = await publicClient.getBalance({ address: user });
      const balanceDiff = userETHBalanceAfter - userETHBalanceBefore;
      if (balanceDiff <= 0n) throw new Error("Swap should have increased ETH balance");
    });

    it("should swap ETH for tokens", async function () {
      const user = walletClient.account.address;
      const ethAmount = 1n * 10n ** 18n;
      const userTokenBalanceBefore = await tokenA.read.balanceOf([user]);

      await router.write.swapExactETHForTokens([0n, [WETH.address, tokenA.address], user], { value: ethAmount });

      const userTokenBalanceAfter = await tokenA.read.balanceOf([user]);
      const balanceDiff = userTokenBalanceAfter - userTokenBalanceBefore;
      if (balanceDiff <= 0n) throw new Error("Swap should have increased token balance");
    });
  });

  describe("Pair - Core Functions", async function () {
    let pairAddress: any;

    beforeEach(async function () {
      const user = walletClient.account.address;
      const token0Address = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1Address = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;

      await factory.write.createPair([tokenA.address, tokenB.address]);
      pairAddress = await factory.read.getPair([token0Address, token1Address]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([user, amount]);
      await tokenB.write.mint([user, amount]);
      await tokenA.write.approve([await router.address, amount]);
      await tokenB.write.approve([await router.address, amount]);

      await router.write.addLiquidity([
        tokenA.address,
        tokenB.address,
        10000n * 10n ** 18n,
        10000n * 10n ** 18n,
        0n,
        0n,
        user,
      ]);
    });

    it("should return correct reserves", async function () {
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const [reserve0, reserve1] = await pair.read.getReserves();

      if (reserve0 <= 0n) throw new Error("Reserve0 should be greater than 0");
      if (reserve1 <= 0n) throw new Error("Reserve1 should be greater than 0");
    });

    it("should have liquidity after adding", async function () {
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const totalSupply = await pair.read.totalSupply();

      if (totalSupply <= 0n) throw new Error("Total supply should be greater than 0");
    });

    it("should track price0 cumulative last", async function () {
      const user = walletClient.account.address;
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        user,
      ]);

      const price0CumulativeLast = await pair.read.price0CumulativeLast();
      if (price0CumulativeLast === 0n) throw new Error("Price0 should be tracked");
    });

    it("should track price1 cumulative last", async function () {
      const user = walletClient.account.address;
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n,
        0n,
        [tokenA.address, tokenB.address],
        user,
      ]);

      const price1CumulativeLast = await pair.read.price1CumulativeLast();
      if (price1CumulativeLast === 0n) throw new Error("Price1 should be tracked");
    });

    it("should sync reserves", async function () {
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const [reserve0Before, reserve1Before] = await pair.read.getReserves();

      await pair.write.sync();

      const [reserve0After, reserve1After] = await pair.read.getReserves();
      strictEqual(reserve0Before, reserve0After);
      strictEqual(reserve1Before, reserve1After);
    });

    it("should get kLast", async function () {
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const kLast = await pair.read.kLast();
      if (kLast !== 0n) throw new Error("kLast should be 0 initially");
    });

    it("should get token0 and token1", async function () {
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);
      const token0 = await pair.read.token0();
      const token1 = await pair.read.token1();

      const expectedToken0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const expectedToken1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;

      strictEqual(token0.toLowerCase(), expectedToken0.toLowerCase());
      strictEqual(token1.toLowerCase(), expectedToken1.toLowerCase());
    });
  });
});

function strictEqual(actual: any, expected: any) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected} but got ${actual}`);
  }
}

function notStrictEqual(actual: any, expected: any) {
  if (actual === expected) {
    throw new Error(`Expected not ${expected}`);
  }
}
