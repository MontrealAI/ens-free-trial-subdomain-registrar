import { expect } from "chai";
import { artifacts } from "hardhat";

describe("FreeTrialSubdomainRegistrarIdentity bytecode budget", function () {
  it("stays under EIP-170 deployed code size limit", async function () {
    const artifact = await artifacts.readArtifact("FreeTrialSubdomainRegistrarIdentity");
    const deployedBytes = (artifact.deployedBytecode.length - 2) / 2;

    expect(deployedBytes).to.be.lessThan(24_576);
  });
});
