import { expect } from "chai";
import { network } from "hardhat";

const CANNOT_UNWRAP = 1n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const IS_DOT_ETH = 1n << 17n;
const PARENT_GRACE_PERIOD = 90n * 24n * 60n * 60n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;

const { ethers } = await network.connect();

describe("FreeTrialSubdomainRegistrar", function () {
  async function fixture() {
    const [deployer, user, other] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    await wrapper.waitForDeployment();

    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [await wrapper.getAddress()]);
    await registrar.waitForDeployment();

    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const parentNode = ethers.namehash("example.eth");

    const parentExpiry = now + 365n * 24n * 60n * 60n + PARENT_GRACE_PERIOD;
    await wrapper.setNodeData(parentNode, deployer.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), parentExpiry, true);
    await wrapper.setCanModifyName(parentNode, deployer.address, true);
    await wrapper.setCanModifyName(parentNode, await registrar.getAddress(), true);

    return { deployer, user, other, wrapper, registrar, parentNode, now };
  }

  it("registers a valid label for 30 days when parent has enough validity", async function () {
    const { registrar, parentNode, user, now, wrapper } = await fixture();
    const tx = await registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, []);
    await tx.wait();

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, fuses, expiry] = await wrapper.getData(node);
    expect(BigInt(expiry)).to.equal(now + THIRTY_DAYS);
    expect(BigInt(fuses)).to.equal(PARENT_CANNOT_CONTROL);
  });

  it("caps child expiry when parent effective expiry is sooner", async function () {
    const { registrar, parentNode, deployer, wrapper } = await fixture();
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const parentEffectiveExpiry = now + 10n * 24n * 60n * 60n;
    await wrapper.setNodeData(
      parentNode,
      deployer.address,
      Number(CANNOT_UNWRAP | IS_DOT_ETH),
      parentEffectiveExpiry + PARENT_GRACE_PERIOD,
      true
    );

    await registrar.register(parentNode, "trialpass9", deployer.address, ethers.ZeroAddress, 0, []);

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass9"))])
    );
    const [, , expiry] = await wrapper.getData(node);
    expect(BigInt(expiry)).to.equal(parentEffectiveExpiry);
  });

  it("does not grant CAN_EXTEND_EXPIRY and prevents self-extension path", async function () {
    const { registrar, parentNode, user, wrapper } = await fixture();
    await registrar.register(parentNode, "trialpassa", user.address, ethers.ZeroAddress, 1, []);

    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpassa"))])
    );

    const [, fuses] = await wrapper.getData(node);
    expect((BigInt(fuses) & (1n << 18n)) === 0n).to.equal(true);
  });

  it("rejects short labels", async function () {
    const { registrar, parentNode, user } = await fixture();
    await expect(registrar.register(parentNode, "short7", user.address, ethers.ZeroAddress, 0, [])).to.be.revertedWithCustomError(
      registrar,
      "LabelTooShort"
    );
  });

  it("rejects non-alphanumeric labels", async function () {
    const { registrar, parentNode, user } = await fixture();
    await expect(registrar.register(parentNode, "bad-label", user.address, ethers.ZeroAddress, 0, [])).to.be.revertedWithCustomError(
      registrar,
      "InvalidLabelCharacter"
    );
  });

  it("rejects ETH sent directly", async function () {
    const { registrar, user } = await fixture();
    await expect(user.sendTransaction({ to: await registrar.getAddress(), value: 1n })).to.be.revertedWithCustomError(
      registrar,
      "EtherNotAccepted"
    );
  });

  it("rejects unavailable names", async function () {
    const { registrar, parentNode, user, wrapper, deployer } = await fixture();
    const node = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpassb"))])
    );
    const future = BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + 7n * 24n * 60n * 60n;
    await wrapper.setNodeData(node, deployer.address, Number(PARENT_CANNOT_CONTROL), future, true);

    await expect(registrar.register(parentNode, "trialpassb", user.address, ethers.ZeroAddress, 0, [])).to.be.revertedWithCustomError(
      registrar,
      "Unavailable"
    );
  });

  it("fails setup when parent is not wrapped", async function () {
    const { registrar } = await fixture();
    const notWrapped = ethers.namehash("missing.eth");
    await expect(registrar.setupDomain(notWrapped, true)).to.be.revertedWithCustomError(registrar, "Unauthorised");
  });

  it("fails setup when parent is not locked", async function () {
    const { registrar, parentNode, wrapper, deployer } = await fixture();
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNodeData(parentNode, deployer.address, Number(IS_DOT_ETH), now + THIRTY_DAYS + PARENT_GRACE_PERIOD, true);

    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "ParentNotLocked");
  });

  it("fails setup when registrar has not been approved on the wrapper", async function () {
    const { registrar, parentNode, wrapper } = await fixture();
    await wrapper.setCanModifyName(parentNode, await registrar.getAddress(), false);
    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "RegistrarNotAuthorised");
  });

  it("fails when .eth parent effective expiry is in grace", async function () {
    const { registrar, parentNode, wrapper, deployer, user } = await fixture();
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    await wrapper.setNodeData(parentNode, deployer.address, Number(CANNOT_UNWRAP | IS_DOT_ETH), now + PARENT_GRACE_PERIOD - 1n, true);

    await expect(registrar.register(parentNode, "trialpassc", user.address, ethers.ZeroAddress, 0, [])).to.be.revertedWithCustomError(
      registrar,
      "ParentExpired"
    );
  });
});
