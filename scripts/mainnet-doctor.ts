import { network } from "hardhat";

import { readFlagValue, hasFlag } from "./utils/cli-flags.js";
import { resolveParentNodeInput } from "./utils/parent-input.js";
import { validateSingleLabelInput } from "./utils/label-input.js";

const MAINNET_CHAIN_ID = 1n;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const CANNOT_UNWRAP = 1n;

const WRAPPER_ABI = [
  "function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry)",
  "function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool)",
  "function isApprovedForAll(address account, address operator) external view returns (bool)"
] as const;

function requireAddress(name: string, value: string | undefined, ethersLib: typeof import("ethers")): string {
  if (!value || !ethersLib.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function printUsage(): void {
  console.log(`Usage:
  npm run doctor:mainnet -- [--registrar 0x...] [--parent-name example.eth | --parent-node 0x...] [--label trialpass8]

Read-only preflight checks for operators (no transactions are sent).

Checks performed:
  - connected network and chain id (must be mainnet)
  - signer availability and ETH balance
  - ENS NameWrapper code at ENS_NAME_WRAPPER (or default)
  - registrar code and wrapper wiring (if registrar is provided)
  - parent wrapping/lock/approval/activation (if parent + registrar are provided)
  - label format guardrails (if --label is provided)`);
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  const { ethers, networkName } = await network.connect();
  const provider = ethers.provider;
  const chainId = (await provider.getNetwork()).chainId;

  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await provider.getBalance(signerAddress);

  const wrapperAddress = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
  const wrapperCode = await provider.getCode(wrapperAddress);
  if (wrapperCode === "0x") {
    throw new Error(`ENS_NAME_WRAPPER=${wrapperAddress} has no contract bytecode on mainnet.`);
  }

  const registrarAddressInput = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  const registrarAddress = registrarAddressInput ? requireAddress("REGISTRAR_ADDRESS", registrarAddressInput, ethers) : undefined;
  const parentNodeInput = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE;
  const parentNameInput = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME;
  const label = readFlagValue(process.argv, "label") || process.env.LABEL;

  console.log(`Network: ${networkName}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Signer: ${signerAddress}`);
  console.log(`Signer ETH balance: ${ethers.formatEther(signerBalance)} ETH`);
  console.log(`ENS NameWrapper: ${wrapperAddress}`);

  if (label) {
    validateSingleLabelInput(label, parentNameInput);
    console.log(`Label preflight: ${label} (valid single first-degree label)`);
  }

  if (!registrarAddress) {
    console.log("Registrar check skipped: provide --registrar or REGISTRAR_ADDRESS to run registrar/parent checks.");
    return;
  }

  const registrarCode = await provider.getCode(registrarAddress);
  if (registrarCode === "0x") {
    throw new Error(`REGISTRAR_ADDRESS=${registrarAddress} has no contract bytecode on mainnet.`);
  }

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);
  const configuredWrapper = await registrar.wrapper();
  if (configuredWrapper.toLowerCase() !== wrapperAddress.toLowerCase()) {
    throw new Error(
      `Registrar wrapper mismatch: registrar points to ${configuredWrapper} but ENS_NAME_WRAPPER is ${wrapperAddress}.`
    );
  }

  console.log(`Registrar: ${registrarAddress}`);
  console.log("Registrar wrapper wiring: OK");

  if (!parentNodeInput && !parentNameInput) {
    console.log("Parent checks skipped: provide --parent-name/--parent-node (or PARENT_NAME/PARENT_NODE) for parent preflight.");
    return;
  }

  const { parentNode, normalizedParentName } = resolveParentNodeInput(ethers, parentNodeInput, parentNameInput);
  const wrapper = await ethers.getContractAt(WRAPPER_ABI, wrapperAddress, signer);
  const [parentOwner] = await wrapper.getData(parentNode);
  if (parentOwner === ethers.ZeroAddress) {
    throw new Error(`Parent ${parentNode} appears unwrapped or empty in NameWrapper.getData.`);
  }

  const parentLocked = await wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP);
  const approved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
  const parentActive = await registrar.activeParents(parentNode);

  console.log(`Parent node: ${parentNode}`);
  if (normalizedParentName) console.log(`Parent name: ${normalizedParentName}`);
  console.log(`Wrapped parent owner: ${parentOwner}`);
  console.log(`Parent locked: ${parentLocked}`);
  console.log(`Registrar approved in NameWrapper: ${approved}`);
  console.log(`Parent active in registrar: ${parentActive}`);

  if (parentActive) {
    const nextExpiry = await registrar.nextExpiry(parentNode);
    console.log(`Next trial expiry preview: ${nextExpiry.toString()} (${new Date(Number(nextExpiry) * 1000).toISOString()})`);
  }

  console.log("Doctor preflight complete (read-only). No transactions were sent.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
