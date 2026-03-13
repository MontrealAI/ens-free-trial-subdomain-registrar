import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact, requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const ROOT_NAME = "alpha.agent.agi.eth";

function usage() {
  console.log(
    "Usage: npm run claim:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--registrar 0x...] --label 12345678"
  );
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "claim identity on Ethereum mainnet");
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const label = readFlagValue(process.argv, "label");

  if (!registrarAddress || !ethers.isAddress(registrarAddress)) {
    throw new Error("Missing --registrar and no deployment artifact found.");
  }
  if (!label) throw new Error("Missing --label.");

  const [signer] = await ethers.getSigners();
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const before = await registrar.preview(label);
  console.log(`preview.fullName: ${before.fullName || `${label}.${ROOT_NAME}`}`);
  console.log(`preview.tokenId: ${before.tokenId}`);
  console.log(`preview.status: ${before.status}`);

  const tx = await registrar.claimIdentity(label);
  const receipt = await tx.wait();

  const tokenId = await registrar.claimIdentity.staticCall(label);
  console.log(`txHash: ${receipt?.hash ?? tx.hash}`);
  console.log(`claimedTokenId: ${tokenId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
