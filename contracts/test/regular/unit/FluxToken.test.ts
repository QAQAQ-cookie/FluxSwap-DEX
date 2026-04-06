import { network } from "hardhat";
import { beforeEach, describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

describe("FluxToken", async function () {
  const hardhatNetwork = await network.connect();
  const { viem } = hardhatNetwork;
  const [ownerClient, treasuryClient, userClient, otherClient] = await viem.getWalletClients();

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

  const cap = 1_000_000_000n * 10n ** 18n;
  const initialSupply = 100_000_000n * 10n ** 18n;

  let token: any;

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

  it("should initialize metadata, cap and initial supply correctly", async function () {
    strictEqual(await token.read.name(), "Flux Token");
    strictEqual(await token.read.symbol(), "FLUX");
    strictEqual(await token.read.decimals(), 18);
    strictEqual(await token.read.cap(), cap);
    strictEqual(await token.read.totalSupply(), initialSupply);
    strictEqual(await token.read.balanceOf([treasuryClient.account.address]), initialSupply);
    strictEqual((await token.read.owner()).toLowerCase(), ownerClient.account.address.toLowerCase());
    strictEqual(await token.read.isMinter([ownerClient.account.address]), true);
  });

  it("should expose ERC165 support", async function () {
    strictEqual(await token.read.supportsInterface(["0x01ffc9a7"]), true);
    strictEqual(await token.read.supportsInterface(["0x7965db0b"]), true);
    strictEqual(await token.read.supportsInterface(["0xffffffff"]), false);
  });

  it("should allow owner to grant and revoke minter role", async function () {
    await token.write.setMinter([treasuryClient.account.address, true], {
      account: ownerClient.account.address,
    });
    strictEqual(await token.read.isMinter([treasuryClient.account.address]), true);

    await token.write.setMinter([treasuryClient.account.address, false], {
      account: ownerClient.account.address,
    });
    strictEqual(await token.read.isMinter([treasuryClient.account.address]), false);
  });

  it("should not allow non-owner to manage minters", async function () {
    await expectRevert(
      token.write.setMinter([treasuryClient.account.address, true], {
        account: userClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );
  });

  it("should allow authorized minter to mint within cap", async function () {
    const mintAmount = 50_000_000n * 10n ** 18n;

    await token.write.setMinter([treasuryClient.account.address, true], {
      account: ownerClient.account.address,
    });
    await token.write.mint([userClient.account.address, mintAmount], {
      account: treasuryClient.account.address,
    });

    strictEqual(await token.read.balanceOf([userClient.account.address]), mintAmount);
    strictEqual(await token.read.totalSupply(), initialSupply + mintAmount);
  });

  it("should not allow minting above cap", async function () {
    await expectRevert(
      token.write.mint([userClient.account.address, cap - initialSupply + 1n], {
        account: ownerClient.account.address,
      }),
      "FluxToken: CAP_EXCEEDED"
    );
  });

  it("should support burn and burnFrom", async function () {
    const transferAmount = 1_000n * 10n ** 18n;
    const burnAmount = 400n * 10n ** 18n;
    const burnFromAmount = 300n * 10n ** 18n;

    await token.write.transfer([userClient.account.address, transferAmount], {
      account: treasuryClient.account.address,
    });
    await token.write.burn([burnAmount], { account: userClient.account.address });

    strictEqual(await token.read.balanceOf([userClient.account.address]), transferAmount - burnAmount);

    await token.write.approve([otherClient.account.address, burnFromAmount], {
      account: userClient.account.address,
    });
    await token.write.burnFrom([userClient.account.address, burnFromAmount], {
      account: otherClient.account.address,
    });

    strictEqual(
      await token.read.balanceOf([userClient.account.address]),
      transferAmount - burnAmount - burnFromAmount
    );
    strictEqual(await token.read.totalSupply(), initialSupply - burnAmount - burnFromAmount);
  });

  it("should transfer ownership and let new owner manage minters", async function () {
    await token.write.transferOwnership([otherClient.account.address], {
      account: ownerClient.account.address,
    });

    strictEqual((await token.read.owner()).toLowerCase(), otherClient.account.address.toLowerCase());
    strictEqual(await token.read.isMinter([ownerClient.account.address]), false);
    strictEqual(await token.read.isMinter([otherClient.account.address]), false);

    await token.write.setMinter([treasuryClient.account.address, true], {
      account: otherClient.account.address,
    });

    strictEqual(await token.read.isMinter([treasuryClient.account.address]), true);

    await expectRevert(
      token.write.mint([userClient.account.address, 1n], {
        account: ownerClient.account.address,
      }),
      "FluxToken: FORBIDDEN"
    );
  });

  it("should reject transferring ownership to the current owner", async function () {
    await expectRevert(
      token.write.transferOwnership([ownerClient.account.address], {
        account: ownerClient.account.address,
      }),
      "FluxToken: SAME_OWNER"
    );
  });

  it("should reject zero-address admin operations and mint recipients", async function () {
    await expectRevert(
      token.write.setMinter(["0x0000000000000000000000000000000000000000", true], {
        account: ownerClient.account.address,
      }),
      "FluxToken: ZERO_ADDRESS"
    );

    await expectRevert(
      token.write.transferOwnership(["0x0000000000000000000000000000000000000000"], {
        account: ownerClient.account.address,
      }),
      "FluxToken: ZERO_ADDRESS"
    );

    await token.write.setMinter([treasuryClient.account.address, true], {
      account: ownerClient.account.address,
    });

    await expectRevert(
      token.write.mint(["0x0000000000000000000000000000000000000000", 1n], {
        account: treasuryClient.account.address,
      }),
      "FluxToken: ZERO_ADDRESS"
    );
  });

  it("should validate constructor inputs", async function () {
    await expectRevert(
      viem.deployContract("FluxToken", [
        "",
        "FLUX",
        ownerClient.account.address,
        treasuryClient.account.address,
        initialSupply,
        cap,
      ]),
      "FluxToken: INVALID_NAME"
    );

    await expectRevert(
      viem.deployContract("FluxToken", [
        "Flux Token",
        "",
        ownerClient.account.address,
        treasuryClient.account.address,
        initialSupply,
        cap,
      ]),
      "FluxToken: INVALID_SYMBOL"
    );

    await expectRevert(
      viem.deployContract("FluxToken", [
        "Flux Token",
        "FLUX",
        ownerClient.account.address,
        treasuryClient.account.address,
        cap + 1n,
        cap,
      ]),
      "FluxToken: CAP_EXCEEDED"
    );

    await expectRevert(
      viem.deployContract("FluxToken", [
        "Flux Token",
        "FLUX",
        ownerClient.account.address,
        "0x0000000000000000000000000000000000000000",
        1n,
        cap,
      ]),
      "FluxToken: ZERO_ADDRESS"
    );
  });
});
