import { expect } from "chai";
import { ethers } from "ethers";
import { resolveParentNodeInput } from "../scripts/utils/parent-input.js";

describe("parent input resolution", function () {
  it("derives node from parent name", function () {
    const result = resolveParentNodeInput(ethers, undefined, "alpha.agent.agi.eth");
    expect(result.parentNode).to.equal(ethers.namehash("alpha.agent.agi.eth"));
    expect(result.normalizedParentName).to.equal("alpha.agent.agi.eth");
  });

  it("accepts explicit parent node only", function () {
    const node = ethers.namehash("alpha.agent.agi.eth");
    const result = resolveParentNodeInput(ethers, node, undefined);
    expect(result.parentNode).to.equal(node);
    expect(result.normalizedParentName).to.equal(undefined);
  });

  it("rejects invalid parent node format", function () {
    expect(() => resolveParentNodeInput(ethers, "0x1234", undefined)).to.throw("32-byte hex value");
  });

  it("rejects mismatched parent-name and parent-node inputs", function () {
    const wrongNode = ethers.namehash("example.eth");
    expect(() => resolveParentNodeInput(ethers, wrongNode, "alpha.agent.agi.eth")).to.throw("disagree");
  });

  it("accepts matching parent-name and parent-node inputs", function () {
    const node = ethers.namehash("alpha.agent.agi.eth");
    const result = resolveParentNodeInput(ethers, node, "alpha.agent.agi.eth");
    expect(result.parentNode).to.equal(node);
    expect(result.normalizedParentName).to.equal("alpha.agent.agi.eth");
  });
});
