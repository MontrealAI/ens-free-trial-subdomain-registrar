import { ethers, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const CONTRACT_PATH = "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity";

function usage() {
  console.log("Usage: npm run verify:mainnet -- --address 0x... (or use release artifact)");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  if ((await ethers.provider.getNetwork()).chainId !== CHAIN_ID) throw new Error("Mainnet only.");

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const address = readFlagValue(process.argv, "address") || artifact?.address;
  if (!address || !ethers.isAddress(address)) throw new Error("Missing valid --address and no release artifact found.");

  if (artifact && address.toLowerCase() !== artifact.address.toLowerCase()) {
    throw new Error(`Address mismatch: --address ${address} != artifact ${artifact.address}`);
  }

  const constructorArguments: [string, string, string, string] = artifact
    ? artifact.constructorArgs
    : [
        "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401",
        "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
        "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e",
        "alpha.agent.agi.eth"
      ];

  await run("verify:verify", {
    address,
    contract: CONTRACT_PATH,
    constructorArguments
  });

  console.log(`Verified ${address}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
