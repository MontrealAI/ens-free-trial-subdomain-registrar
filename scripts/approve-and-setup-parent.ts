import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import {
  MAINNET_CHAIN_ID,
  NAME_WRAPPER_MAINNET,
  ROOT_NODE,
  readReleaseArtifact,
  requireMainnetBroadcastConfirmation
} from "./utils/mainnet-safety";

const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32,uint32) view returns (bool)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function setApprovalForAll(address,bool)",
  "function canModifyName(bytes32,address) view returns (bool)"
];

function usage() {
  console.log(
    "Usage: npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate|deactivate [--registrar 0x...] [--approve-operator]"
  );
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "setup parent on Ethereum mainnet");

  const net = await ethers.provider.getNetwork();
  if (net.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);
  }

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) {
    throw new Error("Missing --registrar and no deployment artifact found.");
  }

  const action = readFlagValue(process.argv, "action");
  if (action !== "activate" && action !== "deactivate") {
    throw new Error("--action must be activate or deactivate.");
  }

  const [signer] = await ethers.getSigners();
  const wrapper = await ethers.getContractAt(WRAPPER_ABI, NAME_WRAPPER_MAINNET, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const [parentOwner] = await wrapper.getData(ROOT_NODE).catch(() => [ethers.ZeroAddress] as const);
  const parentWrapped = parentOwner !== ethers.ZeroAddress;
  const parentLocked = parentWrapped ? await wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP) : false;
  const approved = parentWrapped ? await wrapper.isApprovedForAll(parentOwner, registrarAddress) : false;
  const canModify = parentWrapped ? await wrapper.canModifyName(ROOT_NODE, registrarAddress) : false;
  const contractOwner = await registrar.owner();
  const rootBefore = await registrar.rootActive();

  console.log(`signer: ${signer.address}`);
  console.log(`contractOwner: ${contractOwner}`);
  console.log(`wrappedParentOwner: ${parentOwner}`);
  console.log(`rootActiveBefore: ${rootBefore}`);
  console.log(`parentWrapped: ${parentWrapped}`);
  console.log(`parentLocked: ${parentLocked}`);
  console.log(`approvalStatus: ${approved}`);
  console.log(`contractAuthorised: ${canModify}`);

  if (hasFlag(process.argv, "approve-operator")) {
    if (!parentWrapped) {
      throw new Error("Cannot approve operator: wrapped root not found. Wrap alpha.agent.agi.eth first.");
    }
    if (signer.address.toLowerCase() !== parentOwner.toLowerCase()) {
      throw new Error("--approve-operator requested but signer is not wrapped parent owner.");
    }
    if (!approved) {
      const approvalTx = await wrapper.setApprovalForAll(registrarAddress, true);
      await approvalTx.wait();
      console.log(`setApprovalForAll tx: ${approvalTx.hash}`);
    }
  }

  if (signer.address.toLowerCase() !== contractOwner.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not contract owner ${contractOwner}; cannot ${action} root.`);
  }

  if (action === "activate") {
    if (!parentWrapped) throw new Error("Cannot activate: wrapped root not found on NameWrapper.");
    if (!parentLocked) throw new Error("Cannot activate: parent is not locked (CANNOT_UNWRAP burned required). Locking is irreversible.");

    const approvedNow = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
    const canModifyNow = await wrapper.canModifyName(ROOT_NODE, registrarAddress);
    if (!approvedNow && !canModifyNow) {
      throw new Error("Cannot activate: registrar is not authorized on NameWrapper. Use --approve-operator from parent owner account.");
    }
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
