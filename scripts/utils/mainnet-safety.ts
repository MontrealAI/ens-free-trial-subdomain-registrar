import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { readFlagValue } from "./cli-flags";

export const MAINNET_CONFIRM_PHRASE = "I_UNDERSTAND_MAINNET";
export const RELEASE_ARTIFACT_PATH = "release-assets/mainnet-free-trial-subdomain-registrar-identity.json";
export const CONSTRUCTOR_ARGS_PATH = "release-assets/mainnet-free-trial-subdomain-registrar-identity.constructor-args.json";

export const CONTRACT_PATH = "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity" as const;
export const ROOT_NAME = "alpha.agent.agi.eth" as const;
export const ROOT_NODE = "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e" as const;
export const MAINNET_CHAIN_ID = 1n;
export const NAME_WRAPPER_MAINNET = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401" as const;
export const ENS_REGISTRY_MAINNET = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

export function requireMainnetBroadcastConfirmation(argv: readonly string[], action: string): void {
  const confirm = readFlagValue(argv, "confirm-mainnet") || process.env.MAINNET_CONFIRM;
  if (confirm === MAINNET_CONFIRM_PHRASE) return;
  throw new Error(
    `Refusing to ${action} without explicit mainnet confirmation. Use --confirm-mainnet ${MAINNET_CONFIRM_PHRASE} or MAINNET_CONFIRM=${MAINNET_CONFIRM_PHRASE}.`
  );
}

export type DeploymentArtifact = {
  chainId: number;
  network: string;
  contractName: "FreeTrialSubdomainRegistrarIdentity";
  contractPath: typeof CONTRACT_PATH;
  address: string;
  deployTxHash: string;
  deployer: string;
  constructorArgs: [string, string];
  wrapper: string;
  ensRegistry: string;
  rootName: typeof ROOT_NAME;
  rootNode: string;
  compilerVersion: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  deployedAt: string;
  gitCommit?: string;
};

export async function artifactExists(): Promise<boolean> {
  try {
    await fs.access(path.join(process.cwd(), RELEASE_ARTIFACT_PATH));
    return true;
  } catch {
    return false;
  }
}

export async function writeReleaseArtifact(artifact: DeploymentArtifact, overwrite = false): Promise<void> {
  const artifactPath = path.join(process.cwd(), RELEASE_ARTIFACT_PATH);
  const constructorPath = path.join(process.cwd(), CONSTRUCTOR_ARGS_PATH);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });

  if (!overwrite && (await artifactExists())) {
    throw new Error(`Artifact already exists at ${RELEASE_ARTIFACT_PATH}. Re-run with --overwrite-artifact to replace it.`);
  }

  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await fs.writeFile(constructorPath, `${JSON.stringify(artifact.constructorArgs, null, 2)}\n`, "utf8");
}

export async function readReleaseArtifact(): Promise<DeploymentArtifact> {
  const raw = await fs.readFile(path.join(process.cwd(), RELEASE_ARTIFACT_PATH), "utf8");
  return JSON.parse(raw) as DeploymentArtifact;
}

export async function readConstructorArgs(): Promise<[string, string]> {
  const raw = await fs.readFile(path.join(process.cwd(), CONSTRUCTOR_ARGS_PATH), "utf8");
  return JSON.parse(raw) as [string, string];
}

export function getGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return undefined;
  }
}
