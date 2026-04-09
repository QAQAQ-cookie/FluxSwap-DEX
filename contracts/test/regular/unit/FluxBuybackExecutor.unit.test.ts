import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数与 ERC165 支持。
 * 2. 验证 buyback 会把回购结果打回 treasury。
 * 3. 验证 buyback 参数校验，以及 recipient 必须受 treasury 约束。
 * 4. 验证 executor pause 与 treasury pause 都会阻断回购执行。
 * 5. 验证 treasury 与 default recipient 联动更新。
 * 6. 验证 operator 轮换、禁止直接角色突变、stray token recover 与 ownership 迁移后的重叠 operator 权限清理。
 */
describe("FluxBuybackExecutor Unit", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, lpClient, recipientClient, otherClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;
  const initialSupply = 10_000_000n * 10n ** 18n;
  const cap = 100_000_000n * 10n ** 18n;
  const maxUint256 = (1n << 256n) - 1n;

  let treasury: any;
  let fluxToken: any;
  let revenueToken: any;
  let WETH: any;
  let factory: any;
  let router: any;
  let executor: any;

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

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], { account: multisigClient.account.address });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  async function approveTreasurySpender(tokenAddress: `0x${string}`, spender: `0x${string}`, amount: bigint) {
    const approveOp = await treasury.read.hashApproveSpender([tokenAddress, spender, amount]);
    await scheduleAndExecute(approveOp, () =>
      treasury.write.executeApproveSpender([tokenAddress, spender, amount, approveOp])
    );
  }

  async function getDeadline() {
    return (await publicClient.getBlock()).timestamp + 3600n;
  }

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

    executor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      operatorClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);

    await fluxToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n], {
      account: multisigClient.account.address,
    });
    await revenueToken.write.mint([lpClient.account.address, 200_000n * 10n ** 18n]);
    await revenueToken.write.mint([treasury.address, 10_000n * 10n ** 18n]);

    await fluxToken.write.approve([router.address, maxUint256], { account: lpClient.account.address });
    await revenueToken.write.approve([router.address, maxUint256], { account: lpClient.account.address });

    await router.write.addLiquidity(
      [
        fluxToken.address,
        revenueToken.address,
        100_000n * 10n ** 18n,
        100_000n * 10n ** 18n,
        0n,
        0n,
        lpClient.account.address,
        await getDeadline(),
      ],
      { account: lpClient.account.address }
    );
  });

  it("should validate constructor inputs and expose ERC165 support", async function () {
    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        "0x0000000000000000000000000000000000000000",
        operatorClient.account.address,
        router.address,
        fluxToken.address,
        treasury.address,
      ]),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        "0x0000000000000000000000000000000000000000",
        router.address,
        fluxToken.address,
        treasury.address,
      ]),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        "0x0000000000000000000000000000000000000000",
        fluxToken.address,
        treasury.address,
      ]),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        router.address,
        "0x0000000000000000000000000000000000000000",
        treasury.address,
      ]),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        router.address,
        fluxToken.address,
        "0x0000000000000000000000000000000000000000",
      ]),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      viem.deployContract("FluxBuybackExecutor", [
        multisigClient.account.address,
        treasury.address,
        operatorClient.account.address,
        router.address,
        fluxToken.address,
        recipientClient.account.address,
      ]),
      "FluxBuybackExecutor: INVALID_RECIPIENT"
    );

    strictEqual(await executor.read.supportsInterface(["0x01ffc9a7"]), true);
    strictEqual(await executor.read.supportsInterface(["0x7965db0b"]), true);
    strictEqual(await executor.read.supportsInterface(["0xffffffff"]), false);
  });

  it("should buy back FLUX into treasury", async function () {
    const amountIn = 1_000n * 10n ** 18n;
    const expectedOut = (await router.read.getAmountsOut([amountIn, [revenueToken.address, fluxToken.address]]))[1];

    await approveTreasurySpender(revenueToken.address, executor.address, amountIn);
    await executor.write.executeBuyback(
      [revenueToken.address, amountIn, expectedOut, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
      { account: operatorClient.account.address }
    );

    ok(await fluxToken.read.balanceOf([treasury.address]) > initialSupply);
  });

  it("should validate buyback parameters and reject recipients outside treasury", async function () {
    const amountIn = 100n * 10n ** 18n;

    await expectRevert(
      executor.write.executeBuyback(
        ["0x0000000000000000000000000000000000000000", amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: ZERO_ADDRESS"
    );

    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, 0n, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: ZERO_AMOUNT"
    );

    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: INVALID_PATH"
    );

    await approveTreasurySpender(revenueToken.address, executor.address, amountIn);

    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [fluxToken.address, revenueToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: INVALID_PATH"
    );

    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], recipientClient.account.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "InvalidRecipient"
    );
  });

  it("should block execution while executor or treasury is paused", async function () {
    const amountIn = 100n * 10n ** 18n;
    await approveTreasurySpender(revenueToken.address, executor.address, amountIn);

    await executor.write.pause({ account: multisigClient.account.address });
    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: PAUSED"
    );

    await executor.write.unpause({ account: multisigClient.account.address });
    await treasury.write.pause({ account: guardianClient.account.address });

    await expectRevert(
      executor.write.executeBuyback(
        [revenueToken.address, amountIn, 0n, [revenueToken.address, fluxToken.address], treasury.address, await getDeadline()],
        { account: operatorClient.account.address }
      ),
      "FluxBuybackExecutor: TREASURY_PAUSED"
    );
  });

  it("should update treasury and default recipient together while enforcing recipient policy", async function () {
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    await executor.write.setTreasury([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await executor.read.treasury()).toLowerCase(), alternateTreasury.address.toLowerCase());
    strictEqual((await executor.read.defaultRecipient()).toLowerCase(), alternateTreasury.address.toLowerCase());

    await executor.write.setDefaultRecipient([alternateTreasury.address], {
      account: multisigClient.account.address,
    });

    await expectRevert(
      executor.write.setDefaultRecipient([treasury.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: INVALID_RECIPIENT"
    );
  });

  it("should rotate the operator and block direct role mutations", async function () {
    const operatorRole = await executor.read.OPERATOR_ROLE();

    await executor.write.setOperator([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual((await executor.read.operator()).toLowerCase(), otherClient.account.address.toLowerCase());

    await expectRevert(
      executor.write.grantRole([operatorRole, recipientClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      executor.write.revokeRole([operatorRole, otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      executor.write.renounceRole([operatorRole, otherClient.account.address], {
        account: otherClient.account.address,
      }),
      "FluxBuybackExecutor: ROLE_MANAGED_BY_SET_OPERATOR"
    );

    await expectRevert(
      executor.write.setOperator([otherClient.account.address], {
        account: multisigClient.account.address,
      }),
      "FluxBuybackExecutor: SAME_OPERATOR"
    );
  });

  it("should recover stray tokens held by the executor", async function () {
    await revenueToken.write.mint([executor.address, 25n * 10n ** 18n]);

    await executor.write.recoverToken([revenueToken.address, recipientClient.account.address, 25n * 10n ** 18n], {
      account: multisigClient.account.address,
    });

    strictEqual(await revenueToken.read.balanceOf([executor.address]), 0n);
    strictEqual(await revenueToken.read.balanceOf([recipientClient.account.address]), 25n * 10n ** 18n);
  });

  it("should revoke overlapping operator authority on ownership transfer", async function () {
    const alternateTreasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);
    const overlappingExecutor = await viem.deployContract("FluxBuybackExecutor", [
      multisigClient.account.address,
      treasury.address,
      multisigClient.account.address,
      router.address,
      fluxToken.address,
      treasury.address,
    ]);
    const operatorRole = await overlappingExecutor.read.OPERATOR_ROLE();

    await overlappingExecutor.write.transferOwnership([otherClient.account.address], {
      account: multisigClient.account.address,
    });

    strictEqual(await overlappingExecutor.read.operator(), "0x0000000000000000000000000000000000000000");
    strictEqual(await overlappingExecutor.read.hasRole([operatorRole, multisigClient.account.address]), false);

    await overlappingExecutor.write.setTreasury([alternateTreasury.address], {
      account: otherClient.account.address,
    });

    strictEqual(
      (await overlappingExecutor.read.treasury()).toLowerCase(),
      alternateTreasury.address.toLowerCase()
    );
  });
});
