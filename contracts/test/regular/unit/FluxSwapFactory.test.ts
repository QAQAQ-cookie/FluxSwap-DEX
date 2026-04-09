import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

/*
 * 单元目标：
 * 1. 验证构造参数与 ERC165 支持。
 * 2. 验证交易对创建后会按双向 token 顺序正确登记。
 * 3. 验证 duplicate pair、identical token、zero-address 等非法建池路径会被拒绝。
 * 4. 验证 treasurySetter 的更新、交接，以及不能通过直接授予角色绕过受控移交。
 */
describe("FluxSwapFactory", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const [deployerClient, otherClient, thirdClient] = await viem.getWalletClients();

  let factory: any;
  let tokenA: any;
  let tokenB: any;

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
    factory = await viem.deployContract("FluxSwapFactory", [deployerClient.account.address]);
    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKNA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKNB", 18]);
  });

  it("should validate constructor inputs and expose ERC165 support", async function () {
    await expectRevert(
      viem.deployContract("FluxSwapFactory", ["0x0000000000000000000000000000000000000000"]),
      "FluxSwap: ZERO_ADDRESS"
    );

    strictEqual(await factory.read.supportsInterface(["0x01ffc9a7"]), true);
    strictEqual(await factory.read.supportsInterface(["0x7965db0b"]), true);
    strictEqual(await factory.read.supportsInterface(["0xffffffff"]), false);
  });

  it("should create a pair and register it under both token orders", async function () {
    await factory.write.createPair([tokenA.address, tokenB.address]);

    const pairAB = await factory.read.getPair([tokenA.address, tokenB.address]);
    const pairBA = await factory.read.getPair([tokenB.address, tokenA.address]);

    ok(pairAB !== "0x0000000000000000000000000000000000000000");
    strictEqual(pairAB.toLowerCase(), pairBA.toLowerCase());
    strictEqual(await factory.read.allPairsLength(), 1n);
  });

  it("should reject duplicate, identical, and zero-address pairs", async function () {
    await factory.write.createPair([tokenA.address, tokenB.address]);

    await expectRevert(
      factory.write.createPair([tokenA.address, tokenB.address]),
      "FluxSwap: PAIR_EXISTS"
    );

    await expectRevert(
      factory.write.createPair([tokenA.address, tokenA.address]),
      "FluxSwap: IDENTICAL_ADDRESSES"
    );

    await expectRevert(
      factory.write.createPair(["0x0000000000000000000000000000000000000000", tokenB.address]),
      "FluxSwap: ZERO_ADDRESS"
    );
  });

  it("should let the treasury setter update treasury and hand off the setter role", async function () {
    await factory.write.setTreasury([otherClient.account.address], {
      account: deployerClient.account.address,
    });
    strictEqual((await factory.read.treasury()).toLowerCase(), otherClient.account.address.toLowerCase());

    await factory.write.setTreasurySetter([otherClient.account.address], {
      account: deployerClient.account.address,
    });

    await expectRevert(
      factory.write.setTreasury([thirdClient.account.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: FORBIDDEN"
    );

    await factory.write.setTreasury([thirdClient.account.address], {
      account: otherClient.account.address,
    });

    strictEqual((await factory.read.treasurySetter()).toLowerCase(), otherClient.account.address.toLowerCase());
    strictEqual((await factory.read.treasury()).toLowerCase(), thirdClient.account.address.toLowerCase());
  });

  it("should reject direct treasury setter role grants outside the managed handoff", async function () {
    const treasurySetterRole = await factory.read.TREASURY_SETTER_ROLE();

    await expectRevert(
      factory.write.grantRole([treasurySetterRole, otherClient.account.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );

    await expectRevert(
      factory.write.revokeRole([treasurySetterRole, deployerClient.account.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );

    await expectRevert(
      factory.write.renounceRole([treasurySetterRole, deployerClient.account.address], {
        account: deployerClient.account.address,
      }),
      "FluxSwap: ROLE_MANAGED_BY_SETTER"
    );
  });
});
