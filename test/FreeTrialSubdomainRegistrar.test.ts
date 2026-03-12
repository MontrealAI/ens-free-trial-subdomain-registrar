import { expect } from "chai";
import { network } from "hardhat";

const CANNOT_UNWRAP = 1n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const IS_DOT_ETH = 1n << 17n;
const CAN_EXTEND_EXPIRY = 1n << 18n;

describe("FreeTrialSubdomainRegistrar", function () {
  async function deployFixture() {
    const { ethers } = await network.connect();
    const [parentOwner, registrant, other] = await ethers.getSigners();

    const wrapper = await ethers.deployContract("MockNameWrapper");
    await wrapper.waitForDeployment();

    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [await wrapper.getAddress()]);
    await registrar.waitForDeployment();

    const resolver = await ethers.deployContract("MockResolver");
    await resolver.waitForDeployment();

    const parentNode = ethers.namehash("example.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const parentExpiry = now + 180n * 24n * 60n * 60n;

    await wrapper.setNode(parentNode, await parentOwner.getAddress(), Number(CANNOT_UNWRAP | IS_DOT_ETH), parentExpiry);
    await wrapper.connect(parentOwner).setApprovalForAll(await registrar.getAddress(), true);
    await registrar.connect(parentOwner).setupDomain(parentNode, true);

    return { ethers, parentOwner, registrant, other, wrapper, registrar, resolver, parentNode, now, parentExpiry };
  }

  it("registers a valid trial and caps to 30 days when parent has longer", async function () {
    const { ethers, registrar, registrant, parentNode, wrapper } = await deployFixture();

    const beforeTs = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await expect(
      registrar.connect(registrant).register(parentNode, "trialpass8", await registrant.getAddress(), ethers.ZeroAddress, 0, [])
    ).to.not.be.reverted;

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, childFuses, childExpiry] = await wrapper.getData(node);
    const afterTs = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const lowerBound = beforeTs + 30n * 24n * 60n * 60n;
    const upperBound = afterTs + 30n * 24n * 60n * 60n;

    expect(BigInt(childExpiry)).to.be.gte(lowerBound);
    expect(BigInt(childExpiry)).to.be.lte(upperBound);
    expect((BigInt(childFuses) & PARENT_CANNOT_CONTROL) === PARENT_CANNOT_CONTROL).to.equal(true);
    expect((BigInt(childFuses) & CAN_EXTEND_EXPIRY) === CAN_EXTEND_EXPIRY).to.equal(false);
  });

  it("rejects short labels", async function () {
    const { registrar, registrant, parentNode, ethers } = await deployFixture();

    await expect(
      registrar.connect(registrant).register(parentNode, "short7", await registrant.getAddress(), ethers.ZeroAddress, 0, [])
    )
      .to.be.revertedWithCustomError(registrar, "LabelTooShort")
      .withArgs(6);
  });

  it("rejects non-alphanumeric labels", async function () {
    const { registrar, registrant, parentNode, ethers } = await deployFixture();

    await expect(
      registrar.connect(registrant).register(parentNode, "trial-pass", await registrant.getAddress(), ethers.ZeroAddress, 0, [])
    ).to.be.revertedWithCustomError(registrar, "InvalidLabelCharacter");
  });

  it("caps expiry to parent effective expiry when less than 30 days remain", async function () {
    const { ethers, wrapper, registrar, parentOwner, registrant } = await deployFixture();

    const parentNode = ethers.namehash("soon.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const effectiveIn10Days = now + 10n * 24n * 60n * 60n;
    const parentWithGrace = effectiveIn10Days + 90n * 24n * 60n * 60n;

    await wrapper.setNode(parentNode, await parentOwner.getAddress(), Number(CANNOT_UNWRAP | IS_DOT_ETH), parentWithGrace);
    await registrar.connect(parentOwner).setupDomain(parentNode, true);

    await registrar.connect(registrant).register(parentNode, "trialpass9", await registrant.getAddress(), ethers.ZeroAddress, 0, []);

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass9"))])
    );
    const [, , childExpiry] = await wrapper.getData(node);

    expect(BigInt(childExpiry)).to.be.lte(effectiveIn10Days);
    expect(BigInt(childExpiry)).to.be.gte(effectiveIn10Days - 5n);
  });

  it("does not grant CAN_EXTEND_EXPIRY so owner cannot self-renew", async function () {
    const { ethers, wrapper, registrar, registrant, parentNode, other } = await deployFixture();

    await registrar.connect(registrant).register(parentNode, "trialpass0", await registrant.getAddress(), ethers.ZeroAddress, 0, []);

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass0"))])
    );
    const [, childFuses] = await wrapper.getData(node);
    expect((BigInt(childFuses) & CAN_EXTEND_EXPIRY) === CAN_EXTEND_EXPIRY).to.equal(false);

    await expect(registrar.connect(other).register(parentNode, "trialpass0", await other.getAddress(), ethers.ZeroAddress, 0, [])).to
      .be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("rejects ETH transfers", async function () {
    const { ethers, registrar, registrant } = await deployFixture();

    await expect(
      registrant.sendTransaction({
        to: await registrar.getAddress(),
        value: ethers.parseEther("0.01")
      })
    ).to.be.revertedWithCustomError(registrar, "EtherNotAccepted");
  });

  it("reverts when parent is not wrapped", async function () {
    const { ethers, registrar, parentOwner } = await deployFixture();

    await expect(registrar.connect(parentOwner).setupDomain(ethers.namehash("missing.eth"), true)).to.be.revertedWithCustomError(
      registrar,
      "ParentNotWrapped"
    );
  });

  it("reverts setup when parent is not locked", async function () {
    const { ethers, wrapper, registrar, parentOwner } = await deployFixture();

    const parentNode = ethers.namehash("unlocked.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNode(parentNode, await parentOwner.getAddress(), Number(IS_DOT_ETH), now + 200n * 24n * 60n * 60n);
    await wrapper.connect(parentOwner).setApprovalForAll(await registrar.getAddress(), true);

    await expect(registrar.connect(parentOwner).setupDomain(parentNode, true)).to.be.revertedWithCustomError(
      registrar,
      "ParentNotLocked"
    );
  });

  it("reverts setup when registrar is not approved", async function () {
    const { ethers, wrapper, registrar, parentOwner } = await deployFixture();

    const parentNode = ethers.namehash("noapproval.eth");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNode(parentNode, await parentOwner.getAddress(), Number(CANNOT_UNWRAP | IS_DOT_ETH), now + 200n * 24n * 60n * 60n);

    await expect(registrar.connect(parentOwner).setupDomain(parentNode, true)).to.be.revertedWithCustomError(
      registrar,
      "RegistrarNotAuthorised"
    );
  });
});
