import { expect } from "chai";
import { hasFlag, readFlagValue } from "../scripts/utils/cli-flags";

describe("cli flag parsing", function () {
  it("reads normal flag values", function () {
    const argv = ["node", "script", "--label", "trialpass8"];
    expect(readFlagValue(argv, "label")).to.equal("trialpass8");
    expect(hasFlag(argv, "label")).to.equal(true);
  });

  it("returns undefined for missing flags", function () {
    const argv = ["node", "script"];
    expect(readFlagValue(argv, "label")).to.equal(undefined);
    expect(hasFlag(argv, "label")).to.equal(false);
  });

  it("throws when a flag is passed without a value", function () {
    const argv = ["node", "script", "--label", "--confirm-mainnet", "I_UNDERSTAND_MAINNET"];
    expect(() => readFlagValue(argv, "label")).to.throw("Flag --label requires a value.");
  });
});
