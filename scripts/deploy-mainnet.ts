import { ethers, network } from "hardhat";

import {
  requireMainnetBroadcastConfirmation,
  writeDeploymentManifest
} from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const BUILD_PROFILE = "production-solc-0.8.17-optimizer-200";

function requireAddress(name: string, value: string, ethersLib: { isAddress: (value: string) => boolean; isHexString?: (value: string) => boolean }): string {
  if (!ethersLib.isAddress(value)) {
    throw new Error(`${name} must be a valid address. Received: ${value}`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage:
  npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET

Optional:
  ENS_NAME_WRAPPER=0x... (defaults to mainnet NameWrapper)
  MAINNET_CONFIRM=I_UNDERSTAND_MAINNET (env alternative to --confirm-mainnet)

This script is mainnet-only and writes a deployment manifest under deployments/mainnet/.`);
}


async function main() {
  if (process.argv.includes("--help")) {
    printUsage();
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast a registrar deployment transaction");

  const wrapper = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
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

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer ETH balance: ${ethers.formatEther(deployerBalance)} ETH`);
  console.log(`Contract: FreeTrialSubdomainRegistrar`);
  console.log(`Constructor args: [\"${wrapper}\"]`);
  console.log(`Using ENS NameWrapper: ${wrapper}`);

  const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [wrapper]);
  console.log(`Deployment transaction: ${registrar.deploymentTransaction()?.hash ?? "unknown"}`);
  console.log("Waiting for deployment confirmation...");
  await registrar.waitForDeployment();

  const address = await registrar.getAddress();
  const receipt = await registrar.deploymentTransaction()?.wait();

  const verifyCommand = `npm run verify:mainnet -- --address ${address}`;
  const manifestPath = await writeDeploymentManifest({
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    contractName: "FreeTrialSubdomainRegistrar",
    contractAddress: address,
    deploymentTxHash: receipt?.hash || registrar.deploymentTransaction()?.hash || "unknown",
    blockNumber: receipt?.blockNumber ?? null,
    constructorArgs: [wrapper],
    timestamp: new Date().toISOString(),
    buildProfile: BUILD_PROFILE,
    verification: {
      command: verifyCommand,
      status: "pending"
    }
  });

  console.log("\nDeployment complete.");
  console.log(`Registrar address: ${address}`);
  console.log(`Manifest written: ${manifestPath}`);
  console.log("\nNext steps:");
  console.log(`1) Add REGISTRAR_ADDRESS=${address} to your .env`);
  console.log(`2) Verify contract (reads constructor args from manifest): ${verifyCommand}`);
  console.log("3) Lock your parent in ENS Manager (burn CANNOT_UNWRAP on parent)");
  console.log("4) Run: npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
