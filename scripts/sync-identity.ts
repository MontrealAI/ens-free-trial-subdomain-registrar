import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact, requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;

function usage() {
  console.log(
    "Usage: npm run sync:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--registrar 0x...] (--token-id <id> | --label 12345678)"
  );
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "sync identity on Ethereum mainnet");
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const tokenIdRaw = readFlagValue(process.argv, "token-id");
  const label = readFlagValue(process.argv, "label");

  if (!registrarAddress || !ethers.isAddress(registrarAddress)) {
    throw new Error("Missing --registrar and no deployment artifact found.");
  }
  if (!tokenIdRaw && !label) throw new Error("Provide either --token-id or --label.");
  if (tokenIdRaw && label) throw new Error("Use only one of --token-id or --label.");

  const [signer] = await ethers.getSigners();
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  let tx;
  if (label) {
    tx = await registrar.syncIdentityByLabel(label);
  } else {
    const tokenId = BigInt(tokenIdRaw!);
    tx = await registrar.syncIdentity(tokenId);
  }

  const receipt = await tx.wait();
  console.log(`txHash: ${receipt?.hash ?? tx.hash}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
