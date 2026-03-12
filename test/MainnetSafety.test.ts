import { expect } from "chai";

import {
  requireMainnetBroadcastConfirmation,
  getManifestPath,
  readDeploymentManifest,
  updateDeploymentManifest,
  writeDeploymentManifest,
  type DeploymentManifest
} from "../scripts/utils/mainnet-safety";

describe("mainnet safety helpers", function () {
  it("accepts explicit confirm flag", function () {
    const original = process.env.MAINNET_CONFIRM;
    delete process.env.MAINNET_CONFIRM;

    expect(() =>
      requireMainnetBroadcastConfirmation(
        ["node", "script", "--confirm-mainnet", "I_UNDERSTAND_MAINNET"],
        "run test"
      )
    ).to.not.throw();

    if (original === undefined) delete process.env.MAINNET_CONFIRM;
    else process.env.MAINNET_CONFIRM = original;
  });

  it("accepts MAINNET_CONFIRM environment variable", function () {
    const original = process.env.MAINNET_CONFIRM;
    process.env.MAINNET_CONFIRM = "I_UNDERSTAND_MAINNET";

    expect(() => requireMainnetBroadcastConfirmation(["node", "script"], "run test")).to.not.throw();

    if (original === undefined) delete process.env.MAINNET_CONFIRM;
    else process.env.MAINNET_CONFIRM = original;
  });

  it("rejects missing confirmation", function () {
    const original = process.env.MAINNET_CONFIRM;
    delete process.env.MAINNET_CONFIRM;

    expect(() => requireMainnetBroadcastConfirmation(["node", "script"], "broadcast tx")).to.throw(
      "Refusing to broadcast tx without explicit mainnet confirmation"
    );

    if (original === undefined) delete process.env.MAINNET_CONFIRM;
    else process.env.MAINNET_CONFIRM = original;
  });

  it("writes deployment manifest to deployments/<network>", async function () {
    const manifest: DeploymentManifest = {
      network: "hardhatMainnet",
      chainId: "1",
      deployer: "0x0000000000000000000000000000000000000001",
      contractName: "FreeTrialSubdomainRegistrar",
      contractAddress: "0x00000000000000000000000000000000000000AA",
      deploymentTxHash: "0xhash",
      blockNumber: 123,
      constructorArgs: ["0x0000000000000000000000000000000000000002"],
      timestamp: new Date().toISOString(),
      buildProfile: "production-solc-0.8.17-optimizer-200",
      verification: {
        command: "npm run verify:mainnet -- ...",
        status: "pending"
      }
    };

    const outputPath = await writeDeploymentManifest(manifest);
    expect(outputPath).to.include("deployments/hardhatMainnet");

    const readBack = await readDeploymentManifest(outputPath);
    expect(readBack.buildProfile).to.equal("production-solc-0.8.17-optimizer-200");

    await updateDeploymentManifest(outputPath, (current) => ({
      ...current,
      verification: {
        ...current.verification,
        status: "verified",
        notes: "test update"
      }
    }));

    const updated = await readDeploymentManifest(outputPath);
    expect(updated.verification.status).to.equal("verified");
    expect(updated.verification.notes).to.equal("test update");
  });

  it("builds deterministic manifest path", function () {
    const path = getManifestPath("mainnet", "0x00000000000000000000000000000000000000AA");
    expect(path).to.include("deployments/mainnet/FreeTrialSubdomainRegistrar-0x00000000000000000000000000000000000000aa.json");
  });
});
