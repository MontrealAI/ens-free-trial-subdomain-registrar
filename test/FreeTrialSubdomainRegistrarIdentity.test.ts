import { expect } from "chai";
import { ethers } from "hardhat";

const CANNOT_UNWRAP = 1n;
const CANNOT_TRANSFER = 1n << 2n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  async function fixture() {
    const [deployer, user, other] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    await wrapper.waitForDeployment();

    const identity = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [
      await wrapper.getAddress()
    ]);
    await identity.waitForDeployment();

    const parentNode = ethers.namehash("example.eth");
    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest!.timestamp);

    await wrapper.setNameData(parentNode, await wrapper.getAddress(), Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS + 500n), true);
    await wrapper.setCanModify(parentNode, await identity.getAddress(), true);
    await wrapper.setCanModify(parentNode, deployer.address, true);
    await identity.setupDomain(parentNode, true);

    return { deployer, user, other, wrapper, identity: identity as any, parentNode };
  }

  it("registers wrapped subname and mints identity atomically", async function () {
    const { identity, wrapper, parentNode, user } = await fixture();

    await identity.registerIdentity(parentNode, "trialpass8", user.address);

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))]));
    const tokenId = BigInt(node);

    expect(await identity.ownerOf(tokenId)).to.equal(user.address);
    const [wrappedOwner, wrappedFuses] = await wrapper.getData(tokenId);
    expect(wrappedOwner).to.equal(user.address);
    expect(BigInt(wrappedFuses) & CANNOT_UNWRAP).to.equal(CANNOT_UNWRAP);
    expect(BigInt(wrappedFuses) & CANNOT_TRANSFER).to.equal(CANNOT_TRANSFER);
    expect(BigInt(wrappedFuses) & PARENT_CANNOT_CONTROL).to.equal(PARENT_CANNOT_CONTROL);
  });

  it("enforces soulbound transfer and approval restrictions", async function () {
    const { identity, parentNode, user, other } = await fixture();
    await identity.registerIdentity(parentNode, "trialpass8", user.address);

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))]));
    const tokenId = BigInt(node);

    await expect(identity.connect(user).transferFrom(user.address, other.address, tokenId)).to.be.revertedWithCustomError(identity, "Soulbound");
    await expect(identity.connect(user).approve(other.address, tokenId)).to.be.revertedWithCustomError(identity, "Soulbound");
    expect(await identity.locked(tokenId)).to.equal(true);
  });


  it("registerIdentity works for contract owners without ERC721Receiver", async function () {
    const { identity, wrapper, parentNode } = await fixture();

    await identity.registerIdentity(parentNode, "contract8", await wrapper.getAddress());

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("contract8"))]));
    const tokenId = BigInt(node);

    expect(await identity.ownerOf(tokenId)).to.equal(await wrapper.getAddress());
  });

  it("claimIdentity mints to wrapped owner when identity missing", async function () {
    const { identity, wrapper, parentNode, user } = await fixture();
    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("backfill88"))]));

    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest!.timestamp);
    await wrapper.setNameData(node, user.address, Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS), true);

    await identity.connect(user).claimIdentity(node);
    expect(await identity.ownerOf(BigInt(node))).to.equal(user.address);
  });

  it("syncIdentity burns when wrapped ownership desyncs", async function () {
    const { identity, wrapper, parentNode, user, other } = await fixture();
    await identity.registerIdentity(parentNode, "trialpass8", user.address);

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))]));
    const tokenId = BigInt(node);

    const [, fuses, expiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(node, other.address, fuses, expiry, true);

    await identity.syncIdentity(tokenId);
    await expect(identity.ownerOf(tokenId)).to.be.reverted;
  });


  it("tokenURI owner field uses standard 20-byte hex address format", async function () {
    const { identity, parentNode, user } = await fixture();
    await identity.registerIdentity(parentNode, "trialpass8", user.address);

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))]));
    const tokenId = BigInt(node);

    const uri = await identity.tokenURI(tokenId);
    const encodedJson = uri.replace("data:application/json;base64,", "");
    const decodedJson = Buffer.from(encodedJson, "base64").toString("utf8");
    const metadata = JSON.parse(decodedJson);

    const encodedSvg = String(metadata.image).replace("data:image/svg+xml;base64,", "");
    const decodedSvg = Buffer.from(encodedSvg, "base64").toString("utf8");

    expect(decodedSvg).to.include(user.address.toLowerCase());
  });

  it("tokenURI is fully onchain json", async function () {
    const { identity, parentNode, user } = await fixture();
    await identity.registerIdentity(parentNode, "trialpass8", user.address);

    const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))]));
    const tokenId = BigInt(node);

    const uri = await identity.tokenURI(tokenId);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
  });
});
