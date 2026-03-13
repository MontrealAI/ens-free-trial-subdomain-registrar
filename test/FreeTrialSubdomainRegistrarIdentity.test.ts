import { expect } from "chai";
import { ethers } from "hardhat";

const CANNOT_UNWRAP = 1n;
const IS_DOT_ETH = 1n << 17n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const NINETY_DAYS = 90n * 24n * 60n * 60n;
const ROOT_NAME = "alpha.agent.agi.eth";
const ROOT_NODE = ethers.namehash(ROOT_NAME);

function nodeFor(label: string): string {
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [ROOT_NODE, ethers.keccak256(ethers.toUtf8Bytes(label))]));
}

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    const registry = await ethers.deployContract("MockENSRegistry");
    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [await wrapper.getAddress(), await registry.getAddress()]);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(ROOT_NODE, owner.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), Number(now + THIRTY_DAYS + NINETY_DAYS + 1000n), true);
    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), true);

    return { owner, alice, bob, wrapper: wrapper as any, registry: registry as any, registrar: registrar as any };
  }

  it("has fixed root constants and rootInfo", async function () {
    const { registrar } = await deployFixture();
    expect(await registrar.ROOT_NAME()).to.eq(ROOT_NAME);
    expect(await registrar.ROOT_NODE()).to.eq(ROOT_NODE);
    const info = await registrar.rootInfo();
    expect(info[0]).to.eq(ROOT_NAME);
    expect(info[1]).to.eq(ROOT_NODE);
  });

  it("validates labels", async function () {
    const { registrar } = await deployFixture();
    expect(await registrar.validateLabel("12345678")).to.equal(true);
    expect(await registrar.validateLabel("short")).to.equal(false);
    expect(await registrar.validateLabel("bad.label")).to.equal(false);
    expect(await registrar.validateLabel("Badlabel8")).to.equal(false);
  });

  it("supports activation/deactivation and pause", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.setRootActive(true);
    expect(await registrar.rootActive()).to.equal(true);
    await registrar.pause();
    await expect(registrar.connect(alice).register("12345678")).to.be.revertedWith("Pausable: paused");
    await registrar.unpause();
    await registrar.setRootActive(false);
    expect(await registrar.rootActive()).to.equal(false);
  });

  it("registers, verifies wrapped ownership, mints and emits Locked", async function () {
    const { registrar, alice, wrapper } = await deployFixture();
    await registrar.setRootActive(true);
    await expect(registrar.connect(alice).register("12345678")).to.emit(registrar, "Locked");
    const tokenId = BigInt(nodeFor("12345678"));
    expect(await registrar.ownerOf(tokenId)).to.eq(alice.address);
    const [wrappedOwner] = await wrapper.getData(tokenId);
    expect(wrappedOwner).to.eq(alice.address);
  });

  it("reverts approvals and transfers (soulbound)", async function () {
    const { registrar, alice, bob } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));
    await expect(registrar.connect(alice).approve(bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
    await expect(registrar.connect(alice).transferFrom(alice.address, bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
  });

  it("claimIdentity is root-scoped and idempotent when aligned", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));
    await expect(registrar.connect(alice).claimIdentity("12345678")).to.not.be.reverted;
    expect(await registrar.ownerOf(tokenId)).to.eq(alice.address);
    await expect(registrar.connect(alice).claimIdentity("outsideeth")).to.be.revertedWithCustomError(registrar, "IdentityNotEligible");
  });

  it("sync burns expired and desynced identities", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const node = nodeFor("12345678");
    const tokenId = BigInt(node);

    let [, fuses] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, alice.address, fuses, 1, true);
    await expect(registrar.syncIdentity(tokenId)).to.emit(registrar, "IdentitySynced");
    await expect(registrar.ownerOf(tokenId)).to.be.reverted;

    await registrar.connect(alice).register("12345678");
    [, fuses] = await wrapper.getData(tokenId);
    const [, , expiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, bob.address, fuses, expiry, true);
    await registrar.syncIdentityByLabel("12345678");
    await expect(registrar.ownerOf(tokenId)).to.be.reverted;

    await expect(registrar.syncIdentityByLabel("bad.label")).to.be.revertedWithCustomError(registrar, "InvalidLabel");
  });

  it("preview reports parent-unusable when parent lock/auth checks fail", async function () {
    const { registrar, wrapper, owner } = await deployFixture();
    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), false);
    const unauthorised = await registrar.preview("12345678");
    expect(unauthorised.status).to.equal(6n);

    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), true);
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(ROOT_NODE, owner.address, Number(IS_DOT_ETH), Number(now + THIRTY_DAYS + NINETY_DAYS + 1000n), true);
    const unlocked = await registrar.preview("12345678");
    expect(unlocked.status).to.equal(6n);
  });

  it("supports re-registration after expiry and refreshes token data", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const node = nodeFor("12345678");
    const tokenId = BigInt(node);
    const first = await registrar.labelData(tokenId);

    const [, fuses] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, alice.address, fuses, 1, true);
    await registrar.connect(alice).register("12345678");
    const second = await registrar.labelData(tokenId);
    expect(second[2]).to.be.greaterThan(first[2]);

    await wrapper.setNameData(node, alice.address, fuses, 1, true);
    await registrar.connect(bob).register("12345678");
    expect(await registrar.ownerOf(tokenId)).to.eq(bob.address);
  });

  it("tokenURI is deterministic and reconstructs name", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));
    const uri = await registrar.tokenURI(tokenId);
    const payload = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
    expect(payload).to.contain('"name":"12345678.alpha.agent.agi.eth"');
    expect(payload).to.contain('"parent_name":"alpha.agent.agi.eth"');
    expect(payload).to.contain('"status"');
  });

  it("preview is non-reverting for valid/invalid/unavailable states", async function () {
    const { registrar, alice } = await deployFixture();
    const invalid = await registrar.preview("bad.label");
    expect(invalid.validLabel).to.equal(false);

    await registrar.setRootActive(true);
    const pre = await registrar.preview("12345678");
    expect(pre.availableOut).to.equal(true);

    await registrar.connect(alice).register("12345678");
    const taken = await registrar.preview("12345678");
    expect(taken.availableOut).to.equal(false);
  });
});
