import { expect } from "chai";
import { network } from "hardhat";

const CANNOT_UNWRAP = 1n;
const CANNOT_TRANSFER = 4n;
const PARENT_CANNOT_CONTROL = 1n << 16n;
const IS_DOT_ETH = 1n << 17n;
const CAN_EXTEND_EXPIRY = 1n << 18n;
const THIRTY_DAYS = 30n * 24n * 60n * 60n;
const NINETY_DAYS = 90n * 24n * 60n * 60n;

const { ethers } = await network.connect();

describe("FreeTrialSubdomainRegistrar", function () {
  async function deployFixture() {
    const [deployer, user] = await ethers.getSigners();
    const wrapper = await ethers.deployContract("MockNameWrapper");
    await wrapper.waitForDeployment();

    const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [await wrapper.getAddress()]);
    await registrar.waitForDeployment();

    const resolver = await ethers.deployContract("MockResolver");
    await resolver.waitForDeployment();

    const parentNode = ethers.namehash("example.eth");
    const latest = await ethers.provider.getBlock("latest");
    const now = BigInt(latest!.timestamp);

    return { deployer, user, wrapper, registrar, resolver, parentNode, now };
  }

  async function activateParent(
    wrapper: any,
    registrar: any,
    parentNode: string,
    parentExpiry: bigint,
    parentFuses: bigint = CANNOT_UNWRAP
  ) {
    await wrapper.setNameData(parentNode, await wrapper.getAddress(), Number(parentFuses), Number(parentExpiry), true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);
    await wrapper.setCanModify(parentNode, (await ethers.getSigners())[0].address, true);
    await registrar.setupDomain(parentNode, true);
  }

  async function latestTimestamp(): Promise<bigint> {
    const latest = await ethers.provider.getBlock("latest");
    return BigInt(latest!.timestamp);
  }

  it("registers a valid free trial and enforces capped expiry", async function () {
    const { registrar, wrapper, parentNode, user, now } = await deployFixture();

    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, []);
    const registeredAt = await latestTimestamp();

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, fuses, expiry] = await wrapper.getData(childNode);
    expect(BigInt(fuses) & CANNOT_UNWRAP).to.equal(CANNOT_UNWRAP);
    expect(BigInt(fuses) & PARENT_CANNOT_CONTROL).to.equal(PARENT_CANNOT_CONTROL);
    expect(BigInt(expiry)).to.be.gte(registeredAt + THIRTY_DAYS - 2n);
    expect(BigInt(expiry)).to.be.lte(registeredAt + THIRTY_DAYS + 2n);
  });


  it("rejects registrations when parent is not active", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await wrapper.setNameData(parentNode, await wrapper.getAddress(), Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS + 1n), true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, [])
    ).to.be.revertedWithCustomError(registrar, "ParentNameNotActive");
  });

  it("allows owner-controlled fuses without requiring CANNOT_UNWRAP in the user input", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, Number(CANNOT_TRANSFER), []);

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, fuses] = await wrapper.getData(childNode);
    expect(BigInt(fuses) & CANNOT_TRANSFER).to.equal(CANNOT_TRANSFER);
    expect(BigInt(fuses) & CANNOT_UNWRAP).to.equal(CANNOT_UNWRAP);
  });

  it("sets resolver records when calldata contains the child node", async function () {
    const { registrar, wrapper, resolver, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const payload = resolver.interface.encodeFunctionData("setAddr", [childNode, user.address]);
    await registrar.register(parentNode, "trialpass8", user.address, await resolver.getAddress(), 0, [payload]);

    expect(await resolver.lastNode()).to.equal(childNode);
    expect(await resolver.lastAddress()).to.equal(user.address);
  });

  it("rejects resolver records with mismatched namehash payload", async function () {
    const { registrar, wrapper, resolver, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    const wrongNode = ethers.namehash("wrong.eth");
    const payload = resolver.interface.encodeFunctionData("setAddr", [wrongNode, user.address]);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, await resolver.getAddress(), 0, [payload])
    ).to.be.revertedWithCustomError(registrar, "RecordNamehashMismatch");
  });

  it("rejects records when resolver is zero address", async function () {
    const { registrar, wrapper, parentNode, now, user, resolver } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );
    const payload = resolver.interface.encodeFunctionData("setAddr", [childNode, user.address]);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, [payload])
    ).to.be.revertedWithCustomError(registrar, "ResolverRequired");
  });

  it("rejects short resolver record payloads", async function () {
    const { registrar, wrapper, parentNode, now, user, resolver } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    const payload = resolver.interface.encodeFunctionData("setAddr", [ethers.namehash("wrong.eth"), user.address]).slice(0, 20);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, await resolver.getAddress(), 0, [payload])
    ).to.be.revertedWithCustomError(registrar, "InvalidRecordPayload");
  });
  it("rejects short labels", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await expect(
      registrar.register(parentNode, "short7", user.address, ethers.ZeroAddress, 0, [])
    ).to.be.revertedWithCustomError(registrar, "LabelTooShort");
  });

  it("rejects non-alphanumeric labels", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await expect(
      registrar.register(parentNode, "invalid-8", user.address, ethers.ZeroAddress, 0, [])
    ).to.be.revertedWithCustomError(registrar, "InvalidLabelCharacter");
  });

  it("caps child expiry to parent effective expiry when parent has less than 30 days", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    const parentExpiry = now + (10n * 24n * 60n * 60n);
    await activateParent(wrapper, registrar, parentNode, parentExpiry);

    await registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, []);

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, , expiry] = await wrapper.getData(childNode);
    expect(BigInt(expiry)).to.equal(parentExpiry);
  });

  it("does not let .eth parent grace extend the child beyond 30 days", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    const parentExpiryIncludingGrace = now + NINETY_DAYS + THIRTY_DAYS + 5n;
    await activateParent(wrapper, registrar, parentNode, parentExpiryIncludingGrace, CANNOT_UNWRAP | IS_DOT_ETH);

    await registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, []);
    const registeredAt = await latestTimestamp();

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, , expiry] = await wrapper.getData(childNode);
    expect(BigInt(expiry)).to.be.gte(registeredAt + THIRTY_DAYS - 2n);
    expect(BigInt(expiry)).to.be.lte(registeredAt + THIRTY_DAYS + 2n);
  });

  it("never grants CAN_EXTEND_EXPIRY and owner cannot self-renew", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await registrar.register(
      parentNode,
      "trialpass8",
      user.address,
      ethers.ZeroAddress,
      Number(CANNOT_UNWRAP | CANNOT_TRANSFER),
      []
    );
    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );

    const [, fuses, expiry] = await wrapper.getData(childNode);
    expect(BigInt(fuses) & CAN_EXTEND_EXPIRY).to.equal(0n);

    await expect(
      (wrapper.connect(user) as any).extendExpiry(childNode, BigInt(expiry) + 1n)
    ).to.be.revertedWith("cannot extend");
  });

  it("rejects ETH sent directly", async function () {
    const { registrar, deployer } = await deployFixture();
    await expect(
      deployer.sendTransaction({ to: await registrar.getAddress(), value: ethers.parseEther("0.1") })
    ).to.be.revertedWithCustomError(registrar, "EtherNotAccepted");
  });

  it("rejects accidental ETH sent to register", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, [], {
        value: ethers.parseEther("0.0001")
      })
    ).to.be.revertedWithCustomError(registrar, "EtherNotAccepted");
  });

  it("rejects unavailable names", async function () {
    const { registrar, wrapper, parentNode, now, user } = await deployFixture();
    await activateParent(wrapper, registrar, parentNode, now + THIRTY_DAYS + 1000n);

    const childNode = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes("trialpass8"))])
    );
    await wrapper.setNameData(childNode, user.address, Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS), true);

    await expect(
      registrar.register(parentNode, "trialpass8", user.address, ethers.ZeroAddress, 0, [])
    ).to.be.revertedWithCustomError(registrar, "Unavailable");
  });

  it("rejects parent not wrapped", async function () {
    const { registrar, parentNode } = await deployFixture();
    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "Unauthorised");
  });

  it("rejects parent not locked", async function () {
    const { registrar, wrapper, parentNode, now } = await deployFixture();
    await wrapper.setNameData(parentNode, await wrapper.getAddress(), 0, Number(now + THIRTY_DAYS + 1n), true);
    await wrapper.setCanModify(parentNode, (await ethers.getSigners())[0].address, true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);

    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "ParentNotLocked");
  });

  it("rejects when registrar is not approved for parent", async function () {
    const { registrar, wrapper, parentNode, now } = await deployFixture();
    await wrapper.setNameData(parentNode, await wrapper.getAddress(), Number(CANNOT_UNWRAP), Number(now + THIRTY_DAYS + 1n), true);
    await wrapper.setCanModify(parentNode, (await ethers.getSigners())[0].address, true);

    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "RegistrarNotAuthorised");
  });

  it("rejects setupDomain activation when parent effective expiry is already expired", async function () {
    const { registrar, wrapper, parentNode, now } = await deployFixture();
    const expired = now - 1n;
    await wrapper.setNameData(parentNode, await wrapper.getAddress(), Number(CANNOT_UNWRAP), Number(expired), true);
    await wrapper.setCanModify(parentNode, (await ethers.getSigners())[0].address, true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);

    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "ParentExpired");
  });

  it("rejects .eth setupDomain activation if only grace remains", async function () {
    const { registrar, wrapper, parentNode } = await deployFixture();
    const latest = await latestTimestamp();
    const graceOnlyExpiry = latest + NINETY_DAYS;
    await wrapper.setNameData(
      parentNode,
      await wrapper.getAddress(),
      Number(CANNOT_UNWRAP | IS_DOT_ETH),
      Number(graceOnlyExpiry),
      true
    );
    await wrapper.setCanModify(parentNode, (await ethers.getSigners())[0].address, true);
    await wrapper.setCanModify(parentNode, await registrar.getAddress(), true);

    await expect(registrar.setupDomain(parentNode, true)).to.be.revertedWithCustomError(registrar, "ParentExpired");
  });
});
