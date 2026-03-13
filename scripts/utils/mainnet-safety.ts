import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { readFlagValue } from "./cli-flags";

export const MAINNET_CONFIRM_PHRASE = "I_UNDERSTAND_MAINNET";
export const RELEASE_ARTIFACT_PATH = "release-assets/mainnet-free-trial-subdomain-registrar-identity.json";

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
  contractPath: "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity";
  address: string;
  deployTxHash: string;
  deployer: string;
  constructorArgs: [string, string];
  wrapper: string;
  ensRegistry: string;
  rootName: "alpha.agent.agi.eth";
  rootNode: string;
  compilerVersion: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  deployedAt: string;
  gitCommit?: string;
};

export async function writeReleaseArtifact(artifact: DeploymentArtifact): Promise<void> {
  const outputPath = path.join(process.cwd(), RELEASE_ARTIFACT_PATH);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export async function readReleaseArtifact(): Promise<DeploymentArtifact> {
  const raw = await fs.readFile(path.join(process.cwd(), RELEASE_ARTIFACT_PATH), "utf8");
  return JSON.parse(raw) as DeploymentArtifact;
}

export function getGitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return undefined;
  }
}
