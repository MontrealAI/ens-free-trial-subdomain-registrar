import { isAddress } from "ethers";
import { network } from "hardhat";

function readFlag(name: string): string | undefined {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function resolveParentNode(ethersLib: typeof import("ethers")): string {
  const parentNode = readFlag("parent-node") || process.env.PARENT_NODE;
  const parentName = readFlag("parent-name") || process.env.PARENT_NAME;

  if (parentNode && parentNode !== "") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(parentNode)) {
      throw new Error(`--parent-node / PARENT_NODE must be a bytes32 hex value. Received: ${parentNode}`);
    }

    return parentNode;
  }

  if (parentName && parentName !== "") return ethersLib.namehash(parentName.trim().toLowerCase());

  throw new Error("Provide --parent-name, --parent-node, PARENT_NAME, or PARENT_NODE.");
}

function parseRecords(): string[] {
  const raw = readFlag("records") || process.env.RECORDS_JSON || "[]";

  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && /^0x[0-9a-fA-F]*$/.test(item))) {
      throw new Error();
    }

    return value;
  } catch {
    throw new Error("RECORDS_JSON / --records must be a JSON array of hex strings.");
  }
}

const { ethers, networkName } = await network.connect();

async function main() {
  if (networkName !== "mainnet") {
    throw new Error(`This script is intended for --network mainnet. Received: ${networkName}`);
  }

  const registrarAddress = readFlag("registrar") || process.env.REGISTRAR_ADDRESS;
  const labelRaw = readFlag("label") || process.env.LABEL;

  if (!registrarAddress || !isAddress(registrarAddress)) {
    throw new Error("Provide --registrar or set REGISTRAR_ADDRESS to a valid address.");
  }

  if (!labelRaw) throw new Error("Provide --label or set LABEL.");
  const label = labelRaw.trim().toLowerCase();

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  const parentNode = resolveParentNode(ethers);
  const parentName = readFlag("parent-name") || process.env.PARENT_NAME;
  const newOwner = readFlag("owner") || process.env.NEW_OWNER || signerAddress;
  const resolver = readFlag("resolver") || process.env.RESOLVER || ethers.ZeroAddress;
  const ownerControlledFusesRaw = readFlag("fuses") || process.env.OWNER_CONTROLLED_FUSES || "0";
  const ownerControlledFuses = Number(ownerControlledFusesRaw);
  const records = parseRecords();

  if (!isAddress(newOwner)) {
    throw new Error(`--owner / NEW_OWNER is not a valid address: ${newOwner}`);
  }

  if (!isAddress(resolver)) {
    throw new Error(`--resolver / RESOLVER is not a valid address: ${resolver}`);
  }

  if (!Number.isInteger(ownerControlledFuses) || ownerControlledFuses < 0 || ownerControlledFuses > 65535) {
    throw new Error("ownerControlledFuses must be an integer between 0 and 65535.");
  }

  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);

  const isValid = await registrar.validateLabel(label);
  if (!isValid) {
    throw new Error("Invalid label. Use lowercase letters and numbers only, length 8 to 63.");
  }

  const expiry = await registrar.nextExpiry(parentNode);
  const expiryDate = new Date(Number(expiry) * 1000).toISOString();

  console.log("=== Subname Trial Registration ===");
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

  console.log("Submitting registration transaction...");
  const tx = await registrar.register(parentNode, label, newOwner, resolver, ownerControlledFuses, records);
  const receipt = await tx.wait();

  const node = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes(label))])
  );

  console.log("Done.");
  console.log(`Transaction hash: ${receipt?.hash}`);
  console.log(`Subname node: ${node}`);
  if (parentName) {
    console.log(`Human name: ${label}.${parentName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
