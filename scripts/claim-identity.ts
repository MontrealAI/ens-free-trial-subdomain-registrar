import { ethers, network } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1n;

function printUsage(): void {
  console.log(`Usage:
  npm run claim:mainnet -- --identity 0x... --label 12345678 --confirm-mainnet I_UNDERSTAND_MAINNET

Notes:
- --label is a single label (first-degree) under alpha.agent.agi.eth.
- Caller must be wrapped name owner or transaction will revert.`);
}

function requireAddress(name: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function requireLabel(value: string | undefined): string {
  if (!value) {
    throw new Error("--label is required.");
  }
  return value;
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  if (hasFlag(process.argv, "node") || process.env.NODE) {
    throw new Error("--node is no longer supported. Use --label <single-label> instead.");
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast an identity claim transaction");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const identityAddress = requireAddress("IDENTITY_ADDRESS", readFlagValue(process.argv, "identity") || process.env.IDENTITY_ADDRESS);
  const label = requireLabel(readFlagValue(process.argv, "label") || process.env.LABEL);

  const code = await ethers.provider.getCode(identityAddress);
  if (code === "0x") {
    throw new Error(`No contract code found at IDENTITY_ADDRESS=${identityAddress}.`);
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await ethers.provider.getBalance(signerAddress);
  if (signerBalance === 0n) {
    throw new Error("Signer has zero ETH balance. Fund the account for gas before claiming identity.");
  }

  const identity = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", identityAddress, signer);

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Identity contract: ${identityAddress}`);
  console.log(`Caller: ${signerAddress}`);
  console.log(`Label: ${label}`);

  const tx = await identity.claimIdentity(label);
  const receipt = await tx.wait();

  const preview = await identity.preview(label);

  console.log("Done.");
  console.log(`Transaction hash: ${receipt?.hash ?? tx.hash}`);
  console.log(`Claimed tokenId: ${preview[2].toString()}`);
  console.log(`Claimed node: ${preview[1]}`);
  console.log(`Claimed full name: ${preview[0]}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
