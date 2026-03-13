import { expect } from "chai";
import fs from "node:fs/promises";
import path from "node:path";

import {
  RELEASE_ARTIFACT_PATH,
  requireMainnetBroadcastConfirmation,
  readReleaseArtifact,
  writeReleaseArtifact
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

  it("writes and reads release artifact", async function () {
    const originalPath = path.join(process.cwd(), RELEASE_ARTIFACT_PATH);
    const originalContent = await fs.readFile(originalPath, "utf8").catch(() => undefined);

    await writeReleaseArtifact({
      chainId: 1,
      network: "mainnet",
      contractName: "FreeTrialSubdomainRegistrarIdentity",
      contractPath: "contracts/FreeTrialSubdomainRegistrarIdentity.sol:FreeTrialSubdomainRegistrarIdentity",
      address: "0x00000000000000000000000000000000000000AA",
      deployTxHash: "0xhash",
      deployer: "0x0000000000000000000000000000000000000001",
      constructorArgs: ["0x0000000000000000000000000000000000000002", "0x0000000000000000000000000000000000000003"],
      wrapper: "0x0000000000000000000000000000000000000002",
      ensRegistry: "0x0000000000000000000000000000000000000003",
      rootName: "alpha.agent.agi.eth",
      rootNode: "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e",
      compilerVersion: "0.8.24",
      optimizer: { enabled: true, runs: 200 },
      viaIR: false,
      deployedAt: new Date().toISOString()
    });

    const read = await readReleaseArtifact();
    expect(read.contractName).to.eq("FreeTrialSubdomainRegistrarIdentity");
    expect(read.constructorArgs).to.have.length(2);

    if (originalContent === undefined) await fs.unlink(originalPath).catch(() => undefined);
    else await fs.writeFile(originalPath, originalContent, "utf8");
  });
});
