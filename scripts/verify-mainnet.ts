import { ethers, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import {
  CONTRACT_PATH,
  MAINNET_CHAIN_ID,
  readConstructorArgs,
  readReleaseArtifact,
  ENS_REGISTRY_MAINNET,
  NAME_WRAPPER_MAINNET,
  RELEASE_ARTIFACT_PATH,
  CONSTRUCTOR_ARGS_PATH
} from "./utils/mainnet-safety";

function usage() {
  console.log("Usage: npm run verify:mainnet -- [--address 0x...]");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();

  const net = await ethers.provider.getNetwork();
  if (net.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);
  }

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const cliAddress = readFlagValue(process.argv, "address");
  const address = cliAddress || artifact?.address;
  if (!address || !ethers.isAddress(address)) {
    throw new Error(`Missing valid verification target. Provide --address or create ${RELEASE_ARTIFACT_PATH}.`);
  }

  let constructorArguments: [string, string];
  let source = "default mainnet constants";

  if (artifact && address.toLowerCase() === artifact.address.toLowerCase()) {
    constructorArguments = artifact.constructorArgs;
    source = RELEASE_ARTIFACT_PATH;
  } else {
    const constructorFromFile = await readConstructorArgs().catch(() => undefined);
    if (constructorFromFile) {
      constructorArguments = constructorFromFile;
      source = CONSTRUCTOR_ARGS_PATH;
    } else {
      constructorArguments = [NAME_WRAPPER_MAINNET, ENS_REGISTRY_MAINNET];
    }
  }

  console.log(`verify.address: ${address}`);
  console.log(`verify.contract: ${CONTRACT_PATH}`);
  console.log(`constructorArgs.source: ${source}`);
  console.log(`constructorArgs: ${JSON.stringify(constructorArguments)}`);

  try {
    await run("verify:verify", {
      address,
      contract: CONTRACT_PATH,
      constructorArguments
    });
    console.log("verify: success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("already verified")) {
      console.log("verify: already verified");
      return;
    }
    if (lower.includes("constructor") || lower.includes("bytecode")) {
      throw new Error(`Verification failed (constructor mismatch likely): ${message}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
