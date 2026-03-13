import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";

const CHAIN_ID = 1n;
const WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const PARENT_NAME = "alpha.agent.agi.eth";
const PARENT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32,uint32) view returns (bool)",
  "function canModifyName(bytes32,address) view returns (bool)"
];

function usage() {
  console.log("Usage: npm run doctor:mainnet -- --registrar 0x... --label 12345678 --parent-name alpha.agent.agi.eth");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  const provider = ethers.provider;
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) throw new Error(`Mainnet only, found chainId=${network.chainId}`);

  const [signer] = await ethers.getSigners();
  const balance = await provider.getBalance(signer.address);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  const label = readFlagValue(process.argv, "label") || "12345678";
  const parentName = readFlagValue(process.argv, "parent-name") || PARENT_NAME;

  console.log(`chainId: ${network.chainId}`);
  console.log(`rpc: connected`);
  console.log(`deployer: ${signer.address}`);
  console.log(`deployerBalanceEth: ${ethers.formatEther(balance)}`);
  console.log(`wrapper: ${WRAPPER}`);
  console.log(`registry: ${REGISTRY}`);
  console.log(`parentName: ${parentName}`);
  console.log(`parentNode: ${PARENT_NODE}`);
  console.log(`namehashMatches: ${ethers.namehash(parentName).toLowerCase() === PARENT_NODE.toLowerCase()}`);

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, WRAPPER);
  const [parentOwner] = await wrapper.getData(PARENT_NODE);
  const parentLocked = await wrapper.allFusesBurned(PARENT_NODE, CANNOT_UNWRAP);
  console.log(`parentWrappedOwner: ${parentOwner}`);
  console.log(`parentLocked: ${parentLocked}`);

  if (!registrarAddress) return console.log("registrar: not provided, skipping registrar checks");

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress);
  console.log(`registrar: ${registrarAddress}`);
  console.log(`registrarCanModifyParent: ${await wrapper.canModifyName(PARENT_NODE, registrarAddress)}`);
  console.log(`paused: ${await registrar.paused()}`);
  console.log(`rootActive: ${await registrar.rootActive()}`);
  console.log(`labelValid: ${await registrar.validateLabel(label)}`);
  const preview = await registrar.preview(label);
  console.log(`preview.fullName: ${preview[0]}`);
  console.log(`preview.node: ${preview[1]}`);
  console.log(`preview.expectedExpiry: ${preview[3]}`);
  console.log(`preview.available: ${preview[4]}`);
  console.log(`available: ${await registrar.available(label)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
