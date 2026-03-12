import { network } from "hardhat";
import { readFlagValue, hasFlag } from "./utils/cli-flags.js";
import { validateSingleLabelInput } from "./utils/label-input.js";

const MAINNET_CHAIN_ID = 1n;

function resolveParentNode(ethersLib: typeof import("ethers")): string {
  const parentNode = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE;
  const parentName = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME;

  if (parentNode) {
    if (!ethersLib.isHexString(parentNode, 32)) {
      throw new Error("PARENT_NODE / --parent-node must be a 32-byte hex value.");
    }
    return parentNode;
  }
  if (parentName) return ethersLib.namehash(parentName);

  throw new Error("Provide --parent-name, --parent-node, PARENT_NAME, or PARENT_NODE.");
}

function parseRecords(ethersLib: typeof import("ethers")): string[] {
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
  npm run register:mainnet -- --registrar 0x... --parent-name alpha.agent.agi.eth --label 12345678 [--owner 0x...] [--resolver 0x...] [--fuses 0] [--records "[]"]

Important: --label is one label only (first-degree).
Example: --label ethereum creates ethereum.alpha.agent.agi.eth
Do not pass full names to --label (forbidden: --label ethereum.alpha.agent.agi.eth).

Flags can also be provided through .env (see .env.example).`);
}

function requireAddress(name: string, value: string | undefined, ethersLib: typeof import("ethers")): string {
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

  const { ethers, networkName } = await network.connect();
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

  const parentNode = resolveParentNode(ethers);
  const parentName = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME;
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

  validateSingleLabelInput(label, parentName);

  const isValid = await registrar.validateLabel(label);
  if (!isValid) {
    throw new Error("Label failed onchain validation. Use lowercase letters and numbers only, length 8 to 63.");
  }

  const parentActive = await registrar.activeParents(parentNode);
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

  console.log(`Network: ${networkName}`);
  console.log(`Registrar: ${registrarAddress}`);
  console.log(`Parent node: ${parentNode}`);
  if (parentName) console.log(`Parent name: ${parentName}`);
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
  if (parentName) {
    console.log(`Human name: ${label}.${parentName}`);
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
