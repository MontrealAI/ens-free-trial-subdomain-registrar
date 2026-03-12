import { network } from "hardhat";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function readFlag(name: string): string | undefined {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function resolveParentNode(ethersLib: typeof import("ethers")): string {
  const parentNode = readFlag("parent-node") || process.env.PARENT_NODE;
  const parentName = readFlag("parent-name") || process.env.PARENT_NAME;

  if (parentNode) return parentNode;
  if (parentName) return ethersLib.namehash(parentName);

  throw new Error("Provide --parent-name, --parent-node, PARENT_NAME, or PARENT_NODE.");
}

function parseRecords(ethersLib: typeof import("ethers")): string[] {
  const raw = readFlag("records") || process.env.RECORDS_JSON || "[]";
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
  npm run register:mainnet -- --registrar 0x... --parent-name example.eth --label trialpass8 [--owner 0x...] [--resolver 0x...] [--fuses 0] [--records "[]"]

Flags can also be provided through .env (see .env.example).`);
}

function requireAddress(name: string, value: string | undefined, ethersLib: typeof import("ethers")): string {
  if (!value || !ethersLib.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

const { ethers, networkName } = await network.connect();

async function main() {
  if (hasFlag("help")) {
    printUsage();
    return;
  }

  const registrarAddress = requireAddress("REGISTRAR_ADDRESS", readFlag("registrar") || process.env.REGISTRAR_ADDRESS, ethers);
  const label = readFlag("label") || process.env.LABEL;

  if (!label) {
    printUsage();
    throw new Error("Provide --label or set LABEL.");
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  const parentNode = resolveParentNode(ethers);
  const parentName = readFlag("parent-name") || process.env.PARENT_NAME;
  const newOwner = requireAddress("NEW_OWNER", readFlag("owner") || process.env.NEW_OWNER || signerAddress, ethers);
  const resolverRaw = readFlag("resolver") || process.env.RESOLVER || ethers.ZeroAddress;
  const resolver = requireAddress("RESOLVER", resolverRaw, ethers);
  const ownerControlledFusesRaw = readFlag("fuses") || process.env.OWNER_CONTROLLED_FUSES || "0";
  const ownerControlledFuses = Number(ownerControlledFusesRaw);
  const records = parseRecords(ethers);

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

  const node = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32"], [parentNode, ethers.keccak256(ethers.toUtf8Bytes(label))])
  );

  console.log("Done.");
  console.log(`Subname node: ${node}`);
  if (parentName) {
    console.log(`Human name: ${label}.${parentName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
