import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 池治理目标：
 * 1. 锁定 FluxSwapFactory 的 treasurySetter 是唯一可以更新 treasury 和移交治理权的角色。
 * 2. 锁定 setTreasurySetter 会同步迁移 DEFAULT_ADMIN_ROLE 与 TREASURY_SETTER_ROLE，并剥离旧 setter 权限。
 * 3. 锁定禁止通过直接 grant / revoke / renounce TREASURY_SETTER_ROLE 绕过受控移交。
 * 4. 锁定存量 pair 也会跟随 factory 的最新 treasury 指针，把协议费打到新的 treasury。
 */
describe("FluxSwapFactory", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [setterClient, nextSetterClient, treasuryClient, nextTreasuryClient, lpClient, traderClient, otherClient] =
    await viem.getWalletClients();

  const maxUint256 = (1n << 256n) - 1n;
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  let factory: any;
  let router: any;
  let WETH: any;
  let tokenA: any;
  let tokenB: any;
  let pair: any;

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

  // 复用真实 Router + Pair 路径，验证治理切换会影响 live pair 的协议费去向。
  async function executeSwap(amountIn: bigint) {
    await router.write.swapExactTokensForTokens(
      [amountIn, 0n, [tokenA.address, tokenB.address], traderClient.account.address, await getDeadline()],
      { account: traderClient.account.address }
    );
  }

  beforeEach(async function () {
    factory = await viem.deployContract("FluxSwapFactory", [setterClient.account.address]);
    WETH = await viem.deployContract("MockWETH", []);
    router = await viem.deployContract("FluxSwapRouter", [factory.address, WETH.address]);

    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);

    await factory.write.createPair([tokenA.address, tokenB.address]);
    const pairAddress = await factory.read.getPair([tokenA.address, tokenB.address]);
    pair = await viem.getContractAt("FluxSwapPair", pairAddress);

    const lpFunding = 1_000_000n * 10n ** 18n;
    const traderFunding = 100_000n * 10n ** 18n;
    const liquidityAmount = 100_000n * 10n ** 18n;

    await tokenA.write.mint([lpClient.account.address, lpFunding]);
    await tokenB.write.mint([lpClient.account.address, lpFunding]);
    await tokenA.write.mint([traderClient.account.address, traderFunding]);
    await tokenB.write.mint([traderClient.account.address, traderFunding]);

    await tokenA.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await tokenA.write.approve([router.address, maxUint256], { account: traderClient.account.address });
    await tokenB.write.approve([router.address, maxUint256], { account: traderClient.account.address });

    await router.write.addLiquidity(
      [
        tokenA.address,
        tokenB.address,
        liquidityAmount,
        liquidityAmount,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );
  });

  it("should restrict treasury updates to the current treasury setter and rotate setter authority with managed handoff", async function () {
    await factory.write.setTreasury([treasuryClient.account.address], {
      account: setterClient.account.address,
    });
    strictEqual((await factory.read.treasury()).toLowerCase(), treasuryClient.account.address.toLowerCase());

    await expectRevert(
      factory.write.setTreasury([nextTreasuryClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxSwap: FORBIDDEN"
    );

    await factory.write.setTreasurySetter([nextSetterClient.account.address], {
      account: setterClient.account.address,
    });

    strictEqual((await factory.read.treasurySetter()).toLowerCase(), nextSetterClient.account.address.toLowerCase());

    await expectRevert(
      factory.write.setTreasury([nextTreasuryClient.account.address], {
        account: setterClient.account.address,
      }),
      "FluxSwap: FORBIDDEN"
    );

    await factory.write.setTreasury([nextTreasuryClient.account.address], {
      account: nextSetterClient.account.address,
    });
    strictEqual((await factory.read.treasury()).toLowerCase(), nextTreasuryClient.account.address.toLowerCase());
  });

  it("should migrate admin roles during setter handoff and reject invalid setter changes", async function () {
    const treasurySetterRole = await factory.read.TREASURY_SETTER_ROLE();
    const defaultAdminRole = await factory.read.DEFAULT_ADMIN_ROLE();

    strictEqual(await factory.read.hasRole([treasurySetterRole, setterClient.account.address]), true);
    strictEqual(await factory.read.hasRole([defaultAdminRole, setterClient.account.address]), true);

    await expectRevert(
      factory.write.setTreasurySetter([zeroAddress], {
        account: setterClient.account.address,
      }),
      "FluxSwap: ZERO_ADDRESS"
    );

    await expectRevert(
      factory.write.setTreasurySetter([setterClient.account.address], {
        account: setterClient.account.address,
      }),
      "FluxSwap: SAME_TREASURY_SETTER"
    );

    await factory.write.setTreasurySetter([nextSetterClient.account.address], {
      account: setterClient.account.address,
    });

    strictEqual(await factory.read.hasRole([treasurySetterRole, setterClient.account.address]), false);
    strictEqual(await factory.read.hasRole([defaultAdminRole, setterClient.account.address]), false);
    strictEqual(await factory.read.hasRole([treasurySetterRole, nextSetterClient.account.address]), true);
    strictEqual(await factory.read.hasRole([defaultAdminRole, nextSetterClient.account.address]), true);
  });

  it("should reject direct treasury setter role mutation outside setTreasurySetter", async function () {
    const treasurySetterRole = await factory.read.TREASURY_SETTER_ROLE();

    await expectRevert(
      factory.write.grantRole([treasurySetterRole, nextSetterClient.account.address], {
        account: setterClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );

    await expectRevert(
      factory.write.revokeRole([treasurySetterRole, setterClient.account.address], {
        account: setterClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );

    await expectRevert(
      factory.write.renounceRole([treasurySetterRole, setterClient.account.address], {
        account: setterClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );
  });

  it("should route protocol fees from an existing pair to the latest treasury after governance updates", async function () {
    const swapAmount = 1_000n * 10n ** 18n;
    const protocolFee = (swapAmount * 5n) / 10000n;

    await factory.write.setTreasury([treasuryClient.account.address], {
      account: setterClient.account.address,
    });

    await executeSwap(swapAmount);
    strictEqual(await tokenA.read.balanceOf([treasuryClient.account.address]), protocolFee);
    strictEqual(await tokenA.read.balanceOf([nextTreasuryClient.account.address]), 0n);

    await factory.write.setTreasurySetter([nextSetterClient.account.address], {
      account: setterClient.account.address,
    });
    await factory.write.setTreasury([nextTreasuryClient.account.address], {
      account: nextSetterClient.account.address,
    });

    const oldTreasuryBalanceBefore = await tokenA.read.balanceOf([treasuryClient.account.address]);
    const newTreasuryBalanceBefore = await tokenA.read.balanceOf([nextTreasuryClient.account.address]);

    await executeSwap(swapAmount);

    strictEqual(await tokenA.read.balanceOf([treasuryClient.account.address]), oldTreasuryBalanceBefore);
    strictEqual(await tokenA.read.balanceOf([nextTreasuryClient.account.address]), newTreasuryBalanceBefore + protocolFee);

    strictEqual((await factory.read.treasury()).toLowerCase(), nextTreasuryClient.account.address.toLowerCase());
    strictEqual((await factory.read.treasurySetter()).toLowerCase(), nextSetterClient.account.address.toLowerCase());
    strictEqual((await pair.read.factory()).toLowerCase(), factory.address.toLowerCase());
  });
});
