import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 权限治理目标：
 * 1. 锁定 FluxToken 的 minter 管理是 owner 治理面，ownership handoff 后旧 owner 失权。
 * 2. 锁定只有持有 MINTER_ROLE 的账户可以执行 mint，普通账户不能越权增发。
 * 3. 锁定 DEFAULT_ADMIN_ROLE 会随 ownership handoff 迁移，当前 owner 仍可通过 AccessControl 直管 MINTER_ROLE。
 * 4. 锁定 minter 可自行 renounce，且 owner 能重新授予，避免角色回收后进入不可恢复状态。
 */
describe("FluxToken", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const [ownerClient, treasuryClient, delegatedMinterClient, nextOwnerClient, recipientClient, otherClient] =
    await viem.getWalletClients();

  const cap = 1_000_000_000n * 10n ** 18n;
  const initialSupply = 100_000_000n * 10n ** 18n;

  let token: any;

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

  beforeEach(async function () {
    token = await viem.deployContract("FluxToken", [
      "Flux Token",
      "FLUX",
      ownerClient.account.address,
      treasuryClient.account.address,
      initialSupply,
      cap,
    ]);
  });

  it("should keep minter management owner-only and rotate that authority after ownership transfer", async function () {
    await expectRevert(
      token.write.setMinter([delegatedMinterClient.account.address, true], {
        account: otherClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    await token.write.setMinter([delegatedMinterClient.account.address, true], {
      account: ownerClient.account.address,
    });
    strictEqual(await token.read.isMinter([delegatedMinterClient.account.address]), true);

    await token.write.transferOwnership([nextOwnerClient.account.address], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      token.write.setMinter([delegatedMinterClient.account.address, false], {
        account: ownerClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    await token.write.setMinter([delegatedMinterClient.account.address, false], {
      account: nextOwnerClient.account.address,
    });

    strictEqual((await token.read.owner()).toLowerCase(), nextOwnerClient.account.address.toLowerCase());
    strictEqual(await token.read.isMinter([ownerClient.account.address]), false);
    strictEqual(await token.read.isMinter([delegatedMinterClient.account.address]), false);
  });

  it("should restrict mint execution to active MINTER_ROLE holders", async function () {
    const delegatedMintAmount = 25n * 10n ** 18n;

    await expectRevert(
      token.write.mint([recipientClient.account.address, 1n], {
        account: delegatedMinterClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    await token.write.setMinter([delegatedMinterClient.account.address, true], {
      account: ownerClient.account.address,
    });
    await token.write.mint([recipientClient.account.address, delegatedMintAmount], {
      account: delegatedMinterClient.account.address,
    });

    await token.write.setMinter([delegatedMinterClient.account.address, false], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      token.write.mint([recipientClient.account.address, 1n], {
        account: delegatedMinterClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), delegatedMintAmount);
    strictEqual(await token.read.totalSupply(), initialSupply + delegatedMintAmount);
  });

  it("should migrate DEFAULT_ADMIN_ROLE with ownership and keep direct AccessControl governance aligned", async function () {
    const minterRole = await token.read.MINTER_ROLE();
    const defaultAdminRole = await token.read.DEFAULT_ADMIN_ROLE();
    const directMintAmount = 10n * 10n ** 18n;

    strictEqual(await token.read.hasRole([defaultAdminRole, ownerClient.account.address]), true);
    strictEqual(await token.read.hasRole([defaultAdminRole, nextOwnerClient.account.address]), false);

    await token.write.grantRole([minterRole, delegatedMinterClient.account.address], {
      account: ownerClient.account.address,
    });
    await token.write.mint([recipientClient.account.address, directMintAmount], {
      account: delegatedMinterClient.account.address,
    });

    await token.write.transferOwnership([nextOwnerClient.account.address], {
      account: ownerClient.account.address,
    });

    strictEqual(await token.read.hasRole([defaultAdminRole, ownerClient.account.address]), false);
    strictEqual(await token.read.hasRole([defaultAdminRole, nextOwnerClient.account.address]), true);

    await expectRevert(
      token.write.grantRole([minterRole, otherClient.account.address], {
        account: ownerClient.account.address,
      }),
      "AccessControlUnauthorizedAccount"
    );

    await token.write.revokeRole([minterRole, delegatedMinterClient.account.address], {
      account: nextOwnerClient.account.address,
    });

    await expectRevert(
      token.write.mint([recipientClient.account.address, 1n], {
        account: delegatedMinterClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), directMintAmount);
  });

  it("should allow a delegated minter to renounce and let the owner restore the role deliberately", async function () {
    const minterRole = await token.read.MINTER_ROLE();
    const restoredMintAmount = 7n * 10n ** 18n;

    await token.write.setMinter([delegatedMinterClient.account.address, true], {
      account: ownerClient.account.address,
    });

    await token.write.renounceRole([minterRole, delegatedMinterClient.account.address], {
      account: delegatedMinterClient.account.address,
    });
    strictEqual(await token.read.isMinter([delegatedMinterClient.account.address]), false);

    await expectRevert(
      token.write.mint([recipientClient.account.address, 1n], {
        account: delegatedMinterClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );

    await token.write.setMinter([delegatedMinterClient.account.address, true], {
      account: ownerClient.account.address,
    });
    await token.write.mint([recipientClient.account.address, restoredMintAmount], {
      account: delegatedMinterClient.account.address,
    });

    strictEqual(await token.read.balanceOf([recipientClient.account.address]), restoredMintAmount);
  });
});
