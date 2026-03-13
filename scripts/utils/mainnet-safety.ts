import fs from "node:fs/promises";
import path from "node:path";

import { readFlagValue } from "./cli-flags";

const MAINNET_CONFIRM_PHRASE = "I_UNDERSTAND_MAINNET";

export function requireMainnetBroadcastConfirmation(argv: readonly string[], action: string): void {
  const flagValue = readFlagValue(argv, "confirm-mainnet");
  const envValue = process.env.MAINNET_CONFIRM;
  const provided = flagValue || envValue;

  if (provided === MAINNET_CONFIRM_PHRASE) return;

  throw new Error(
    [
      `Refusing to ${action} without explicit mainnet confirmation.`,
      `Set --confirm-mainnet ${MAINNET_CONFIRM_PHRASE} or MAINNET_CONFIRM=${MAINNET_CONFIRM_PHRASE}.`
    ].join(" ")
  );
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
  verification: {
    command: string;
    status: "pending" | "verified" | "failed";
    verifiedAt?: string;
    explorerUrl?: string;
    notes?: string;
  };
};

export async function writeDeploymentManifest(manifest: DeploymentManifest): Promise<string> {
  const outputDir = path.join(process.cwd(), "deployments", manifest.network);
  await fs.mkdir(outputDir, { recursive: true });

  const fileName = `${manifest.contractName}-${manifest.contractAddress.toLowerCase()}.json`;
  const outputPath = path.join(outputDir, fileName);

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

export function getManifestPath(networkName: string, contractAddress: string, contractName = "FreeTrialSubdomainRegistrar"): string {
  return path.join(
    process.cwd(),
    "deployments",
    networkName,
    `${contractName}-${contractAddress.toLowerCase()}.json`
  );
}
