import { expect } from "chai";
import { ethers } from "hardhat";

describe("mainnet constants", function () {
  it("alpha.agent.agi.eth namehash matches canonical parent node", async function () {
    expect(ethers.namehash("alpha.agent.agi.eth")).to.equal(
      "0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e"
    );
  });
});
