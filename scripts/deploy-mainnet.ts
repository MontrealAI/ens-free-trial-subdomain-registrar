import { network } from "hardhat";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

function requireAddress(name: string, value: string, ethersLib: typeof import("ethers")): string {
  if (!ethersLib.isAddress(value)) {
    throw new Error(`${name} must be a valid address. Received: ${value}`);
  }
  return value;
}

const { ethers, networkName } = await network.connect();

async function main() {
  const wrapper = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;

  if (chainId !== BigInt(MAINNET_CHAIN_ID)) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${networkName}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Using ENS NameWrapper: ${wrapper}`);

  const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [wrapper]);
  console.log("Waiting for deployment confirmation...");
  await registrar.waitForDeployment();

  const address = await registrar.getAddress();

  console.log("\nDeployment complete.");
  console.log(`Registrar address: ${address}`);
  console.log("\nNext steps:");
  console.log(`1) Add REGISTRAR_ADDRESS=${address} to your .env`);
  console.log("2) Lock your parent in ENS Manager (burn CANNOT_UNWRAP on parent)");
  console.log("3) Run: npm run setup:parent:mainnet");
  console.log(`4) Verify contract: npm run verify:mainnet -- ${address} ${wrapper}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
