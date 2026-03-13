import { ethers } from "hardhat";

import { readFlagValue } from "./utils/cli-flags";
import {
  DEFAULT_ENS_REGISTRY,
  DEFAULT_PARENT_NAME,
  DEFAULT_PARENT_NODE,
  DEFAULT_WRAPPER,
  MAINNET_CHAIN_ID
} from "./utils/mainnet-constants";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const [signer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(signer.address);

  const wrapper = readFlagValue(process.argv, "wrapper") || process.env.ENS_NAME_WRAPPER || DEFAULT_WRAPPER;
  const ensRegistry = readFlagValue(process.argv, "ens-registry") || process.env.ENS_REGISTRY || DEFAULT_ENS_REGISTRY;
  const parentName = readFlagValue(process.argv, "parent-name") || process.env.PARENT_NAME || DEFAULT_PARENT_NAME;
  const parentNode = readFlagValue(process.argv, "parent-node") || process.env.PARENT_NODE || DEFAULT_PARENT_NODE;
  const registrarAddress = readFlagValue(process.argv, "registrar") || process.env.REGISTRAR_ADDRESS;
  const sampleLabel = readFlagValue(process.argv, "sample-label") || "12345678";

  console.log(`chainId: ${chainId.toString()} ${chainId === MAINNET_CHAIN_ID ? "✅" : "❌"}`);
  console.log(`signer: ${signer.address}`);
  console.log(`signerBalanceEth: ${ethers.formatEther(balance)}`);

  const wrapperCode = await ethers.provider.getCode(wrapper);
  const registryCode = await ethers.provider.getCode(ensRegistry);
  console.log(`wrapper (${wrapper}) code: ${wrapperCode !== "0x" ? "present ✅" : "missing ❌"}`);
  console.log(`ensRegistry (${ensRegistry}) code: ${registryCode !== "0x" ? "present ✅" : "missing ❌"}`);

  const resolver = await ethers.provider.call({ to: ensRegistry, data: "0x0178b8bf" + parentNode.slice(2) });
  console.log(`parentName: ${parentName}`);
  console.log(`parentNode: ${parentNode}`);
  console.log(`parentResolverRaw: ${resolver}`);

  if (registrarAddress) {
    const registrar = await ethers.getContractAt("FreeTrialSubdomainRegistrarIdentity", registrarAddress);
    const [rootActive, paused, wrappedData, canModify, locked] = await Promise.all([
      registrar.rootActive(),
      registrar.paused(),
      ethers.provider.call({ to: wrapper, data: "0x3b3b57de" }),
      ethers.provider.call({ to: wrapper, data: "0xd8f7ddda" + parentNode.slice(2) + signer.address.slice(2).padStart(64, "0") }),
      ethers.provider.call({ to: wrapper, data: "0xeb8f2b5f" + parentNode.slice(2) + "0".repeat(63) + "1" })
    ]);

    console.log(`registrar: ${registrarAddress}`);
    console.log(`contractPaused: ${paused}`);
    console.log(`rootActive: ${rootActive}`);
    console.log(`parentWrappedDataCall: ${wrappedData}`);
    console.log(`signerCanModifyParent(raw): ${canModify}`);
    console.log(`parentLocked(raw): ${locked}`);

    const preview = await registrar.preview(sampleLabel);
    const available = await registrar.available(sampleLabel);
    console.log(`sampleLabel: ${sampleLabel}`);
    console.log(`preview.fullName: ${preview[0]}`);
    console.log(`preview.node: ${preview[1]}`);
    console.log(`preview.tokenId: ${preview[2].toString()}`);
    console.log(`preview.expectedExpiry: ${preview[3].toString()}`);
    console.log(`preview.wrappedOwner: ${preview[5]}`);
    console.log(`preview.resolver: ${preview[6]}`);
    console.log(`available: ${available}`);
  } else {
    console.log("registrar: (not provided) - skipping contract-level checks");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
