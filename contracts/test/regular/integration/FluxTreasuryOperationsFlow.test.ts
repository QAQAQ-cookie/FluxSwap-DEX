import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { strictEqual } from "node:assert";

describe("FluxTreasuryOperationsFlow", async function () {
  const hardhatNetwork = await network.connect();
  const { viem, networkHelpers } = hardhatNetwork;
  const publicClient = await viem.getPublicClient();
  const [multisigClient, guardianClient, operatorClient, recipientClient, spenderClient] =
    await viem.getWalletClients();

  const timelockDelay = 3600n;

  let treasury: any;
  let token: any;
  let burnToken: any;

  async function scheduleAndExecute(operationId: `0x${string}`, execute: () => Promise<unknown>) {
    await treasury.write.scheduleOperation([operationId, timelockDelay], {
      account: multisigClient.account.address,
    });
    await networkHelpers.time.increase(Number(timelockDelay));
    await execute();
  }

  beforeEach(async function () {
    treasury = await viem.deployContract("FluxSwapTreasury", [
      multisigClient.account.address,
      guardianClient.account.address,
      operatorClient.account.address,
      timelockDelay,
    ]);

    token = await viem.deployContract("MockERC20", ["Treasury Token", "TT", 18]);
    burnToken = await viem.deployContract("FluxToken", [
      "Burnable Flux",
      "BFLUX",
      multisigClient.account.address,
      treasury.address,
      500n * 10n ** 18n,
      1_000n * 10n ** 18n,
    ]);

    await token.write.mint([treasury.address, 500n * 10n ** 18n]);
    await multisigClient.sendTransaction({
      to: treasury.address,
      value: 3n * 10n ** 18n,
    });
  });

  it("should execute native allocations, spender-governed pulls and burns, and token/native emergency withdrawals end to end", async function () {
    const allowRecipientOp = await treasury.read.hashSetAllowedRecipient([recipientClient.account.address, true]);
    await scheduleAndExecute(allowRecipientOp, () =>
      treasury.write.executeSetAllowedRecipient([recipientClient.account.address, true, allowRecipientOp])
    );

    const nativeCap = 2n * 10n ** 18n;
    const nativeCapOp = await treasury.read.hashSetDailySpendCap([
      "0x0000000000000000000000000000000000000000",
      nativeCap,
    ]);
    await scheduleAndExecute(nativeCapOp, () =>
      treasury.write.executeSetDailySpendCap([
        "0x0000000000000000000000000000000000000000",
        nativeCap,
        nativeCapOp,
      ])
    );

    const recipientEthBeforeAllocate = await publicClient.getBalance({ address: recipientClient.account.address });
    await treasury.write.allocateETH([recipientClient.account.address, 1n * 10n ** 18n], {
      account: operatorClient.account.address,
    });

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBeforeAllocate,
      1n * 10n ** 18n
    );

    const pullApprovalAmount = 125n * 10n ** 18n;
    const approvePullOp = await treasury.read.hashApproveSpender([
      token.address,
      spenderClient.account.address,
      pullApprovalAmount,
    ]);
    await scheduleAndExecute(approvePullOp, () =>
      treasury.write.executeApproveSpender([token.address, spenderClient.account.address, pullApprovalAmount, approvePullOp])
    );

    await treasury.write.pullApprovedToken([token.address, pullApprovalAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(await token.read.balanceOf([spenderClient.account.address]), pullApprovalAmount);
    strictEqual(await treasury.read.approvedSpendRemaining([token.address, spenderClient.account.address]), 0n);

    const burnAmount = 50n * 10n ** 18n;
    const approveBurnOp = await treasury.read.hashApproveSpender([
      burnToken.address,
      spenderClient.account.address,
      burnAmount,
    ]);
    await scheduleAndExecute(approveBurnOp, () =>
      treasury.write.executeApproveSpender([burnToken.address, spenderClient.account.address, burnAmount, approveBurnOp])
    );

    const burnTotalSupplyBefore = await burnToken.read.totalSupply();
    const burnTreasuryBalanceBefore = await burnToken.read.balanceOf([treasury.address]);

    await treasury.write.burnApprovedToken([burnToken.address, burnAmount], {
      account: spenderClient.account.address,
    });

    strictEqual(burnTotalSupplyBefore - (await burnToken.read.totalSupply()), burnAmount);
    strictEqual(burnTreasuryBalanceBefore - (await burnToken.read.balanceOf([treasury.address])), burnAmount);

    const emergencyTokenAmount = 100n * 10n ** 18n;
    const emergencyTokenOp = await treasury.read.hashEmergencyWithdraw([
      token.address,
      recipientClient.account.address,
      emergencyTokenAmount,
    ]);
    const recipientTokenBefore = await token.read.balanceOf([recipientClient.account.address]);
    await scheduleAndExecute(emergencyTokenOp, () =>
      treasury.write.executeEmergencyWithdraw([
        token.address,
        recipientClient.account.address,
        emergencyTokenAmount,
        emergencyTokenOp,
      ])
    );

    strictEqual(
      (await token.read.balanceOf([recipientClient.account.address])) - recipientTokenBefore,
      emergencyTokenAmount
    );

    const emergencyEthAmount = 5n * 10n ** 17n;
    const emergencyEthOp = await treasury.read.hashEmergencyWithdrawETH([
      recipientClient.account.address,
      emergencyEthAmount,
    ]);
    const recipientEthBeforeEmergency = await publicClient.getBalance({ address: recipientClient.account.address });
    await scheduleAndExecute(emergencyEthOp, () =>
      treasury.write.executeEmergencyWithdrawETH([recipientClient.account.address, emergencyEthAmount, emergencyEthOp])
    );

    strictEqual(
      (await publicClient.getBalance({ address: recipientClient.account.address })) - recipientEthBeforeEmergency,
      emergencyEthAmount
    );
    strictEqual(await publicClient.getBalance({ address: treasury.address }), 15n * 10n ** 17n);
  });
});
