const LABEL_REGEX = /^[a-z0-9]{8,63}$/;

export function validateSingleLabelInput(label: string, parentName?: string): void {
  if (label.includes(".")) {
    const parentHint = parentName ?? "<parent-name>";
    throw new Error(
      [
        `Invalid label \"${label}\": labels must be a single first-degree label with no dots. Do not pass a full ENS name as --label.`,
        `Use --parent-name ${parentHint} and --label <single-label>.`,
        `Example: --parent-name ${parentHint} --label 12345678 (creates 12345678.${parentHint}).`
      ].join(" ")
    );
  }

  if (label.length < 8) {
    throw new Error(`Invalid label \"${label}\": too short. Use 8-63 lowercase alphanumeric characters.`);
  }

  if (label.length > 63) {
    throw new Error(`Invalid label \"${label}\": too long. Use 8-63 lowercase alphanumeric characters.`);
  }

  if (!LABEL_REGEX.test(label)) {
    throw new Error(
      `Invalid label \"${label}\": only lowercase letters (a-z) and numbers (0-9) are allowed; no spaces, symbols, or uppercase.`
    );
  }
}

