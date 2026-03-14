import { ethers, network, run } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import {
  CONTRACT_PATH,
  ENS_REGISTRY_MAINNET,
  MAINNET_CHAIN_ID,
  NAME_WRAPPER_MAINNET,
  ROOT_NAME,
  ROOT_NODE,
  getGitCommit,
  writeReleaseArtifact,
  requireMainnetBroadcastConfirmation
} from "./utils/mainnet-safety";

function usage() {
  console.log(
    "Usage: npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--verify] [--confirmations 5] [--overwrite-artifact]"
  );
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "deploy to Ethereum mainnet");

  const provider = ethers.provider;
  const net = await provider.getNetwork();
  if (net.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);
  }

  const [deployer] = await ethers.getSigners();
  const balance = await provider.getBalance(deployer.address);
  const nonce = await provider.getTransactionCount(deployer.address);
  const feeData = await provider.getFeeData();

  const namehash = ethers.namehash(ROOT_NAME);
  if (namehash.toLowerCase() !== ROOT_NODE.toLowerCase()) {
    throw new Error(`ROOT_NAME/ROOT_NODE mismatch: namehash(${ROOT_NAME})=${namehash}`);
  }

  const constructorArgs: [string, string] = [NAME_WRAPPER_MAINNET, ENS_REGISTRY_MAINNET];
  const confirmations = Number(readFlagValue(process.argv, "confirmations") || process.env.MAINNET_CONFIRMATIONS || "5");

  console.log(`network: ${network.name}`);
  console.log(`chainId: ${net.chainId}`);
  console.log(`deployer: ${deployer.address}`);
  console.log(`balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`nonce: ${nonce}`);
  console.log(`wrapper: ${NAME_WRAPPER_MAINNET}`);
  console.log(`ensRegistry: ${ENS_REGISTRY_MAINNET}`);
  console.log(`ROOT_NAME: ${ROOT_NAME}`);
  console.log(`ROOT_NODE: ${ROOT_NODE}`);
  console.log(`ethers.namehash(ROOT_NAME): ${namehash}`);
  console.log(`maxFeePerGas: ${feeData.maxFeePerGas ? `${ethers.formatUnits(feeData.maxFeePerGas, "gwei")} gwei` : "n/a"}`);
  console.log(
    `maxPriorityFeePerGas: ${
      feeData.maxPriorityFeePerGas ? `${ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")} gwei` : "n/a"
    }`
  );

  const factory = await ethers.getContractFactory("FreeTrialSubdomainRegistrarIdentity", deployer);
  const deployTxRequest = await factory.getDeployTransaction(...constructorArgs);
  const estimateGas = await provider.estimateGas(deployTxRequest);
  console.log(`estimatedDeployGas: ${estimateGas}`);
  if (feeData.maxFeePerGas) {
    const estimatedCostWei = estimateGas * feeData.maxFeePerGas;
    console.log(`estimatedDeployCostEth: ~${ethers.formatEther(estimatedCostWei)} ETH`);
  }

  const contract = await ethers.deployContract("FreeTrialSubdomainRegistrarIdentity", constructorArgs, deployer);
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error("Deployment transaction unavailable.");

  console.log(`deployTxHash: ${tx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`deployedAddress: ${address}`);

  await tx.wait(confirmations);

  await writeReleaseArtifact(
    {
      chainId: Number(MAINNET_CHAIN_ID),
      network: network.name,
      contractName: "FreeTrialSubdomainRegistrarIdentity",
      contractPath: CONTRACT_PATH,
      address,
      deployTxHash: tx.hash,
      deployer: deployer.address,
      constructorArgs,
      wrapper: NAME_WRAPPER_MAINNET,
      ensRegistry: ENS_REGISTRY_MAINNET,
      rootName: ROOT_NAME,
      rootNode: ROOT_NODE,
      compilerVersion: "0.8.24",
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      deployedAt: new Date().toISOString(),
      gitCommit: getGitCommit()
    },
    hasFlag(process.argv, "overwrite-artifact")
  );

  const shouldVerify = hasFlag(process.argv, "verify") || Boolean(process.env.ETHERSCAN_API_KEY);
  if (shouldVerify) {
    try {
      await run("verify:verify", {
        address,
        contract: CONTRACT_PATH,
        constructorArguments: constructorArgs
      });
      console.log("verify: success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("already verified")) {
        console.log("verify: already verified");
      } else {
        throw error;
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
