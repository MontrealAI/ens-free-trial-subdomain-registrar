import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import { readReleaseArtifact } from "./utils/mainnet-safety";

const CHAIN_ID = 1n;
const WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ROOT_NAME = "alpha.agent.agi.eth";
const ROOT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256) view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32,uint32) view returns (bool)",
  "function canModifyName(bytes32,address) view returns (bool)"
];

function usage() {
  console.log("Usage: npm run doctor:mainnet -- --registrar 0x... --label 12345678");
}

async function main() {
  if (hasFlag(process.argv, "help")) return usage();
  const provider = ethers.provider;
  const net = await provider.getNetwork();
  if (net.chainId !== CHAIN_ID) throw new Error(`Mainnet only. chainId=${net.chainId}`);

  const [signer] = await ethers.getSigners();
  const signerBal = await provider.getBalance(signer.address);
  const wrapperCode = await provider.getCode(WRAPPER);
  const registryCode = await provider.getCode(REGISTRY);
  const artifact = await readReleaseArtifact().catch(() => undefined);

  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const label = readFlagValue(process.argv, "label") || "12345678";

  console.log(`# mainnet doctor`);
  console.log(`chainId: ${net.chainId}`);
  console.log(`rpc: connected`);
  console.log(`signer: ${signer.address}`);
  console.log(`signerBalanceEth: ${ethers.formatEther(signerBal)}`);
  console.log(`wrapperCodePresent: ${wrapperCode !== "0x"}`);
  console.log(`ensRegistryCodePresent: ${registryCode !== "0x"}`);
  console.log(`rootName: ${ROOT_NAME}`);
  console.log(`rootNode: ${ROOT_NODE}`);
  console.log(`rootNamehashMatches: ${ethers.namehash(ROOT_NAME).toLowerCase() === ROOT_NODE.toLowerCase()}`);

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, WRAPPER);
  const [parentOwner, parentFuses, parentExpiry] = await wrapper.getData(ROOT_NODE).catch(() => [ethers.ZeroAddress, 0, 0]);
  const parentLocked = await wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP).catch(() => false);
  const effectiveExpiry = (BigInt(parentFuses) & (1n << 17n)) !== 0n ? Math.max(0, Number(parentExpiry) - 90 * 24 * 60 * 60) : Number(parentExpiry);

  console.log(`parentOwner: ${parentOwner}`);
  console.log(`parentLocked: ${parentLocked}`);
  console.log(`parentExpiry: ${parentExpiry}`);
  console.log(`parentEffectiveExpiry: ${effectiveExpiry}`);

  if (!registrarAddress) {
    console.log("registrarAuthorised: n/a (no registrar provided)");
    console.log(`mode: pre-deploy (no registrar address/artifact)`);
    return;
  }

  const registrarCode = await provider.getCode(registrarAddress);
  console.log(`registrar: ${registrarAddress}`);
  console.log(`registrarCodePresent: ${registrarCode !== "0x"}`);
  if (registrarCode === "0x") return;

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress);
  const authorised = await wrapper.canModifyName(ROOT_NODE, registrarAddress);

  console.log(`contractOwner: ${await registrar.owner()}`);
  console.log(`contractWrapper: ${await registrar.wrapper()}`);
  console.log(`contractEnsRegistry: ${await registrar.ensRegistry()}`);
  console.log(`rootActive: ${await registrar.rootActive()}`);
  console.log(`paused: ${await registrar.paused()}`);
  console.log(`registrarAuthorised: ${authorised}`);

  console.log(`sampleLabel: ${label}`);
  console.log(`sampleLabelValid: ${await registrar.validateLabel(label)}`);
  const p = await registrar.preview(label);
  console.log(`preview.status: ${p.status}`);
  console.log(`preview.fullName: ${p.fullName}`);
  console.log(`preview.available: ${p.availableOut}`);
  console.log(`available: ${await registrar.available(label)}`);

  const phase = !(await registrar.rootActive())
    ? "post-deploy pre-activation"
    : (await registrar.paused())
      ? "post-activation paused"
      : "post-activation ready";
  console.log(`mode: ${phase}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
