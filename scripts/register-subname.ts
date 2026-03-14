import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { validateSingleLabelInput } from "./utils/label-input";
import { MAINNET_CHAIN_ID, ROOT_NAME, readReleaseArtifact, requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

function usage() {
  console.log("Usage: npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--registrar 0x...] --label 12345678");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  requireMainnetBroadcastConfirmation(process.argv, "register a subname on Ethereum mainnet");

  const net = await ethers.provider.getNetwork();
  if (net.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);
  }

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const label = readFlagValue(process.argv, "label");

  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("Missing --registrar and no deployment artifact found.");
  if (!label) throw new Error("Missing --label.");
  validateSingleLabelInput(label);

  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  console.log(`signer: ${signer.address}`);
  console.log(`signerBalanceEth: ${ethers.formatEther(balance)}`);
  console.log(`registrar: ${registrarAddress}`);
  console.log(`rootActive: ${await registrar.rootActive()}`);
  console.log(`paused: ${await registrar.paused()}`);

  const preview = await registrar.preview(label);
  console.log(`preview: ${JSON.stringify(preview, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}`);

  const tx = await registrar.register(label);
  const receipt = await tx.wait();

  const post = await registrar.preview(label);
  console.log(`txHash: ${receipt?.hash ?? tx.hash}`);
  console.log(`fullENSName: ${label}.${ROOT_NAME}`);
  console.log(`node: ${post.node}`);
  console.log(`tokenId: ${post.tokenId}`);
  console.log(`expiry: ${post.currentWrappedExpiry}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
