import { expect } from "chai";
import { ethers } from "hardhat";

const CANNOT_UNWRAP = 1n;
const CANNOT_TRANSFER = 1n << 2n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const IS_DOT_ETH = 1n << 17n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const PARENT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";
const PARENT_NAME = "alpha.agent.agi.eth";

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  async function fixture() {
    const [owner, user, other] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    const registry = await ethers.deployContract("MockENSRegistry");
    const identity = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [
      await wrapper.getAddress(),
      await registry.getAddress(),
      PARENT_NODE,
      PARENT_NAME
    ]);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(PARENT_NODE, owner.address, Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS + 5000n), true);
    await wrapper.setCanModify(PARENT_NODE, await identity.getAddress(), true);
    await identity.activateRoot();

    return { owner, user, other, wrapper: wrapper as any, registry: registry as any, identity: identity as any };
  }

  it("validates labels", async function () {
    const { identity } = await fixture();
    expect(await identity.validateLabel("12345678")).to.equal(true);
    expect(await identity.validateLabel("bad.label")).to.equal(false);
    expect(await identity.validateLabel("ABCDEF12")).to.equal(false);
  });

  it("registers + mints + emits Locked", async function () {
    const { identity, wrapper, user } = await fixture();
    await expect(identity.connect(user).register("12345678")).to.emit(identity, "Locked");

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    const tokenId = BigInt(node);
    expect(await identity.ownerOf(tokenId)).to.equal(user.address);

    const [wrappedOwner, fuses] = await wrapper.getData(tokenId);
    expect(wrappedOwner).to.equal(user.address);
    expect((BigInt(fuses) & CANNOT_UNWRAP) !== 0n).to.equal(true);
    expect((BigInt(fuses) & CANNOT_TRANSFER) !== 0n).to.equal(true);
    expect((BigInt(fuses) & PARENT_CANNOT_CONTROL) !== 0n).to.equal(true);
  });

  it("claim is root-scoped by label", async function () {
    const { identity, wrapper, user } = await fixture();
    const externalNode = ethers.namehash("outside.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(externalNode, user.address, 0, Number(now + THIRTY_DAYS), true);

    await expect(identity.connect(user).claimIdentity("outside00")).to.be.revertedWithCustomError(identity, "IdentityNotEligible");
  });

  it("pause/unpause blocks register only", async function () {
    const { identity, user } = await fixture();
    await identity.pause();
    await expect(identity.connect(user).register("12345678")).to.be.revertedWith("Pausable: paused");
    await identity.unpause();
    await identity.connect(user).register("12345678");
  });

  it("activate/deactivate root", async function () {
    const { identity, user } = await fixture();
    await identity.deactivateRoot();
    await expect(identity.connect(user).register("12345678")).to.be.revertedWithCustomError(identity, "RootNotActive");
    await identity.activateRoot();
    await identity.connect(user).register("12345678");
  });

  it("is soulbound", async function () {
    const { identity, user, other } = await fixture();
    await identity.connect(user).register("12345678");
    const tokenId = BigInt(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))])));
    await expect(identity.connect(user).transferFrom(user.address, other.address, tokenId)).to.be.revertedWithCustomError(identity, "Soulbound");
    await expect(identity.connect(user).approve(other.address, tokenId)).to.be.revertedWithCustomError(identity, "Soulbound");
  });

  it("burns on expiry sync and supports re-registration", async function () {
    const { identity, wrapper, user } = await fixture();
    await identity.connect(user).register("12345678");
    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    const tokenId = BigInt(node);
    const [owner, fuses] = await wrapper.getData(tokenId);
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(node, owner, fuses, Number(now - 1n), true);
    await identity.syncIdentity(tokenId);
    await expect(identity.ownerOf(tokenId)).to.be.reverted;

    await wrapper.setNameData(node, ethers.ZeroAddress, Number(fuses), Number(now - 1n), true);
    await identity.connect(user).register("12345678");
    expect(await identity.ownerOf(tokenId)).to.equal(user.address);
  });

  it("burns on desync owner change", async function () {
    const { identity, wrapper, user, other } = await fixture();
    await identity.connect(user).register("12345678");
    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    const tokenId = BigInt(node);
    const [, fuses, expiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, other.address, fuses, expiry, true);
    await identity.syncIdentityByLabel("12345678");
    await expect(identity.ownerOf(tokenId)).to.be.reverted;
  });

  it("tokenURI deterministic fields and full-name reconstruction", async function () {
    const { identity, user } = await fixture();
    await identity.connect(user).register("12345678");
    const tokenId = BigInt(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))])));
    const uri = await identity.tokenURI(tokenId);
    const json = JSON.parse(Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8"));
    expect(json.name).to.equal("12345678.alpha.agent.agi.eth");
    expect(json.extension.parent_node).to.equal(PARENT_NODE);
    expect(json.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
  });

  it("mainnet constant namehash matches", async function () {
    const { identity } = await fixture();
    const actual = await identity.namehash(PARENT_NAME);
    expect(actual).to.equal(PARENT_NODE);
  });

  it("parent .eth expiry subtracts grace period", async function () {
    const [owner] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    const registry = await ethers.deployContract("MockENSRegistry");
    const identity = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [
      await wrapper.getAddress(),
      await registry.getAddress(),
      PARENT_NODE,
      PARENT_NAME
    ]);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(PARENT_NODE, owner.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), Number(now + THIRTY_DAYS + 90n * 24n * 60n * 60n + 10n), true);
    await wrapper.setCanModify(PARENT_NODE, await identity.getAddress(), true);
    await identity.activateRoot();
    await expect(identity.register("12345678")).to.not.be.reverted;
  });
});
