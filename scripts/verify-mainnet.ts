import fs from "node:fs/promises";

import { ethers, network, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import {
  getManifestPath,
  updateDeploymentManifest,
  readDeploymentManifest,
  type DeploymentManifest
} from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1n;
const CONTRACT_NAME = "FreeTrialSubdomainRegistrar";
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

function printUsage(): void {
  console.log(`Usage:
  npm run verify:mainnet -- --address 0x... [--manifest deployments/mainnet/FreeTrialSubdomainRegistrar-0x....json] [--wrapper 0x...]

Notes:
  - Mainnet-only script.
  - If --manifest is provided (or default manifest exists for --address), constructor args are read from that manifest.
  - --wrapper can be used as explicit constructor arg fallback.
  - This script updates manifest verification status when a manifest file is available.`);
}

function requireAddress(name: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function looksAlreadyVerified(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already verified") || lower.includes("already been verified");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function assertManifestAddressMatches(manifestPath: string, manifestAddress: string, targetAddress: string): void {
  if (manifestAddress.toLowerCase() !== targetAddress.toLowerCase()) {
    throw new Error(
      `Manifest/address mismatch: ${manifestPath} contains contractAddress=${manifestAddress} but --address=${targetAddress}. Refusing to continue.`
    );
  }
}

async function resolveManifest(manifestPathArg: string | undefined, address: string): Promise<{ manifestPath?: string; manifest?: DeploymentManifest }> {
  if (manifestPathArg) {
    const manifest = await readDeploymentManifest(manifestPathArg);
    return { manifestPath: manifestPathArg, manifest };
  }

  const inferredPath = getManifestPath(network.name, address, CONTRACT_NAME);
  try {
    const manifest = await readDeploymentManifest(inferredPath);
    return { manifestPath: inferredPath, manifest };
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
    return {};
  }
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const address = requireAddress("--address", readFlagValue(process.argv, "address"));
  const wrapperArg = readFlagValue(process.argv, "wrapper");
  const wrapperAddress = wrapperArg ? requireAddress("--wrapper", wrapperArg) : undefined;
  const manifestPathArg = readFlagValue(process.argv, "manifest");

  const { manifestPath, manifest } = await resolveManifest(manifestPathArg, address);
  if (manifestPath && manifest) {
    assertManifestAddressMatches(manifestPath, requireAddress("manifest.contractAddress", manifest.contractAddress), address);
  }

  const constructorWrapper = wrapperAddress || manifest?.constructorArgs?.[0] || process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;

  if (!ethers.isAddress(constructorWrapper)) {
    throw new Error(`Unable to resolve constructor wrapper address. Received: ${constructorWrapper}`);
  }

  const contractCode = await ethers.provider.getCode(address);
  if (contractCode === "0x") {
    throw new Error(`No contract code found at --address ${address}.`);
  }

  const verifyPayload = {
    address,
    constructorArguments: [constructorWrapper]
  };

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Contract: ${CONTRACT_NAME}`);
  console.log(`Address: ${address}`);
  console.log(`Constructor args: ["${constructorWrapper}"]`);
  if (manifestPath) {
    console.log(`Manifest: ${manifestPath}`);
  } else {
    console.log("Manifest: not found (verification will run without manifest update)");
  }

  let status: "verified" | "failed" = "verified";
  let notes = "";

  try {
    await run("verify:verify", verifyPayload);
    console.log("Verification submitted successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (looksAlreadyVerified(message)) {
      console.log("Contract appears to be already verified on Etherscan.");
      notes = "already verified on explorer";
    } else {
      status = "failed";
      notes = message;
      throw error;
    }
  } finally {
    if (manifestPath) {
      await fs.access(manifestPath);
      await updateDeploymentManifest(manifestPath, (current) => ({
        ...current,
        verification: {
          ...current.verification,
          status,
          verifiedAt: status === "verified" ? new Date().toISOString() : undefined,
          explorerUrl: `https://etherscan.io/address/${address}#code`,
          notes: notes || current.verification.notes
        }
      }));
      console.log(`Updated manifest verification status: ${status}`);
    }
  }

  console.log("Done.");
  console.log(`Explorer: https://etherscan.io/address/${address}#code`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
