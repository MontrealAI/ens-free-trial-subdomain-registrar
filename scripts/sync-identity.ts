import { ethers, network } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1n;

function printUsage(): void {
  console.log(`Usage:
  npm run sync:mainnet -- --identity 0x... --token-id 123... --confirm-mainnet I_UNDERSTAND_MAINNET

Notes:
- syncIdentity is permissionless and may burn stale identities.`);
}

function requireAddress(name: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function requireTokenId(value: string | undefined): bigint {
  if (!value) {
    throw new Error("--token-id is required.");
  }

  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error("token id must be non-negative");
    return parsed;
  } catch {
    throw new Error("--token-id must be a valid uint256 integer.");
  }
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast an identity sync transaction");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const identityAddress = requireAddress("IDENTITY_ADDRESS", readFlagValue(process.argv, "identity") || process.env.IDENTITY_ADDRESS);
  const tokenId = requireTokenId(readFlagValue(process.argv, "token-id") || process.env.TOKEN_ID);

  const code = await ethers.provider.getCode(identityAddress);
  if (code === "0x") {
    throw new Error(`No contract code found at IDENTITY_ADDRESS=${identityAddress}.`);
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await ethers.provider.getBalance(signerAddress);
  if (signerBalance === 0n) {
    throw new Error("Signer has zero ETH balance. Fund the account for gas before syncing identity.");
  }

  const identity = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", identityAddress, signer);

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Identity contract: ${identityAddress}`);
  console.log(`Caller: ${signerAddress}`);
  console.log(`Token ID: ${tokenId.toString()}`);

  const tx = await identity.syncIdentity(tokenId);
  const receipt = await tx.wait();

  console.log("Done.");
  console.log(`Transaction hash: ${receipt?.hash ?? tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
