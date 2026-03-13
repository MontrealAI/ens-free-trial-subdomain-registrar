import { ethers, network } from "hardhat";

import {
  requireMainnetBroadcastConfirmation,
  writeDeploymentManifest
} from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const DEFAULT_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const BUILD_PROFILE = "production-solc-0.8.24-optimizer-200-viaIR-false";

function requireAddress(name: string, value: string): string {
  if (!ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address. Received: ${value}`);
  }
  return value;
}

async function main() {
  requireMainnetBroadcastConfirmation(process.argv, "broadcast an identity registrar deployment transaction");

  const wrapper = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER);
  const registry = requireAddress("ENS_REGISTRY", process.env.ENS_REGISTRY || DEFAULT_REGISTRY);

  const provider = ethers.provider;
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId}.`);
  }

  const [deployer] = await ethers.getSigners();
  const contract = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", [wrapper, registry]);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait();

  const verifyCommand = `npm run verify:identity:mainnet -- --address ${address}`;
  const manifestPath = await writeDeploymentManifest({
    network: network.name,
    chainId: String(chainId),
    deployer: deployer.address,
    contractName: "FreeTrialSubdomainRegistrarIdentity",
    contractAddress: address,
    deploymentTxHash: receipt?.hash || contract.deploymentTransaction()?.hash || "unknown",
    blockNumber: receipt?.blockNumber ?? null,
    constructorArgs: [wrapper, registry],
    timestamp: new Date().toISOString(),
    buildProfile: BUILD_PROFILE,
    verification: {
      command: verifyCommand,
      status: "pending"
    }
  });

  console.log(`Identity deployed at: ${address}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Verify: ${verifyCommand}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
