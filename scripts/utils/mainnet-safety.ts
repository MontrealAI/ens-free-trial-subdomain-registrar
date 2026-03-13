import fs from "node:fs/promises";
import path from "node:path";

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
  contractName: "FreeTrialSubdomainRegistrarIdentity";
  address: string;
  deployTxHash: string;
  constructorArgs: [string, string, string, string];
  wrapper: string;
  ensRegistry: string;
  parentName: string;
  parentNode: string;
  compilerVersion: string;
  optimizer: { enabled: boolean; runs: number };
  deployedAt: string;
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

export type DeploymentManifest = {
  network: string;
  chainId: string;
  deployer: string;
  contractName: string;
  contractAddress: string;
  deploymentTxHash: string;
  blockNumber: number | null;
  constructorArgs: readonly string[];
  timestamp: string;
  buildProfile: string;
  verification: { command: string; status: "pending" | "verified" | "failed"; notes?: string };
};

export function getManifestPath(networkName: string, contractAddress: string, contractName = "FreeTrialSubdomainRegistrar"): string {
  return path.join(process.cwd(), "deployments", networkName, `${contractName}-${contractAddress.toLowerCase()}.json`);
}

export async function writeDeploymentManifest(manifest: DeploymentManifest): Promise<string> {
  const outputPath = getManifestPath(manifest.network, manifest.contractAddress, manifest.contractName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function readDeploymentManifest(manifestPath: string): Promise<DeploymentManifest> {
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw) as DeploymentManifest;
}

export async function updateDeploymentManifest(
  manifestPath: string,
  update: (current: DeploymentManifest) => DeploymentManifest
): Promise<void> {
  const current = await readDeploymentManifest(manifestPath);
  const next = update(current);
  await fs.writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
