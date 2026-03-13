import { ethers, network, run } from "hardhat";

import { hasFlag } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation, writeReleaseArtifact } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const CONTRACT = "FreeTrialSubdomainRegistrarIdentity";
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const DEFAULT_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const DEFAULT_PARENT_NAME = "alpha.agent.agi.eth";
const DEFAULT_PARENT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";

function printUsage() {
  console.log(`Usage:\n  npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--verify]`);
}

async function main() {
  if (hasFlag(process.argv, "help")) return printUsage();
  requireMainnetBroadcastConfirmation(process.argv, "deploy to Ethereum mainnet");

  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;
  if (chainId !== CHAIN_ID) throw new Error(`Mainnet only. Connected chainId=${chainId.toString()}`);

  const [deployer] = await ethers.getSigners();
  const balance = await provider.getBalance(deployer.address);
  const nonce = await provider.getTransactionCount(deployer.address);

  const constructorArgs: [string, string, string, string] = [
    DEFAULT_WRAPPER,
    DEFAULT_REGISTRY,
    DEFAULT_PARENT_NODE,
    DEFAULT_PARENT_NAME
  ];

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`Nonce: ${nonce}`);
  console.log(`Constructor args: ${JSON.stringify(constructorArgs)}`);

  const contract = await ethers.deployContract(CONTRACT, constructorArgs);
  const deployTx = contract.deploymentTransaction();
  if (!deployTx) throw new Error("Missing deployment transaction");

  console.log(`Deployment tx hash: ${deployTx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`Deployed address: ${address}`);

  await deployTx.wait(5);

  await writeReleaseArtifact({
    chainId: 1,
    contractName: "FreeTrialSubdomainRegistrarIdentity",
    address,
    deployTxHash: deployTx.hash,
    constructorArgs,
    wrapper: DEFAULT_WRAPPER,
    ensRegistry: DEFAULT_REGISTRY,
    parentName: DEFAULT_PARENT_NAME,
    parentNode: DEFAULT_PARENT_NODE,
    compilerVersion: "0.8.24",
    optimizer: { enabled: true, runs: 200 },
    deployedAt: new Date().toISOString()
  });

  const shouldVerify = hasFlag(process.argv, "verify") || Boolean(process.env.ETHERSCAN_API_KEY);
  if (shouldVerify) {
    console.log("Running Etherscan verification...");
    await run("verify:verify", {
      address,
      contract: "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity",
      constructorArguments: constructorArgs
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
