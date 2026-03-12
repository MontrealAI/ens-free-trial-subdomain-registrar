import { network } from "hardhat";

const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";

const { ethers, networkName } = await network.connect();

async function main() {
  const wrapper = process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;

  console.log(`Deploying FreeTrialSubdomainRegistrar to ${networkName}...`);
  console.log(`Using ENS NameWrapper: ${wrapper}`);

  const registrar = await ethers.deployContract("FreeTrialSubdomainRegistrar", [wrapper]);
  console.log("Waiting for deployment confirmation...");
  await registrar.waitForDeployment();

  const address = await registrar.getAddress();

  console.log("Done.");
  console.log(`Registrar address: ${address}`);
  console.log("Next steps:");
  console.log(`1) Set REGISTRAR_ADDRESS=${address}`);
  console.log("2) Activate your wrapped parent with npm run setup:parent:mainnet");
  console.log(`3) Verify the contract: npm run verify:mainnet -- ${address} ${wrapper}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
