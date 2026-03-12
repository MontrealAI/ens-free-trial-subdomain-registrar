import { network } from "hardhat";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
  "function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool)",
  "function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry)"
] as const;

function resolveParentNode(ethersLib: typeof import("ethers")): string {
  const parentNode = process.env.PARENT_NODE;
  const parentName = process.env.PARENT_NAME;

  if (parentNode) {
    if (!ethersLib.isHexString(parentNode, 32)) {
      throw new Error("PARENT_NODE must be a 32-byte hex value.");
    }
    return parentNode;
  }
  if (parentName) return ethersLib.namehash(parentName);

  throw new Error("Set PARENT_NAME or PARENT_NODE in your environment.");
}

function requireAddress(name: string, value: string | undefined, ethersLib: typeof import("ethers")): string {
  if (!value || !ethersLib.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

const { ethers, networkName } = await network.connect();

async function main() {
  const wrapperAddress = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
  const registrarAddress = requireAddress("REGISTRAR_ADDRESS", process.env.REGISTRAR_ADDRESS, ethers);
  const active = (process.env.ACTIVE || "true").toLowerCase() === "true";
  const parentNode = resolveParentNode(ethers);
  const parentName = process.env.PARENT_NAME;

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== BigInt(MAINNET_CHAIN_ID)) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const wrapperCode = await ethers.provider.getCode(wrapperAddress);
  if (wrapperCode === "0x") {
    throw new Error(`ENS_NAME_WRAPPER=${wrapperAddress} has no contract bytecode on mainnet.`);
  }

  const registrarCode = await ethers.provider.getCode(registrarAddress);
  if (registrarCode === "0x") {
    throw new Error(`REGISTRAR_ADDRESS=${registrarAddress} has no contract bytecode on mainnet.`);
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await ethers.provider.getBalance(signerAddress);
  if (signerBalance === 0n) {
    throw new Error("Signer has zero ETH balance. Fund the account for gas before setup.");
  }

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, wrapperAddress, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);

  const configuredWrapper = await registrar.wrapper();
  if (configuredWrapper.toLowerCase() !== wrapperAddress.toLowerCase()) {
    throw new Error(
      `Registrar wrapper mismatch: registrar points to ${configuredWrapper} but ENS_NAME_WRAPPER is ${wrapperAddress}. Refusing to proceed.`
    );
  }

  const [parentOwner] = await wrapper.getData(parentNode);
  const parentLocked = await wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP);
  const alreadyApproved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
  const signerIsParentOwner = parentOwner.toLowerCase() === signerAddress.toLowerCase();

  console.log(`Network: ${networkName}`);
  console.log(`Signer: ${signerAddress}`);
  console.log(`Signer ETH balance: ${ethers.formatEther(signerBalance)} ETH`);
  console.log(`Parent node: ${parentNode}`);
  console.log(`Wrapped parent owner: ${parentOwner}`);
  console.log(`Parent locked: ${parentLocked}`);
  console.log(`Registrar: ${registrarAddress}`);

  if (active && !parentLocked) {
    throw new Error(
      "Parent is not locked. Burn CANNOT_UNWRAP on the parent in ENS Manager before activating this registrar."
    );
  }

  if (!alreadyApproved) {
    if (!signerIsParentOwner) {
      throw new Error(
        "Registrar is not approved by the wrapped parent owner. Switch to the parent owner account (or Safe owner flow), approve registrar, and run again."
      );
    }

    console.log("Approving registrar via NameWrapper.setApprovalForAll...");
    const approveTx = await wrapper.setApprovalForAll(registrarAddress, true);
    await approveTx.wait();
    console.log("Approval confirmed.");
  } else {
    console.log("Registrar already approved on NameWrapper by wrapped parent owner.");
  }

  console.log(active ? "Activating parent..." : "Deactivating parent...");
  const setupTx = await registrar.setupDomain(parentNode, active);
  await setupTx.wait();

  console.log(`Parent active = ${active}`);
  console.log("Done.");
  if (active) {
    console.log("Next steps:");
    if (parentName) {
      console.log(
        `1) Register a first-degree label only, e.g. --parent-name ${parentName} --label 12345678 (creates 12345678.${parentName}).`
      );
    } else {
      console.log("1) Register a first-degree label only (single label, no dots). Example: --label 12345678.");
    }
    console.log("2) Do not pass a full ENS name to --label.");
    console.log("3) Run: npm run register:mainnet -- --help");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
