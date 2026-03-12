import { network } from "hardhat";

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

  if (parentNode && parentNode !== "") return parentNode;
  if (parentName && parentName !== "") return ethersLib.namehash(parentName);

  throw new Error("Set PARENT_NAME or PARENT_NODE in your environment.");
}

const { ethers, networkName } = await network.connect();

async function main() {
  const wrapperAddress = process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;
  const registrarAddress = process.env.REGISTRAR_ADDRESS;
  const active = (process.env.ACTIVE || "true").toLowerCase() === "true";

  if (!registrarAddress) {
    throw new Error("Set REGISTRAR_ADDRESS in your environment.");
  }

  const parentNode = resolveParentNode(ethers);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, wrapperAddress, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);

  const [parentOwner] = await wrapper.getData(parentNode);
  const parentLocked = await wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP);
  const alreadyApproved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
  const signerIsParentOwner = parentOwner.toLowerCase() === signerAddress.toLowerCase();

  console.log(`Network: ${networkName}`);
  console.log(`Signer: ${signerAddress}`);
  console.log(`Parent node: ${parentNode}`);
  console.log(`Wrapped parent owner: ${parentOwner}`);
  console.log(`Parent locked: ${parentLocked}`);
  console.log(`Registrar: ${registrarAddress}`);

  if (active && !parentLocked) {
    throw new Error(
      "Your wrapped parent is not locked yet. Burn CANNOT_UNWRAP on the parent first in ENS Manager, then run this script again."
    );
  }

  if (!alreadyApproved) {
    if (!signerIsParentOwner) {
      throw new Error(
        "The connected signer is not the current wrapped parent owner. Switch to the parent owner account (or Safe flow) and run again."
      );
    }

    console.log("Approving the registrar as an operator on NameWrapper...");
    const approveTx = await wrapper.setApprovalForAll(registrarAddress, true);
    await approveTx.wait();
    console.log("Approval confirmed.");
  } else {
    console.log("Registrar is already approved on the NameWrapper.");
  }

  console.log(active ? "Activating parent..." : "Deactivating parent...");
  const setupTx = await registrar.setupDomain(parentNode, active);
  await setupTx.wait();

  console.log(`Parent active = ${active}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
