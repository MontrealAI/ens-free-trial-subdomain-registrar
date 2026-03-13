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
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

function printUsage(): void {
  console.log(`Usage:
  npm run verify:mainnet -- --address 0x... [--contract identity|legacy] [--manifest path] [--wrapper 0x...]

Default contract mode is legacy.`);
}

function requireAddress(name: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function contractName(kind: string): string {
  if (kind === "identity") return "FreeTrialSubdomainRegistrarIdentity";
  if (kind === "legacy") return "FreeTrialSubdomainRegistrar";
  throw new Error("--contract must be either 'identity' or 'legacy'.");
}

function looksAlreadyVerified(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already verified") || lower.includes("already been verified");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function assertManifestMatchesTarget(
  manifestPath: string,
  manifest: DeploymentManifest,
  expectedAddress: string,
  expectedContractName: string
): void {
  const manifestAddress = requireAddress("manifest.contractAddress", manifest.contractAddress);
  if (manifestAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `Manifest/address mismatch: ${manifestPath} contains contractAddress=${manifestAddress} but --address=${expectedAddress}. Refusing to continue.`
    );
  }

  if (manifest.contractName !== expectedContractName) {
    throw new Error(
      `Manifest/contract mismatch: ${manifestPath} contains contractName=${manifest.contractName} but --contract resolves to ${expectedContractName}. Refusing to continue.`
    );
  }
}

async function resolveManifest(manifestPathArg: string | undefined, address: string, chosenContractName: string): Promise<{ manifestPath?: string; manifest?: DeploymentManifest }> {
  if (manifestPathArg) {
    const manifest = await readDeploymentManifest(manifestPathArg);
    return { manifestPath: manifestPathArg, manifest };
  }

  const inferredPath = getManifestPath(network.name, address, chosenContractName);
  try {
    const manifest = await readDeploymentManifest(inferredPath);
    return { manifestPath: inferredPath, manifest };
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
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
  const kind = readFlagValue(process.argv, "contract") || "legacy";
  const chosenContractName = contractName(kind);

  const manifestPathArg = readFlagValue(process.argv, "manifest");
  const { manifestPath, manifest } = await resolveManifest(manifestPathArg, address, chosenContractName);
  if (manifestPath && manifest) {
    assertManifestMatchesTarget(manifestPath, manifest, address, chosenContractName);
  }

  const wrapper = readFlagValue(process.argv, "wrapper") || manifest?.constructorArgs?.[0] || process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;
  const constructorArguments = [requireAddress("wrapper", wrapper)];

  const contractCode = await ethers.provider.getCode(address);
  if (contractCode === "0x") throw new Error(`No contract code found at --address ${address}.`);

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Contract: ${chosenContractName}`);
  console.log(`Address: ${address}`);
  console.log(`Constructor args: ${JSON.stringify(constructorArguments)}`);

  let status: "verified" | "failed" = "verified";
  let notes = "";

  try {
    await run("verify:verify", {
      address,
      contract: `contracts/${chosenContractName}.sol:${chosenContractName}`,
      constructorArguments
    });
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
          notes: status === "verified" ? (notes || undefined) : (notes || current.verification.notes)
        }
      }));
      console.log(`Updated manifest verification status: ${status}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
