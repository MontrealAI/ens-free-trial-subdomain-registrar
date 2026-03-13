import { ethers, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const CONTRACT_PATH = "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity";
const DEFAULT_ARGS: [string, string] = [
  "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401",
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"
];

function usage() {
  console.log("Usage: npm run verify:mainnet -- --address 0x... (falls back to deployment artifact)");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const cliAddress = readFlagValue(process.argv, "address");
  const address = cliAddress || artifact?.address;
  if (!address || !ethers.isAddress(address)) throw new Error("Missing valid --address and no deployment artifact available.");

  if (!cliAddress && !artifact) {
    throw new Error("No deployment artifact found. Provide --address for explicit verification target.");
  }

  const constructorArguments = !cliAddress && artifact ? artifact.constructorArgs : DEFAULT_ARGS;

  try {
    await run("verify:verify", { address, contract: CONTRACT_PATH, constructorArguments });
    console.log(`Verified ${address}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("already verified")) {
      console.log(`Already verified: ${address}`);
      return;
    }
    if (msg.toLowerCase().includes("constructor") || msg.toLowerCase().includes("bytecode")) {
      throw new Error(`Verification failed (likely constructor mismatch): ${msg}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
