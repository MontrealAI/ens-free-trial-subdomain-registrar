import fs from "node:fs/promises";

import { ethers, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { ARTIFACT_PATH, MAINNET_CHAIN_ID } from "./utils/mainnet-constants";

type Artifact = {
  address: string;
  constructorArgs: [string, string, string, string];
};

async function readArtifact(): Promise<Artifact> {
  const raw = await fs.readFile(ARTIFACT_PATH, "utf8");
  return JSON.parse(raw) as Artifact;
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    console.log("Usage: npm run verify:mainnet -- --address 0x...");
    return;
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) throw new Error(`Expected chainId 1, got ${chainId.toString()}`);

  const artifact = await readArtifact();
  const address = readFlagValue(process.argv, "address") || artifact.address;
  if (!address || !ethers.isAddress(address)) throw new Error("Provide --address or a valid artifact address.");

  if (artifact.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error(`Address mismatch: artifact=${artifact.address}, flag=${address}`);
  }

  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`No contract bytecode at ${address}`);

  await run("verify:verify", {
    address,
    contract: "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity",
    constructorArguments: artifact.constructorArgs
  });

  console.log(`Verified ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
