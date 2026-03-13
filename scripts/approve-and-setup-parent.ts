import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact, requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const ROOT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32,uint32) view returns (bool)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function setApprovalForAll(address,bool)",
  "function canModifyName(bytes32,address) view returns (bool)"
];

function usage() {
  console.log("Usage: npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate|deactivate [--registrar 0x...] [--approve-operator]");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "setup parent on Ethereum mainnet");
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("Missing --registrar and no deployment artifact found.");

  const action = readFlagValue(process.argv, "action");
  if (action !== "activate" && action !== "deactivate") throw new Error("--action must be activate or deactivate.");

  const [signer] = await ethers.getSigners();
  const wrapper = await ethers.getContractAt(WRAPPER_ABI, WRAPPER, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const [parentOwner] = await wrapper.getData(ROOT_NODE);
  const locked = await wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP);
  const approved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
  const canModify = await wrapper.canModifyName(ROOT_NODE, registrarAddress);
  const contractOwner = await registrar.owner();
  const rootBefore = await registrar.rootActive();

  console.log(`signer: ${signer.address}`);
  console.log(`contractOwner: ${contractOwner}`);
  console.log(`wrappedParentOwner: ${parentOwner}`);
  console.log(`rootActiveBefore: ${rootBefore}`);
  console.log(`parentLocked: ${locked}`);
  console.log(`approvalStatus: ${approved}`);
  console.log(`contractAuthorised: ${canModify}`);

  if (hasFlag(process.argv, "approve-operator")) {
    if (signer.address.toLowerCase() !== parentOwner.toLowerCase()) {
      throw new Error("--approve-operator requested but signer is not wrapped parent owner.");
    }
    if (!approved) {
      const tx = await wrapper.setApprovalForAll(registrarAddress, true);
      await tx.wait();
      console.log(`setApprovalForAll tx: ${tx.hash}`);
    }
  }

  if (action === "activate") {
    if (!locked) throw new Error("Cannot activate: parent is not locked (CANNOT_UNWRAP must be burned). Locking is irreversible.");
    const isApprovedNow = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
    if (!isApprovedNow && !canModify) {
      throw new Error("Cannot activate: registrar is not authorized on NameWrapper. Use --approve-operator from wrapped parent owner account.");
    }
    if (signer.address.toLowerCase() !== contractOwner.toLowerCase()) {
      throw new Error("Cannot activate: signer is not contract owner.");
    }
  }

  if (action === "deactivate" && signer.address.toLowerCase() !== contractOwner.toLowerCase()) {
    throw new Error("Cannot deactivate: signer is not contract owner.");
  }

  const tx = await registrar.setRootActive(action === "activate");
  await tx.wait();

  console.log(`setRootActive tx: ${tx.hash}`);
  console.log(`rootActiveAfter: ${await registrar.rootActive()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
