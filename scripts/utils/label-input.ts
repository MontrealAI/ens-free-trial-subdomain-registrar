const LABEL_REGEX = /^[a-z0-9]{8,63}$/;

export function validateSingleLabelInput(label: string): void {
  if (label.includes(".")) {
    throw new Error(
      [
        `Invalid label "${label}": labels must be a single first-degree label with no dots. Do not pass a full ENS name as --label.`,
        "Use --label <single-label>.",
        "Example: --label 12345678 (creates 12345678.alpha.agent.agi.eth)."
      ].join(" ")
    );
  }

  if (label.length < 8) {
    throw new Error(`Invalid label "${label}": too short. Use 8-63 lowercase alphanumeric characters.`);
  }

  if (label.length > 63) {
    throw new Error(`Invalid label "${label}": too long. Use 8-63 lowercase alphanumeric characters.`);
  }

  if (!LABEL_REGEX.test(label)) {
    throw new Error(
      `Invalid label "${label}": only lowercase letters (a-z) and numbers (0-9) are allowed; no spaces, symbols, or uppercase.`
    );
  }
}
