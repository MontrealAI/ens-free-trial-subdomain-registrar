import { ethers, run } from "hardhat";

import { readFlagValue } from "./utils/cli-flags";
import { getManifestPath, readDeploymentManifest, updateDeploymentManifest } from "./utils/mainnet-safety";

async function main() {
  const address = readFlagValue(process.argv, "address");
  if (!address || !ethers.isAddress(address)) throw new Error("--address is required");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 1n) throw new Error(`This script is mainnet-only. Connected chainId=${chainId.toString()}.`);

  const manifestPath = getManifestPath("mainnet", address, "FreeTrialSubdomainRegistrarIdentity");
  const manifest = await readDeploymentManifest(manifestPath);
  const constructorArgs = manifest.constructorArgs;

  await run("verify:verify", {
    address,
    constructorArguments: constructorArgs
  });

  await updateDeploymentManifest(manifestPath, (current) => ({
    ...current,
    verification: {
      ...current.verification,
      status: "verified",
      verifiedAt: new Date().toISOString(),
      explorerUrl: `https://etherscan.io/address/${address}#code`
    }
  }));

  console.log(`Verified: https://etherscan.io/address/${address}#code`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
