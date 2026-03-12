import { ethers, network } from "hardhat";

import { readFlagValue, hasFlag } from "./utils/cli-flags";
import { resolveParentNodeInput } from "./utils/parent-input";
import { requireMainnetBroadcastConfirmation } from "./utils/mainnet-safety";

const MAINNET_CHAIN_ID = 1;
const DEFAULT_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const CANNOT_UNWRAP = 1n;

type ParentAction = "activate" | "deactivate" | "remove";

const WRAPPER_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
  "function allFusesBurned(bytes32 node, uint32 fuseMask) external view returns (bool)",
  "function getData(uint256 id) external view returns (address owner, uint32 fuses, uint64 expiry)"
];

function requireAddress(name: string, value: string | undefined, ethersLib: { isAddress: (value: string) => boolean; isHexString?: (value: string) => boolean }): string {
  if (!value || !ethersLib.isAddress(value)) {
    throw new Error(`${name} must be set to a valid address.`);
  }
  return value;
}

function parseAction(raw: string | undefined): ParentAction {
  const explicitAction = raw || process.env.PARENT_ACTION;
  if (explicitAction) {
    const value = explicitAction.toLowerCase();
    if (value !== "activate" && value !== "deactivate" && value !== "remove") {
      throw new Error(`PARENT_ACTION / --action must be activate, deactivate, or remove. Received: ${value}`);
    }
    return value;
  }

  const legacyActive = process.env.ACTIVE;
  if (legacyActive !== undefined) {
    const normalized = legacyActive.toLowerCase();
    if (normalized === "true") {
      console.warn("[setup:parent:mainnet] ACTIVE=true detected with no --action/PARENT_ACTION. Using action=activate (legacy fallback).");
      return "activate";
    }
    if (normalized === "false") {
      console.warn("[setup:parent:mainnet] ACTIVE=false detected with no --action/PARENT_ACTION. Using action=deactivate (legacy fallback).");
      return "deactivate";
    }

    throw new Error(
      `ACTIVE must be true or false when used as a legacy fallback. Received: ${legacyActive}. Prefer --action activate|deactivate|remove.`
    );
  }

  return "activate";
}

function printUsage(): void {
  console.log(`Usage:
  npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET [--action activate|deactivate|remove] [--parent-name example.eth | --parent-node 0x...]

Required inputs:
  REGISTRAR_ADDRESS=0x... (or --registrar is not supported in this script)

Optional inputs:
  ENS_NAME_WRAPPER=0x... (defaults to mainnet NameWrapper)
  PARENT_ACTION=activate|deactivate|remove (default activate)
  ACTIVE=true|false (legacy env fallback only when --action/PARENT_ACTION is unset; --active flag is rejected)
  MAINNET_CONFIRM=I_UNDERSTAND_MAINNET (env alternative)

Safety notes:
  - Activation requires parent to be wrapped, locked (CANNOT_UNWRAP burned), and registrar-approved.
  - Deactivate/remove stop NEW mints only. Existing subnames stay valid until their expiry.
  - Approval flow is only executed for action=activate.
  - If both parent name and parent node are supplied, they must match exactly.`);
}


