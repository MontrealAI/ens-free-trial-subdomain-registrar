import fs from "node:fs/promises";
import path from "node:path";

import { ethers, network, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";
import {
  ARTIFACT_PATH,
  DEFAULT_ENS_REGISTRY,
  DEFAULT_PARENT_NAME,
  DEFAULT_PARENT_NODE,
  DEFAULT_WRAPPER,
  MAINNET_CHAIN_ID
} from "./utils/mainnet-constants";

async function main() {
  if (hasFlag(process.argv, "help")) {
    console.log("Usage: npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--verify]");
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast a mainnet deployment transaction");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) throw new Error(`Expected chainId 1, got ${chainId.toString()}`);

  const wrapper = readFlagValue(process.argv, "wrapper") || process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;
  const ensRegistry = readFlagValue(process.argv, "ens-registry") || process.env.ENS_REGISTRY || DEFAULT_ENS_REGISTRY;
  const parentName = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME || DEFAULT_PARENT_NAME;
  const parentNode = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE || DEFAULT_PARENT_NODE;

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const nonce = await ethers.provider.getTransactionCount(deployer.address);

  const args = [wrapper, ensRegistry, parentNode, parentName] as const;

  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`ETH balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`Nonce: ${nonce}`);
  console.log(`Constructor args: ${JSON.stringify(args)}`);

  const factory = await ethers.getContractFactory("FreeTrialSubdomainRegistrarIdentity");
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("Missing deployment transaction");
  console.log(`Deploy tx hash: ${tx.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`Deployed address: ${address}`);

  await tx.wait(5);

  const artifact = {
    chainId: Number(chainId),
    contractName: "FreeTrialSubdomainRegistrarIdentity",
    address,
    deployTxHash: tx.hash,
    constructorArgs: args,
    wrapper,
    ensRegistry,
    parentName,
    parentNode,
    compilerVersion: "0.8.24",
    optimizer: { enabled: true, runs: 200 },
    deployedAt: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(ARTIFACT_PATH), { recursive: true });
  await fs.writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote deployment artifact: ${ARTIFACT_PATH}`);

  const shouldVerify = hasFlag(process.argv, "verify") || Boolean(process.env.ETHERSCAN_API_KEY);
  if (shouldVerify) {
    await run("verify:verify", {
      address,
      contract: "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity",
      constructorArguments: args
    });
    console.log("Verification complete.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
