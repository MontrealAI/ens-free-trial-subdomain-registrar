import { ethers } from "hardhat";

import { hasFlag, readFlagValue } from "./utils/cli-flags";
import {
  ENS_REGISTRY_MAINNET,
  MAINNET_CHAIN_ID,
  NAME_WRAPPER_MAINNET,
  RELEASE_ARTIFACT_PATH,
  ROOT_NAME,
  ROOT_NODE,
  readReleaseArtifact
} from "./utils/mainnet-safety";

const CANNOT_UNWRAP = 1n;
const IS_DOT_ETH = 1n << 17n;
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
  if (net.chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`Mainnet only. Connected chainId=${net.chainId}`);
  }

  const artifact = await readReleaseArtifact().catch(() => undefined);
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS || artifact?.address;
  const sampleLabel = readFlagValue(process.argv, "label") || "12345678";

  let signerAddress: string | undefined;
  try {
    const [signer] = await ethers.getSigners();
    signerAddress = signer?.address;
  } catch {
    signerAddress = undefined;
  }

  console.log("# mainnet doctor (read-only)");
  console.log(`chainId: ${net.chainId}`);
  console.log("rpcConnectivity: ok");

  if (signerAddress) {
    console.log(`signer: ${signerAddress}`);
    console.log(`signerBalanceEth: ${ethers.formatEther(await provider.getBalance(signerAddress))}`);
  } else {
    console.log("signer: n/a (DEPLOYER_PRIVATE_KEY not configured; signer-only checks skipped)");
  }

  const wrapperCode = await provider.getCode(NAME_WRAPPER_MAINNET);
  const registryCode = await provider.getCode(ENS_REGISTRY_MAINNET);
  console.log(`wrapper: ${NAME_WRAPPER_MAINNET}`);
  console.log(`wrapperCodePresent: ${wrapperCode !== "0x"}`);
  console.log(`ensRegistry: ${ENS_REGISTRY_MAINNET}`);
  console.log(`ensRegistryCodePresent: ${registryCode !== "0x"}`);

  const computed = ethers.namehash(ROOT_NAME);
  console.log(`rootName: ${ROOT_NAME}`);
  console.log(`rootNode: ${ROOT_NODE}`);
  console.log(`ethers.namehash(ROOT_NAME): ${computed}`);
  console.log(`rootNamehashMatches: ${computed.toLowerCase() === ROOT_NODE.toLowerCase()}`);

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, NAME_WRAPPER_MAINNET);
  const [parentOwner, parentFuses, parentExpiry] = await wrapper
    .getData(ROOT_NODE)
    .catch(() => [ethers.ZeroAddress, 0n, 0n] as const);
  const parentWrapped = parentOwner !== ethers.ZeroAddress;
  const parentLocked = parentWrapped ? await wrapper.allFusesBurned(ROOT_NODE, CANNOT_UNWRAP) : false;
  const parentIsDotEth = (BigInt(parentFuses) & IS_DOT_ETH) !== 0n;
  const effectiveParentExpiry = parentIsDotEth
    ? Math.max(0, Number(parentExpiry) - 90 * 24 * 60 * 60)
    : Number(parentExpiry);

  console.log(`wrappedParentOwner: ${parentOwner}`);
  console.log(`parentWrapped: ${parentWrapped}`);
  console.log(`parentLocked: ${parentLocked}`);
  console.log(`parentWrapperExpiry: ${parentExpiry}`);
  console.log(`effectiveParentExpiry: ${effectiveParentExpiry}`);

  if (!registrarAddress) {
    console.log("registrar: n/a");
    console.log(`artifact: ${RELEASE_ARTIFACT_PATH} not found (pre-deploy mode)`);
    console.log("mode: pre-deploy");
    return;
  }

  const registrarCode = await provider.getCode(registrarAddress);
  console.log(`registrar: ${registrarAddress}`);
  console.log(`registrarCodePresent: ${registrarCode !== "0x"}`);
  if (registrarCode === "0x") return;

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress);
  const registrarAuthorised = await wrapper.canModifyName(ROOT_NODE, registrarAddress);
  const health = await registrar.rootHealth();
  const json = (_k: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

  console.log(`contractOwner: ${await registrar.owner()}`);
  console.log(`contractWrapper: ${await registrar.wrapper()}`);
  console.log(`contractEnsRegistry: ${await registrar.ensRegistry()}`);
  console.log(`contractRootName: ${await registrar.ROOT_NAME()}`);
  console.log(`contractRootNode: ${await registrar.ROOT_NODE()}`);
  console.log(`rootActive: ${await registrar.rootActive()}`);
  console.log(`paused: ${await registrar.paused()}`);
  console.log(`registrarAuthorisedOnWrapper: ${registrarAuthorised}`);
  console.log(`rootHealth: ${JSON.stringify(health, json, 2)}`);

  console.log(`sampleLabel: ${sampleLabel}`);
  console.log(`sampleLabelValid: ${await registrar.validateLabel(sampleLabel)}`);
  console.log(`sampleAvailable: ${await registrar.available(sampleLabel)}`);
  const preview = await registrar.preview(sampleLabel);
  console.log(`preview: ${JSON.stringify(preview, json, 2)}`);

  const status = Number(preview.status);
  const mode = !registrarAddress
    ? "pre-deploy"
    : !(await registrar.rootActive())
      ? "post-deploy pre-activation"
      : status === 7
        ? "post-deploy parent-unusable"
        : "post-activation ready";
  console.log(`mode: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
