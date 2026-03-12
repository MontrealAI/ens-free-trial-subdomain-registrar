import { isAddress } from "ethers";
import { network } from "hardhat";

const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

const { ethers, networkName } = await network.connect();

function readWrapper(): string {
  const wrapper = process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;
  if (!isAddress(wrapper)) {
    throw new Error(`ENS_NAME_WRAPPER is not a valid address: ${wrapper}`);
  }

  return wrapper;
}

async function main() {
  if (networkName !== "mainnet") {
    throw new Error(`This script is intended for --network mainnet. Received: ${networkName}`);
  }

  const wrapper = readWrapper();

  console.log("=== ENS Free Trial Subdomain Registrar Deployment ===");
  console.log(`Network: ${networkName}`);
  console.log(`Using ENS NameWrapper: ${wrapper}`);

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);

  const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [wrapper]);
  console.log("Waiting for deployment confirmation...");
  await registrar.waitForDeployment();

  const address = await registrar.getAddress();

  console.log("\nDone.");
  console.log(`Registrar address: ${address}`);
  console.log("\nNext steps:");
  console.log(`1) Set REGISTRAR_ADDRESS=${address} in .env`);
  console.log("2) Lock your parent (burn CANNOT_UNWRAP) in ENS Manager");
  console.log("3) Activate your wrapped parent: npm run setup:parent:mainnet");
  console.log(`4) Verify the contract: npm run verify:mainnet -- ${address} ${wrapper}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
