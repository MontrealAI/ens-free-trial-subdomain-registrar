import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";
import { MAINNET_CHAIN_ID } from "./utils/mainnet-constants";

async function main() {
  if (hasFlag(process.argv, "help")) {
    console.log("Usage: npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0x... --label 12345678");
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast a registration transaction");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) throw new Error(`Expected mainnet chainId=1, got ${chainId.toString()}`);

  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  const label = readFlagValue(process.argv, "label") || process.env.LABEL;
  if (!registrarAddress || !ethers.isAddress(registrarAddress)) throw new Error("--registrar is required");
  if (!label) throw new Error("--label is required");

  const [signer] = await ethers.getSigners();
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress, signer);

  const preview = await registrar.preview(label);
  const [fullName, node, tokenId, expectedExpiry, isAvailable] = preview;
  console.log(`Preview fullName: ${fullName}`);
  console.log(`Preview node: ${node}`);
  console.log(`Preview tokenId: ${tokenId.toString()}`);
  console.log(`Preview expiry: ${expectedExpiry.toString()}`);
  console.log(`Available: ${isAvailable}`);

  const tx = await registrar.register(label);
  const receipt = await tx.wait();

  console.log(`Registered: ${fullName}`);
  console.log(`Node: ${node}`);
  console.log(`TokenId: ${tokenId.toString()}`);
  console.log(`Expiry: ${expectedExpiry.toString()}`);
  console.log(`TxHash: ${receipt?.hash ?? tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
