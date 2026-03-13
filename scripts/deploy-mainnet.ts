import { ethers, network, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { getGitCommit, requireMainnetBroadcastConfirmation, writeReleaseArtifact } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const CONTRACT = "FreeTrialSubdomainRegistrarIdentity";
const CONTRACT_PATH = "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity" as const;
const WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ROOT_NAME = "alpha.agent.agi.eth" as const;
const ROOT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";

function usage() {
  console.log("Usage: npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--verify] [--confirmations 5]");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "deploy to Ethereum mainnet");

  const provider = ethers.provider;
  const net = await provider.getNetwork();
  if (net.chainId !== CHAIN_ID) throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);

  const [deployer] = await ethers.getSigners();
  const balance = await provider.getBalance(deployer.address);
  const nonce = await provider.getTransactionCount(deployer.address);
  const confirmations = Number(readFlagValue(process.argv, "confirmations") ?? "5");

  console.log(`network: ${network.name}`);
  console.log(`chainId: ${net.chainId}`);
  console.log(`deployer: ${deployer.address}`);
  console.log(`balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`nonce: ${nonce}`);
  console.log(`wrapper: ${WRAPPER}`);
  console.log(`ensRegistry: ${ENS_REGISTRY}`);
  console.log(`ROOT_NAME: ${ROOT_NAME}`);
  console.log(`ROOT_NODE: ${ROOT_NODE}`);

  const constructorArgs: [string, string] = [WRAPPER, ENS_REGISTRY];
  const contract = await ethers.deployContract(CONTRACT, constructorArgs, deployer);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("Missing deployment transaction");

  console.log(`txHash: ${tx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`deployedAddress: ${address}`);

  await tx.wait(confirmations);

  await writeReleaseArtifact({
    chainId: 1,
    network: network.name,
    contractName: "FreeTrialSubdomainRegistrarIdentity",
    contractPath: CONTRACT_PATH,
    address,
    deployTxHash: tx.hash,
    deployer: deployer.address,
    constructorArgs,
    wrapper: WRAPPER,
    ensRegistry: ENS_REGISTRY,
    rootName: ROOT_NAME,
    rootNode: ROOT_NODE,
    compilerVersion: "0.8.24",
    optimizer: { enabled: true, runs: 200 },
    viaIR: false,
    deployedAt: new Date().toISOString(),
    gitCommit: getGitCommit()
  });

  const shouldVerify = hasFlag(process.argv, "verify") || Boolean(process.env.ETHERSCAN_API_KEY);
  if (shouldVerify) {
    try {
      await run("verify:verify", { address, contract: CONTRACT_PATH, constructorArguments: constructorArgs });
      console.log("verify: success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes("already verified")) console.log("verify: already verified");
      else throw error;
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
