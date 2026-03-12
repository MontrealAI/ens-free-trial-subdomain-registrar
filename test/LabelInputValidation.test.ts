import { expect } from "chai";
import { validateSingleLabelInput } from "../scripts/utils/label-input";

describe("script label validation", function () {
  it("accepts valid first-degree labels", function () {
    expect(() => validateSingleLabelInput("12345678", "alpha.agent.agi.eth")).to.not.throw();
    expect(() => validateSingleLabelInput("ethereum", "alpha.agent.agi.eth")).to.not.throw();
  });

  it("rejects dotted label input with guidance", function () {
    expect(() => validateSingleLabelInput("ethereum.12345678", "alpha.agent.agi.eth")).to.throw(
      "single first-degree label with no dots"
    );
  });

  it("rejects full ENS name passed as label", function () {
    expect(() => validateSingleLabelInput("12345678.alpha.agent.agi.eth", "alpha.agent.agi.eth")).to.throw(
      "Use --parent-name alpha.agent.agi.eth and --label <single-label>."
    );
  });

  it("rejects uppercase, short labels, and symbols", function () {
    expect(() => validateSingleLabelInput("Ethereum", "alpha.agent.agi.eth")).to.throw("only lowercase letters");
    expect(() => validateSingleLabelInput("short7", "alpha.agent.agi.eth")).to.throw("too short");
    expect(() => validateSingleLabelInput("trial-0001", "alpha.agent.agi.eth")).to.throw("only lowercase letters");
  });
});
