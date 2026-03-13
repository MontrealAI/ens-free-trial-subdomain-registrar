import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact, requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const ROOT_NAME = "alpha.agent.agi.eth";

function usage() {
  console.log("Usage: npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--registrar 0x...] --label 12345678");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "register a subname on Ethereum mainnet");
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const label = readFlagValue(process.argv, "label");

  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("Missing --registrar and no deployment artifact found.");
  if (!label) throw new Error("Missing --label.");

  const [signer] = await ethers.getSigners();
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const preview = await registrar.preview(label);
  console.log(`preview.fullName: ${preview.fullName}`);
  console.log(`preview.node: ${preview.node}`);
  console.log(`preview.tokenId: ${preview.tokenId}`);
  console.log(`preview.available: ${preview.availableOut}`);
  console.log(`preview.status: ${preview.status}`);

  const tx = await registrar.register(label);
  const receipt = await tx.wait();

  const post = await registrar.preview(label);
  console.log(`txHash: ${receipt?.hash ?? tx.hash}`);
  console.log(`fullENSName: ${label}.${ROOT_NAME}`);
  console.log(`node: ${post.node}`);
  console.log(`tokenId: ${post.tokenId}`);
  console.log(`expiry: ${post.expectedNewExpiry}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
