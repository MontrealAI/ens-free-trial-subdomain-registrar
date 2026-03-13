import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;

function usage() {
  console.log("Usage: npm run register:mainnet -- --registrar 0x... --label 12345678 --confirm-mainnet I_UNDERSTAND_MAINNET");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "register a wrapped subname on mainnet");
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  const label = readFlagValue(process.argv, "label");
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("Provide valid --registrar");
  if (!label) throw new Error("Provide --label");

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress);
  const preview = await registrar.preview(label);

  console.log(`preview.fullName: ${preview[0]}`);
  console.log(`preview.node: ${preview[1]}`);
  console.log(`preview.tokenId: ${preview[2]}`);
  console.log(`preview.expectedExpiry: ${preview[3]}`);
  console.log(`preview.available: ${preview[4]}`);

  const tx = await registrar.register(label);
  const receipt = await tx.wait();

  const post = await registrar.preview(label);
  console.log(`txHash: ${receipt?.hash ?? tx.hash}`);
  console.log(`fullENSName: ${post[0]}`);
  console.log(`node: ${post[1]}`);
  console.log(`tokenId: ${post[2]}`);
  console.log(`expiry: ${post[3]}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
