import { expect } from "chai";
import { ethers } from "hardhat";

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  const CANNOT_UNWRAP = 1;
  const IS_DOT_ETH = 1 << 17;
  const PARENT_CANNOT_CONTROL = 1 << 16;
  const CANNOT_TRANSFER = 1 << 2;
  const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

  async function fixture() {
    const [, owner, other] = await ethers.getSigners();

    const wrapper: any = await ethers.deployContract("MockNameWrapper");
    await wrapper.waitForDeployment();

    const registrar: any = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [await wrapper.getAddress(), ENS_REGISTRY]);
    await registrar.waitForDeployment();

    const parentNode = ethers.namehash("alpha.agent.agi.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const parentExpiry = now + 365n * 24n * 60n * 60n;

    await wrapper.setNameData(parentNode, owner.address, CANNOT_UNWRAP | IS_DOT_ETH, parentExpiry, true);
    await wrapper.setCanModify(parentNode, owner.address, true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);

    return { registrar, wrapper, owner, other, parentNode, parentExpiry };
  }

  it("registers identity atomically with expected tokenId and soulbound fuse posture", async function () {
    const { registrar, wrapper, owner, parentNode } = await fixture();
    await registrar.connect(owner).setupDomain(parentNode, true);

    const label = "ethereum";
    const node = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes(label))]);
    const tokenId = BigInt(node);

    await expect(registrar.connect(owner).registerIdentity(parentNode, label))
      .to.emit(registrar, "IdentityClaimed")
      .withArgs(node, tokenId, owner.address);

    expect(await registrar.ownerOf(tokenId)).to.equal(owner.address);

    const wrappedData = await wrapper.getData(tokenId);
    expect(wrappedData.owner).to.equal(owner.address);
    expect(wrappedData.fuses & BigInt(CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL)).to.equal(BigInt(CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL));
  });

  it("rejects soulbound transfer and approvals", async function () {
    const { registrar, owner, other, parentNode } = await fixture();
    await registrar.connect(owner).setupDomain(parentNode, true);
    await registrar.connect(owner).registerIdentity(parentNode, "ethereum");

    const node = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("ethereum"))]);
    const tokenId = BigInt(node);

    await expect(registrar.connect(owner).transferFrom(owner.address, other.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
    await expect(registrar.connect(owner).approve(other.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
  });

  it("burns on sync when wrapper owner desyncs", async function () {
    const { registrar, wrapper, owner, other, parentNode } = await fixture();
    await registrar.connect(owner).setupDomain(parentNode, true);
    await registrar.connect(owner).registerIdentity(parentNode, "ethereum");

    const node = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("ethereum"))]);
    const tokenId = BigInt(node);

    const wrapped = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, other.address, wrapped.fuses, wrapped.expiry, true);

    await expect(registrar.connect(other).syncIdentity(tokenId))
      .to.emit(registrar, "IdentitySynced")
      .withArgs(node, tokenId, true, "desynced");

    await expect(registrar.ownerOf(tokenId)).to.be.revertedWithCustomError(registrar, "IdentityNotFound");
  });

  it("claimIdentity mints for wrapped owner and returns onchain metadata URI", async function () {
    const { registrar, wrapper, owner, parentNode, parentExpiry } = await fixture();
    const node = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("12345678"))]);
    await wrapper.setNameData(node, owner.address, CANNOT_UNWRAP, parentExpiry, true);

    const tokenId = BigInt(node);
    await registrar.connect(owner).claimIdentity(node);

    const uri = await registrar.tokenURI(tokenId);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
  });
});
