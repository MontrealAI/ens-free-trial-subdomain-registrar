#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function runNpm(args) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.status == null) {
    process.exit(1);
  }
}

function findLatestManifest() {
  const dir = path.join(process.cwd(), "deployments", "mainnet");
  const files = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.startsWith("FreeTrialSubdomainRegistrar-") && fileName.endsWith(".json"));

  if (files.length === 0) {
    throw new Error("No deployment manifest found in deployments/mainnet");
  }

  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);

  const manifestPath = path.join(dir, files[0]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (!manifest.contractAddress) {
    throw new Error(`Manifest missing contractAddress: ${manifestPath}`);
  }

  return { manifestPath, contractAddress: manifest.contractAddress };
}

function main() {
  const deployArgs = process.argv.slice(2);

  if (deployArgs.includes("--help")) {
    console.log(`Usage:
  npm run deploy-and-verify:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET

This command:
  1) runs deploy:mainnet with forwarded CLI args
  2) finds the latest deployments/mainnet manifest
  3) runs verify:mainnet using manifest contract address + constructor args`);
    return;
  }

  runNpm(["run", "deploy:mainnet", "--", ...deployArgs]);

  const { manifestPath, contractAddress } = findLatestManifest();
  console.log(`Using manifest: ${manifestPath}`);

  runNpm([
    "run",
    "verify:mainnet",
    "--",
    "--address",
    contractAddress,
    "--manifest",
    manifestPath
  ]);
}

main();
