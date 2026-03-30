import { network } from "hardhat";
import { describe, it, beforeEach } from "node:test";
import { ethers } from "ethers";

/**
 * FluxSwap DEX Gas 消耗报告
 * 测试各核心功能的 gas 消耗量
 */
describe("Gas Report", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [walletClient, walletClient2, walletClient3] = await viem.getWalletClients();
  const getDeadline = () => BigInt(Math.floor(Date.now() / 1000) + 3600);

  let deployer: `0x${string}`;
  let lp: `0x${string}`;
  let trader: `0x${string}`;

  beforeEach(async function () {
    deployer = walletClient.account.address.toLowerCase() as `0x${string}`;
    lp = walletClient2.account.address.toLowerCase() as `0x${string}`;
    trader = walletClient3.account.address.toLowerCase() as `0x${string}`;
  });

  async function getGasUsed(txHash: `0x${string}`): Promise<bigint> {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    return receipt.gasUsed;
  }

  /**
   * 工厂合约 Gas 消耗
   */
  describe("Factory", function () {
    it("factory.createPair gas", async function () {
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;

      const hash = await factory.write.createPair([token0, token1]);
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  factory.createPair: ${gasUsed.toString()} gas`);
    });

    it("factory.setFeeTo gas", async function () {
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const hash = await factory.write.setFeeTo([trader], { account: deployer });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  factory.setFeeTo: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Router ETH 流动性操作 Gas 消耗
   */
  describe("Router - ETH Liquidity", function () {
    it("router.addLiquidityETH gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const wethToken0 = WETH.address < tokenA.address ? WETH.address : tokenA.address;
      const wethToken1 = WETH.address < tokenA.address ? tokenA.address : WETH.address;
      await factory.write.createPair([wethToken0, wethToken1]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });

      const hash = await router.write.addLiquidityETH([
        tokenA.address, 1000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp, value: 1000n * 10n ** 18n });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.addLiquidityETH: ${gasUsed.toString()} gas`);
    });

    it("router.removeLiquidityETH gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const wethToken0 = WETH.address < tokenA.address ? WETH.address : tokenA.address;
      const wethToken1 = WETH.address < tokenA.address ? tokenA.address : WETH.address;
      await factory.write.createPair([wethToken0, wethToken1]);

      const pairAddress = await factory.read.getPair([wethToken0, wethToken1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidityETH([
        tokenA.address, 1000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp, value: 1000n * 10n ** 18n });

      const lpBalance = await pair.read.balanceOf([lp]);
      await pair.write.approve([await router.address, lpBalance], { account: lp });

      const hash = await router.write.removeLiquidityETH([
        tokenA.address, 100n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.removeLiquidityETH: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Router ETH 交易 Gas 消耗
   */
  describe("Router - ETH Swap", function () {
    it("router.swapExactTokensForETH gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const wethToken0 = WETH.address < tokenA.address ? WETH.address : tokenA.address;
      const wethToken1 = WETH.address < tokenA.address ? tokenA.address : WETH.address;
      await factory.write.createPair([wethToken0, wethToken1]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenA.write.mint([trader, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenA.write.approve([await router.address, amount], { account: trader });

      await router.write.addLiquidityETH([
        tokenA.address, 1000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp, value: 1000n * 10n ** 18n });

      const hash = await router.write.swapExactTokensForETH([
        100n * 10n ** 18n, 0n, [tokenA.address, WETH.address], trader, BigInt(Math.floor(Date.now() / 1000) + 3600),
      ], { account: trader });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.swapExactTokensForETH: ${gasUsed.toString()} gas`);
    });

    it("router.swapExactETHForTokens gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const wethToken0 = WETH.address < tokenA.address ? WETH.address : tokenA.address;
      const wethToken1 = WETH.address < tokenA.address ? tokenA.address : WETH.address;
      await factory.write.createPair([wethToken0, wethToken1]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidityETH([
        tokenA.address, 1000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp, value: 1000n * 10n ** 18n });

      const hash = await router.write.swapExactETHForTokens([
        0n, [WETH.address, tokenA.address], trader, BigInt(Math.floor(Date.now() / 1000) + 3600),
      ], { account: trader, value: 10n * 10n ** 18n });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.swapExactETHForTokens: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Router 流动性操作 Gas 消耗
   */
  describe("Router - Liquidity", function () {
    it("router.addLiquidity gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      const hash = await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.addLiquidity: ${gasUsed.toString()} gas`);
    });

    it("router.removeLiquidity gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      const lpBalance = await pair.read.balanceOf([lp]);
      await pair.write.approve([await router.address, lpBalance], { account: lp });

      const hash = await router.write.removeLiquidity([
        tokenA.address, tokenB.address, 100n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.removeLiquidity: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Router Token 交易 Gas 消耗
   */
  describe("Router - Swap", function () {
    it("router.swapExactTokensForTokens gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.mint([trader, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });
      await tokenA.write.approve([await router.address, amount], { account: trader });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      const hash = await router.write.swapExactTokensForTokens([
        100n * 10n ** 18n, 0n, [tokenA.address, tokenB.address], trader, BigInt(Math.floor(Date.now() / 1000) + 3600),
      ], { account: trader });
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  router.swapExactTokensForTokens: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Pair 直接操作 Gas 消耗
   */
  describe("Pair - Direct", function () {
    it("pair.mint gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([pair.address, amount], { account: deployer });
      await tokenB.write.mint([pair.address, amount], { account: deployer });

      const hash = await pair.write.mint([lp]);
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  pair.mint: ${gasUsed.toString()} gas`);
    });

    it("pair.burn gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 1000n * 10n ** 18n, 1000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      const lpBalance = await pair.read.balanceOf([lp]);
      await pair.write.transfer([pair.address, lpBalance], { account: lp });

      const hash = await pair.write.burn([lp]);
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  pair.burn: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * Pair 维护操作 Gas 消耗
   */
  describe("Pair Maintenance", function () {
    it("pair.skim gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      await tokenA.write.mint([deployer, 1000n * 10n ** 18n]);
      await tokenA.write.transfer([pair.address, 100n * 10n ** 18n], { account: deployer });

      const hash = await pair.write.skim([deployer]);
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  pair.skim: ${gasUsed.toString()} gas`);
    });

    it("pair.sync gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      await tokenA.write.mint([deployer, 1000n * 10n ** 18n]);
      await tokenA.write.transfer([pair.address, 100n * 10n ** 18n], { account: deployer });

      const hash = await pair.write.sync();
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  pair.sync: ${gasUsed.toString()} gas`);
    });
  });

  /**
   * 闪电贷 Gas 消耗
   */
  describe("Flash Swap", function () {
    it("pair.flashSwap gas", async function () {
      const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
      const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
      const WETH = await viem.deployContract("MockWETH", []);
      const factory = await viem.deployContract("FluxSwapFactory", [deployer]);
      const router = await viem.deployContract("FluxSwapRouter", [await factory.address, await WETH.address]);

      const token0 = tokenA.address < tokenB.address ? tokenA.address : tokenB.address;
      const token1 = tokenA.address < tokenB.address ? tokenB.address : tokenA.address;
      await factory.write.createPair([token0, token1]);

      const pairAddress = await factory.read.getPair([token0, token1]);
      const pair = await viem.getContractAt("FluxSwapPair", pairAddress);

      const flashReceiver = await viem.deployContract("MockFlashSwapReceiver", []);

      const amount = 1000000n * 10n ** 18n;
      await tokenA.write.mint([lp, amount]);
      await tokenB.write.mint([lp, amount]);
      await tokenA.write.mint([await flashReceiver.address, 200n * 10n ** 18n], { account: deployer });
      await tokenB.write.mint([await flashReceiver.address, 200n * 10n ** 18n], { account: deployer });
      await tokenA.write.approve([await router.address, amount], { account: lp });
      await tokenB.write.approve([await router.address, amount], { account: lp });

      await router.write.addLiquidity([
        tokenA.address, tokenB.address, 10000n * 10n ** 18n, 10000n * 10n ** 18n, 0n, 0n, lp, getDeadline(),
      ], { account: lp });

      const tokenOut = token0;
      const repayAmount = 101n * 10n ** 18n;
      const abiCoder = new ethers.AbiCoder();
      const data = abiCoder.encode(["address", "uint256"], [tokenOut, repayAmount]);

      const hash = await pair.write.swap([100n * 10n ** 18n, 0n, await flashReceiver.address, data as `0x${string}`]);
      const gasUsed = await getGasUsed(hash);
      console.log(`\n  pair.flashSwap: ${gasUsed.toString()} gas`);
    });
  });
});
