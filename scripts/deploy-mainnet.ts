import { ethers, network } from "hardhat";

import {
  requireMainnetBroadcastConfirmation,
  writeDeploymentManifest
} from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const DEFAULT_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const BUILD_PROFILE = "production-solc-0.8.24-optimizer-200";

type ContractKind = "identity" | "legacy";

function requireAddress(name: string, value: string, ethersLib: { isAddress: (value: string) => boolean }): string {
  if (!ethersLib.isAddress(value)) {
    throw new Error(`${name} must be a valid address. Received: ${value}`);
  }
  return value;
}

function resolveContractKind(): ContractKind {
  const flagIndex = process.argv.findIndex((arg) => arg === "--contract");
  if (flagIndex === -1) return "legacy";
  const value = process.argv[flagIndex + 1];
  if (value === "legacy" || value === "identity") return value;
  throw new Error("--contract must be either 'identity' or 'legacy'.");
}

function printUsage(): void {
  console.log(`Usage:
  npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--contract identity|legacy]

Optional:
  ENS_NAME_WRAPPER=0x... (defaults to mainnet NameWrapper)
  ENS_REGISTRY=0x... (used by identity contract; defaults to ENS registry)
  MAINNET_CONFIRM=I_UNDERSTAND_MAINNET (env alternative to --confirm-mainnet)

Default contract mode is legacy.`);
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast a registrar deployment transaction");
  const kind = resolveContractKind();

  const wrapper = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
  const registry = requireAddress("ENS_REGISTRY", process.env.ENS_REGISTRY || DEFAULT_REGISTRY, ethers);
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;

  if (chainId !== BigInt(MAINNET_CHAIN_ID)) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const [deployer] = await ethers.getSigners();
  const deployerBalance = await provider.getBalance(deployer.address);
  if (deployerBalance === 0n) {
    throw new Error("Deployer balance is zero. Fund the deployer wallet before deployment.");
  }

  const wrapperCode = await provider.getCode(wrapper);
  if (wrapperCode === "0x") {
    throw new Error(`ENS_NAME_WRAPPER=${wrapper} has no contract bytecode on mainnet. Refusing to deploy.`);
  }

  const contractName = kind === "identity" ? "FreeTrialSubdomainRegistrarIdentity" : "FreeTrialSubdomainRegistrar";
  const constructorArgs = kind === "identity" ? [wrapper, registry] : [wrapper];

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer ETH balance: ${ethers.formatEther(deployerBalance)} ETH`);
  console.log(`Contract: ${contractName}`);
  console.log(`Constructor args: ${JSON.stringify(constructorArgs)}`);
  console.log(`Using ENS NameWrapper: ${wrapper}`);

  const deployed = await ethers.deployContract(contractName, constructorArgs);
  console.log(`Deployment transaction: ${deployed.deploymentTransaction()?.hash ?? "unknown"}`);
  console.log("Waiting for deployment confirmation...");
  await deployed.waitForDeployment();

  const address = await deployed.getAddress();
  const receipt = await deployed.deploymentTransaction()?.wait();
  const verifyCommand = `npm run verify:mainnet -- --address ${address} --contract ${kind}`;

  const manifestPath = await writeDeploymentManifest({
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    contractName,
    contractAddress: address,
    deploymentTxHash: receipt?.hash || deployed.deploymentTransaction()?.hash || "unknown",
    blockNumber: receipt?.blockNumber ?? null,
    constructorArgs,
    timestamp: new Date().toISOString(),
    buildProfile: BUILD_PROFILE,
    verification: {
      command: verifyCommand,
      status: "pending"
    }
  });

  console.log("\nDeployment complete.");
  console.log(`Contract address: ${address}`);
  console.log(`Manifest written: ${manifestPath}`);
  console.log("\nNext steps:");
  console.log(`1) Verify contract: ${verifyCommand}`);
  if (kind === "legacy") {
    console.log("2) Setup parent: npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