async function main() {
  if (hasFlag(process.argv, "help")) {
    printUsage();
    return;
  }

  requireMainnetBroadcastConfirmation(process.argv, "broadcast parent lifecycle transactions");

  if (hasFlag(process.argv, "active")) {
    throw new Error(
      "--active is deprecated and no longer accepted. Use --action activate|deactivate|remove (or PARENT_ACTION env)."
    );
  }

  const wrapperAddress = requireAddress("ENS_NAME_WRAPPER", process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER, ethers);
  const registrarAddress = requireAddress("REGISTRAR_ADDRESS", process.env.REGISTRAR_ADDRESS, ethers);

  const action = parseAction(readFlagValue(process.argv, "action"));
  const parentNodeInput = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE;
  const parentNameInput = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME;
  const { parentNode, normalizedParentName } = resolveParentNodeInput(ethers, parentNodeInput, parentNameInput);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== BigInt(MAINNET_CHAIN_ID)) {
    throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);
  }

  const wrapperCode = await ethers.provider.getCode(wrapperAddress);
  if (wrapperCode === "0x") {
    throw new Error(`ENS_NAME_WRAPPER=${wrapperAddress} has no contract bytecode on mainnet.`);
  }

  const registrarCode = await ethers.provider.getCode(registrarAddress);
  if (registrarCode === "0x") {
    throw new Error(`REGISTRAR_ADDRESS=${registrarAddress} has no contract bytecode on mainnet.`);
  }

  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const signerBalance = await ethers.provider.getBalance(signerAddress);
  if (signerBalance === 0n) {
    throw new Error("Signer has zero ETH balance. Fund the account for gas before setup.");
  }

  const wrapper = await ethers.getContractAt(WRAPPER_ABI, wrapperAddress, signer);
  const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrar", registrarAddress, signer);

  const configuredWrapper = await registrar.wrapper();
  if (configuredWrapper.toLowerCase() !== wrapperAddress.toLowerCase()) {
    throw new Error(
      `Registrar wrapper mismatch: registrar points to ${configuredWrapper} but ENS_NAME_WRAPPER is ${wrapperAddress}. Refusing to proceed.`
    );
  }

  const [parentOwner] = await wrapper.getData(parentNode);
  const parentLocked = await wrapper.allFusesBurned(parentNode, CANNOT_UNWRAP);
  const alreadyApproved = await wrapper.isApprovedForAll(parentOwner, registrarAddress);
  const signerIsParentOwner = parentOwner.toLowerCase() === signerAddress.toLowerCase();

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${chainId.toString()}`);
  console.log(`Signer: ${signerAddress}`);
  console.log(`Signer ETH balance: ${ethers.formatEther(signerBalance)} ETH`);
  console.log(`Parent node: ${parentNode}`);
  if (normalizedParentName) console.log(`Parent name: ${normalizedParentName}`);
  console.log(`Wrapped parent owner: ${parentOwner}`);
  console.log(`Parent locked: ${parentLocked}`);
  console.log(`Registrar: ${registrarAddress}`);
  console.log(`Action: ${action}`);

  if (action === "activate" && !parentLocked) {
    throw new Error(
      "Parent is not locked. Burn CANNOT_UNWRAP on the parent in ENS Manager before activating this registrar."
    );
  }

  if (action === "activate") {
    if (!alreadyApproved) {
      if (!signerIsParentOwner) {
        throw new Error(
          "Registrar is not approved by the wrapped parent owner. Switch to the parent owner account (or Safe owner flow), approve registrar, and run again."
        );
      }

      console.log("Approving registrar via NameWrapper.setApprovalForAll...");
      const approveTx = await wrapper.setApprovalForAll(registrarAddress, true);
      await approveTx.wait();
      console.log(`Approval confirmed in tx ${approveTx.hash}.`);
    } else {
      console.log("Registrar already approved on NameWrapper by wrapped parent owner.");
    }
  } else {
    console.log("Skipping registrar approval checks for deactivate/remove action.");
  }

  let lifecycleTx;
  if (action === "activate") {
    console.log("Activating parent...");
    lifecycleTx = await registrar.activateParent(parentNode);
  } else if (action === "deactivate") {
    console.log("Deactivating parent...");
    lifecycleTx = await registrar.deactivateParent(parentNode);
  } else {
    console.log("Removing parent config...");
    lifecycleTx = await registrar.removeParent(parentNode);
  }

  await lifecycleTx.wait();

  const isActive = await registrar.isParentActive(parentNode);
  console.log(`Parent active: ${isActive}`);
  console.log(`Lifecycle tx hash: ${lifecycleTx.hash}`);
  console.log("Done.");

  if (action === "activate") {
    console.log("Next steps:");
    if (normalizedParentName) {
      console.log(
        `1) Register a first-degree label only, e.g. --parent-name ${normalizedParentName} --label 12345678 (creates 12345678.${normalizedParentName}).`
      );
    } else {
      console.log("1) Register a first-degree label only (single label, no dots). Example: --label 12345678.");
    }
    console.log("2) Do not pass a full ENS name to --label.");
    console.log("3) Run: npm run register:mainnet -- --help");
  } else {
    console.log("New free mints are now blocked for this parent.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
