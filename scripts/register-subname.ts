import { ethers, network } from "hardhat";
import { readFlagValue, hasFlag } from "./utils/cli-flags";
import { validateSingleLabelInput } from "./utils/label-input";
import { resolveParentNodeInput } from "./utils/parent-input";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1n;

function parseRecords(ethersLib: { isHexString: (value: string) => boolean }): string[] {
  const raw = readFlagValue(process.argv, "records") || process.env.RECORDS_JSON || "[]";
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("RECORDS_JSON / --records must be valid JSON.");
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && ethersLib.isHexString(item))) {
    throw new Error("RECORDS_JSON / --records must be a JSON array of hex strings.");
  }

  return value;
}

function printUsage(): void {
  console.log(`Usage:
  npm run register:mainnet -- --registrar 0x... --parent-name alpha.agent.agi.eth --label 12345678 [--owner 0x...] [--resolver 0x...] [--fuses 0] [--records "[]"] --confirm-mainnet I_UNDERSTAND_MAINNET

Important: --label is one label only (first-degree).
Example: --label ethereum creates ethereum.alpha.agent.agi.eth
Do not pass full names to --label (forbidden: --label ethereum.alpha.agent.agi.eth).

Flags can also be provided through .env (see .env.example).
Mainnet safety: requires --confirm-mainnet I_UNDERSTAND_MAINNET (or MAINNET_CONFIRM env).`);
}

function requireAddress(name: string, value: string | undefined, ethersLib: { isAddress: (value: string) => boolean; isHexString?: (value: string) => boolean }): string {
  if (!value || !ethersLib.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast a subname registration transaction");

    const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== MAINNET_CHAIN_ID) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const registrarAddress = requireAddress("REGISTRAR_ADDRESS", readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS, ethers);
  const label = readFlagValue(process.argv, "label") || process.env.LABEL;

  if (!label) {
    printUsage();
    throw new Error("Provide --label or set LABEL.");
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await ethers.provider.getBalance(signerAddress);
  if (signerBalance === 0n) {
    throw new Error("Signer has zero ETH balance. Fund the account for gas before registering.");
  }

  const parentNodeInput = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE;
  const parentNameInput = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME;
  const { parentNode, normalizedParentName } = resolveParentNodeInput(ethers, parentNodeInput, parentNameInput);
  const newOwner = requireAddress("NEW_OWNER", readFlagValue(process.argv, "owner") || process.env.NEW_OWNER || signerAddress, ethers);
  const resolverRaw = readFlagValue(process.argv, "resolver") || process.env.RESOLVER || ethers.ZeroAddress;
  const resolver = requireAddress("RESOLVER", resolverRaw, ethers);
  const ownerControlledFusesRaw = readFlagValue(process.argv, "fuses") || process.env.OWNER_CONTROLLED_FUSES || "0";
  const ownerControlledFuses = Number(ownerControlledFusesRaw);
  const records = parseRecords(ethers);

  if (!Number.isInteger(ownerControlledFuses) || ownerControlledFuses < 0 || ownerControlledFuses > 65535) {
    throw new Error("ownerControlledFuses must be an integer between 0 and 65535.");
  }

  if (resolver === ethers.ZeroAddress && records.length > 0) {
    throw new Error("Resolver is required when records are provided.");
  }

  if (resolver !== ethers.ZeroAddress) {
    const resolverCode = await ethers.provider.getCode(resolver);
    if (resolverCode === "0x") {
      throw new Error(`RESOLVER=${resolver} has no contract bytecode on mainnet.`);
    }
  }

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);

  const code = await ethers.provider.getCode(registrarAddress);
  if (code === "0x") {
    throw new Error(`No contract code found at REGISTRAR_ADDRESS=${registrarAddress}.`);
  }

  validateSingleLabelInput(label, normalizedParentName);

  const isValid = await registrar.validateLabel(label);
  if (!isValid) {
    throw new Error("Do not pass a full ENS name as the label. Use parent alpha.agent.agi.eth and label 12345678, which creates 12345678.alpha.agent.agi.eth. Label must be lowercase alphanumeric, 8-63 chars.");
  }

  const parentActive = await registrar.isParentActive(parentNode);
  if (!parentActive) {
    throw new Error("Parent is not active in this registrar. Ask the operator to run setup:parent:mainnet first.");
  }

  const labelhash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const node = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, labelhash]));
  const currentlyAvailable = await registrar.available(node);
  if (!currentlyAvailable) {
    throw new Error(`Requested subname is unavailable right now: ${node}`);
  }

  const expiry = await registrar.nextExpiry(parentNode);
  const expiryDate = new Date(Number(expiry) * 1000).toISOString();

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Registrar: ${registrarAddress}`);
  console.log(`Parent node: ${parentNode}`);
  if (normalizedParentName) console.log(`Parent name: ${normalizedParentName}`);
  console.log(`Label: ${label}`);
  console.log(`New owner: ${newOwner}`);
  console.log(`Resolver: ${resolver}`);
  console.log(`Owner-controlled fuses: ${ownerControlledFuses}`);
  console.log(`Records count: ${records.length}`);
  console.log(`Expected expiry: ${expiry} (${expiryDate})`);

  console.log("Submitting registration transaction (no ETH should be sent)...");
  const tx = await registrar.register(parentNode, label, newOwner, resolver, ownerControlledFuses, records);
  await tx.wait();


  console.log("Done.");
  console.log(`Subname node: ${node}`);
  if (normalizedParentName) {
    console.log(`Human name: ${label}.${normalizedParentName}`);
  }
  console.log("Next steps:");
  console.log("1) Open app.ens.domains and search the new name to confirm wrapped state and expiry.");
  console.log("2) Share the exact subname with the recipient; remind them this free trial is non-renewable.");
  console.log("3) For another subname, rerun this script with a different --label (single label only).");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
