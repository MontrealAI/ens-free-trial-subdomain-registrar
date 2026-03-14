import { expect } from "chai";
import { artifacts, ethers } from "hardhat";

const ROOT_NAME = "alpha.agent.agi.eth";
const ROOT_NODE = ethers.namehash(ROOT_NAME);
const CANNOT_UNWRAP = 1n;
const CANNOT_TRANSFER = 1n << 2n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const IS_DOT_ETH = 1n << 17n;
const REQUIRED_CHILD_FUSES = CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const NINETY_DAYS = 90n * 24n * 60n * 60n;

function nodeFor(label: string): string {
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [ROOT_NODE, ethers.keccak256(ethers.toUtf8Bytes(label))]));
}

describe("FreeTrialSubdomainRegistrarIdentity", function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    const registry = await ethers.deployContract("MockENSRegistry");
    const resolver = await ethers.deployContract("MockResolver");
    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [await wrapper.getAddress(), await registry.getAddress()]);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNameData(ROOT_NODE, owner.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), Number(now + THIRTY_DAYS + NINETY_DAYS + 3600n), true);
    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), true);

    return { owner, alice, bob, wrapper: wrapper as any, registry: registry as any, resolver: resolver as any, registrar: registrar as any };
  }

  it("enforces root constants and mainnet node hash", async function () {
    const { registrar } = await deployFixture();
    expect(await registrar.ROOT_NAME()).to.eq(ROOT_NAME);
    expect(await registrar.ROOT_NODE()).to.eq(ROOT_NODE);
    expect(ethers.namehash(ROOT_NAME)).to.eq(ROOT_NODE);
  });

  it("rejects constructor zero-address and no-code dependencies", async function () {
    const { owner } = await deployFixture();
    const f = await ethers.getContractFactory("FreeTrialSubdomainRegistrarIdentity", owner);
    await expect(f.deploy(ethers.ZeroAddress, ethers.ZeroAddress)).to.be.revertedWithCustomError(f, "ZeroAddress");
    await expect(f.deploy(owner.address, owner.address)).to.be.revertedWithCustomError(f, "DependencyHasNoCode");
  });

  it("validates labels and exposes root health", async function () {
    const { registrar } = await deployFixture();
    expect(await registrar.validateLabel("12345678")).to.eq(true);
    expect(await registrar.validateLabel("bad.label")).to.eq(false);
    expect(await registrar.validateLabel("UpperCase8")).to.eq(false);

    const health = await registrar.rootHealth();
    expect(health.rootName).to.eq(ROOT_NAME);
    expect(health.rootNode).to.eq(ROOT_NODE);
    expect(health.parentWrapped).to.eq(true);
    expect(health.parentLocked).to.eq(true);
    expect(health.registrarAuthorised).to.eq(true);
    expect(health.rootUsable).to.eq(true);
  });

  it("supports activation/deactivation and pause only blocks registration", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.pause();
    await expect(registrar.connect(alice).register("12345678")).to.be.revertedWith("Pausable: paused");
    await registrar.unpause();
    await registrar.setRootActive(false);
    await expect(registrar.connect(alice).register("12345678")).to.be.revertedWithCustomError(registrar, "RootInactive");
  });

  it("registers with expected wrapped owner/fuses/expiry and emits Locked", async function () {
    const { registrar, wrapper, alice } = await deployFixture();
    await registrar.setRootActive(true);

    const tx = await registrar.connect(alice).register("12345678");
    await expect(tx).to.emit(registrar, "Locked");

    const tokenId = BigInt(nodeFor("12345678"));
    expect(await registrar.ownerOf(tokenId)).to.eq(alice.address);

    const [wrappedOwner, wrappedFuses, wrappedExpiry] = await wrapper.getData(tokenId);
    expect(wrappedOwner).to.eq(alice.address);
    expect(BigInt(wrappedFuses) & REQUIRED_CHILD_FUSES).to.eq(REQUIRED_CHILD_FUSES);

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const [,, parentExpiry] = await wrapper.getData(ROOT_NODE);
    const effective = BigInt(parentExpiry) - NINETY_DAYS;
    const expectedMax = now + THIRTY_DAYS;
    expect(BigInt(wrappedExpiry)).to.eq(effective < expectedMax ? effective : expectedMax);
  });

  it("enforces soulbound behavior", async function () {
    const { registrar, alice, bob } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));

    await expect(registrar.connect(alice).approve(bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
    await expect(registrar.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWithCustomError(registrar, "Soulbound");
    await expect(registrar.connect(alice).transferFrom(alice.address, bob.address, tokenId)).to.be.revertedWithCustomError(registrar, "Soulbound");
    expect(await registrar.locked(tokenId)).to.eq(true);
  });

  it("claimIdentity is root-scoped and idempotent", async function () {
    const { registrar, alice } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));

    expect(await registrar.connect(alice).claimIdentity.staticCall("12345678")).to.eq(tokenId);
    await registrar.connect(alice).claimIdentity("12345678");
    await expect(registrar.connect(alice).claimIdentity("outside00")).to.be.revertedWithCustomError(registrar, "IdentityNotEligible");
  });

  it("sync burns expired and desynced identities and byLabel returns false when absent", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();
    await registrar.setRootActive(true);

    expect(await registrar.syncIdentityByLabel.staticCall("12345678")).to.eq(false);

    await registrar.connect(alice).register("12345678");
    const tokenId = BigInt(nodeFor("12345678"));
    const [, fuses] = await wrapper.getData(tokenId);
    await wrapper.setNameData(nodeFor("12345678"), alice.address, fuses, 1, true);

    expect(await registrar.syncIdentity.staticCall(tokenId)).to.eq(true);
    await registrar.syncIdentity(tokenId);
    await expect(registrar.ownerOf(tokenId)).to.be.reverted;

    await registrar.connect(alice).register("12345678");
    const [, latestFuses, latestExpiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(nodeFor("12345678"), bob.address, latestFuses, latestExpiry, true);
    expect(await registrar.syncIdentityByLabel.staticCall("12345678")).to.eq(true);
  });

  it("allows re-registration after expiry and refreshes token data", async function () {
    const { registrar, wrapper, alice } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");

    const tokenId = BigInt(nodeFor("12345678"));
    const firstData = await registrar.labelData(tokenId);
    const [, fuses] = await wrapper.getData(tokenId);

    await wrapper.setNameData(nodeFor("12345678"), alice.address, fuses, 1, true);
    await registrar.connect(alice).register("12345678");
    const secondData = await registrar.labelData(tokenId);
    expect(secondData.mintedAt).to.be.gte(firstData.mintedAt);
  });

  it("tokenURI is deterministic and includes required extension fields", async function () {
    const { registrar, alice, registry, resolver } = await deployFixture();
    await registrar.setRootActive(true);
    await registrar.connect(alice).register("12345678");

    const tokenId = BigInt(nodeFor("12345678"));
    await registry.setResolver(nodeFor("12345678"), await resolver.getAddress());

    const uri = await registrar.tokenURI(tokenId);
    const payload = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");

    expect(payload).to.contain('"name":"12345678.alpha.agent.agi.eth"');
    expect(payload).to.contain('"parent_name":"alpha.agent.agi.eth"');
    expect(payload).to.contain('"node"');
    expect(payload).to.contain('"labelhash"');
    expect(payload).to.contain('"token_owner"');
    expect(payload).to.contain('"wrapped_owner"');
    expect(payload).to.contain('"resolver"');
    expect(payload).to.contain('"expiry_unix"');
    expect(payload).to.contain('"minted_at_unix"');
  });

  it("preview returns expected statuses", async function () {
    const { registrar, wrapper, alice, bob } = await deployFixture();

    expect((await registrar.preview("bad.label")).status).to.eq(5n);

    const pAvailable = await registrar.preview("12345678");
    expect(pAvailable.status).to.eq(6n); // root inactive

    await registrar.setRootActive(true);
    expect((await registrar.preview("12345678")).status).to.eq(0n); // available

    await registrar.connect(alice).register("12345678");
    expect((await registrar.preview("12345678")).status).to.eq(1n); // active

    const tokenId = BigInt(nodeFor("12345678"));
    const [, fuses, expiry] = await wrapper.getData(tokenId);
    await wrapper.setNameData(nodeFor("12345678"), bob.address, fuses, expiry, true);
    expect((await registrar.preview("12345678")).status).to.eq(4n); // desynced

    await wrapper.setNameData(nodeFor("12345678"), bob.address, fuses, 1, true);
    expect((await registrar.preview("12345678")).status).to.eq(3n); // expired

    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), false);
    expect((await registrar.preview("22345678")).status).to.eq(7n); // parent unusable

    await wrapper.setCanModify(ROOT_NODE, await registrar.getAddress(), true);
    await wrapper.setNameData(nodeFor("32345678"), bob.address, Number(REQUIRED_CHILD_FUSES), Number((await ethers.provider.getBlock("latest"))!.timestamp + 3600), true);
    expect((await registrar.preview("32345678")).status).to.eq(2n); // claimable
  });

  it("stays below EIP-170 runtime size", async function () {
    const artifact = await artifacts.readArtifact("FreeTrialSubdomainRegistrarIdentity");
    const runtimeSize = (artifact.deployedBytecode.length - 2) / 2;
    expect(runtimeSize).to.be.lessThan(24_576);
  });
});
