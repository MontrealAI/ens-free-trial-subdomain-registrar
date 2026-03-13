import { expect } from "chai";
import { ethers } from "hardhat";

const CANNOT_UNWRAP = 1n;
const IS_DOT_ETH = 1n << 17n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const PARENT_NODE = ethers.namehash("alpha.agent.agi.eth");

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    const registry = await ethers.deployContract("MockENSRegistry");
    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [
      await wrapper.getAddress(),
      await registry.getAddress(),
      PARENT_NODE,
      "alpha.agent.agi.eth"
    ]);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(PARENT_NODE, owner.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), Number(now + THIRTY_DAYS + 90n * 24n * 60n * 60n + 1000n), true);
    await wrapper.setCanModify(PARENT_NODE, await registrar.getAddress(), true);
    await registrar.setRootActive(true);

    return { owner, alice, bob, wrapper: wrapper as any, registry: registry as any, registrar: registrar as any };
  }

  it("validates labels", async function () {
    const { registrar } = await deployFixture();
    expect(await registrar.validateLabel("12345678")).to.equal(true);
    expect(await registrar.validateLabel("short")).to.equal(false);
    expect(await registrar.validateLabel("bad.label")).to.equal(false);
  });

  it("registers and emits EIP-5192 Locked", async function () {
    const { registrar, alice } = await deployFixture();
    const tx = await registrar.connect(alice).register("12345678");
    await expect(tx).to.emit(registrar, "Locked");

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    expect(await registrar.ownerOf(BigInt(node))).to.equal(alice.address);
  });

  it("restricts claiming to configured root labels", async function () {
    const { registrar, wrapper, alice } = await deployFixture();
    const outsiderNode = ethers.namehash("random.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(outsiderNode, alice.address, Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS), true);

    await expect(registrar.connect(alice).claimIdentity("randometh")).to.be.revertedWithCustomError(registrar, "IdentityNotEligible");
  });

  it("supports setup activate/deactivate", async function () {
    const { registrar } = await deployFixture();
    await registrar.setRootActive(false);
    expect(await registrar.rootActive()).to.equal(false);
    await registrar.setRootActive(true);
    expect(await registrar.rootActive()).to.equal(true);
  });

  it("pause blocks registration only", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.pause();
    await expect(registrar.connect(alice).register("12345678")).to.be.revertedWith("Pausable: paused");
    await registrar.unpause();
    await registrar.connect(alice).register("12345678");
  });

  it("reverts transfer and approval for soulbound token", async function () {
    const { registrar, alice, bob } = await deployFixture();
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))])));
    await expect(registrar.connect(alice).approve(bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
    await expect(registrar.connect(alice).transferFrom(alice.address, bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
  });

  it("burns on sync when expired", async function () {
    const { registrar, wrapper, alice } = await deployFixture();
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))])));
    await wrapper.setNameData(ethers.toBeHex(tokenId, 32), alice.address, Number(CANNOT_UNWRAP), 1, true);
    await registrar.syncIdentity(tokenId);
    await expect(registrar.ownerOf(tokenId)).to.be.reverted;
  });

  it("burns on sync when wrapped owner desyncs", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();
    await registrar.connect(alice).register("12345678");
    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    const tokenId = BigInt(node);
    const [, fuses, expiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, bob.address, fuses, expiry, true);
    await registrar.syncIdentity(tokenId);
    await expect(registrar.ownerOf(tokenId)).to.be.reverted;
  });

  it("supports re-registration after expiry", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();
    await registrar.connect(alice).register("12345678");
    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]));
    const tokenId = BigInt(node);
    const [, fuses] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, alice.address, fuses, 1, true);
    await registrar.connect(bob).register("12345678");
    expect(await registrar.ownerOf(tokenId)).to.equal(bob.address);
  });

  it("tokenURI remains deterministic with expected fields", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [PARENT_NODE, ethers.keccak256(ethers.toUtf8Bytes("12345678"))])));
    const uri = await registrar.tokenURI(tokenId);
    const payload = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
    expect(payload).to.contain('"name":"12345678.alpha.agent.agi.eth"');
    expect(payload).to.contain('"parent_node"');
    expect(payload).to.contain('"ui_hint"');
  });

  it("preview reconstructs full name", async function () {
    const { registrar } = await deployFixture();
    const data = await registrar.preview("12345678");
    expect(data[0]).to.equal("12345678.alpha.agent.agi.eth");
  });
});
