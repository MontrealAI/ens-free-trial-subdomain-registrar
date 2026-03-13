import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";
import { DEFAULT_PARENT_NODE, DEFAULT_WRAPPER, MAINNET_CHAIN_ID } from "./utils/mainnet-constants";

const ERC1155_ABI = ["function setApprovalForAll(address,bool) external", "function isApprovedForAll(address,address) view returns (bool)"];

async function main() {
  if (hasFlag(process.argv, "help")) {
    console.log("Usage: npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0x... --action activate|deactivate [--approve]");
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "configure parent activation");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) throw new Error(`Expected mainnet chainId=1, got ${chainId.toString()}`);

  const action = readFlagValue(process.argv, "action");
  if (action !== "activate" && action !== "deactivate") throw new Error("--action must be activate or deactivate");

  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("--registrar is required");

  const parentNode = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE || DEFAULT_PARENT_NODE;
  const wrapperAddress = readFlagValue(process.argv, "wrapper") || process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;

  const [signer] = await ethers.getSigners();
  const wrapper = new ethers.Contract(wrapperAddress, ERC1155_ABI, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const approved = await wrapper.isApprovedForAll(signer.address, registrarAddress);
  if (!approved && hasFlag(process.argv, "approve")) {
    const tx = await wrapper.setApprovalForAll(registrarAddress, true);
    await tx.wait();
    console.log(`setApprovalForAll tx: ${tx.hash}`);
  }

  // root checks performed in contract on activate.
  if (action === "activate") {
    const tx = await registrar.activateRoot();
    await tx.wait();
    console.log(`Activated root. tx=${tx.hash}`);
  } else {
    const tx = await registrar.deactivateRoot();
    await tx.wait();
    console.log(`Deactivated root. tx=${tx.hash}`);
  }

  console.log(`parentNode=${parentNode}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
