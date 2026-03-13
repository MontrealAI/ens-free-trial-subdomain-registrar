import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const PARENT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32,uint32) view returns (bool)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function setApprovalForAll(address,bool)"
];

function usage() {
  console.log("Usage: npm run setup:parent:mainnet -- --registrar 0x... --action activate|deactivate --confirm-mainnet I_UNDERSTAND_MAINNET [--approve]");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "configure parent activation on mainnet");

  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("Provide --registrar.");

  const action = readFlagValue(process.argv, "action");
  if (action !== "activate" && action !== "deactivate") throw new Error("--action must be activate|deactivate");

  const [signer] = await ethers.getSigners();
  const wrapper = await ethers.getContractAt(WRAPPER_ABI, WRAPPER, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const [parentOwner] = await wrapper.getData(PARENT_NODE);
  const parentLocked = await wrapper.allFusesBurned(PARENT_NODE, CANNOT_UNWRAP);
  const approved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);

  console.log(`parentOwner: ${parentOwner}`);
  console.log(`parentLocked: ${parentLocked}`);
  console.log(`approved: ${approved}`);

  if (!parentLocked && action === "activate") throw new Error("Parent must be locked (CANNOT_UNWRAP burned) before activation.");

  if (!approved && hasFlag(process.argv, "approve") && parentOwner.toLowerCase() === signer.address.toLowerCase()) {
    const tx = await wrapper.setApprovalForAll(registrarAddress, true);
    await tx.wait();
    console.log(`setApprovalForAll tx: ${tx.hash}`);
  }

  const tx = await registrar.setRootActive(action === "activate");
  await tx.wait();
  console.log(`root ${action}d: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
