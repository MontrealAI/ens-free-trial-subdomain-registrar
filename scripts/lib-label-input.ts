const LABEL_PATTERN = /^[a-z0-9]{8,63}$/;

function looksLikeEnsName(input: string): boolean {
  return input.includes(".") && input.toLowerCase().endsWith(".eth");
}

export function validateSingleLabelInput(label: string): void {
  if (label.includes(".")) {
    const extraHint = looksLikeEnsName(label)
      ? " It looks like you passed a full ENS name as --label."
      : "";

    throw new Error(
      `Invalid label: "${label}". Labels must be a single first-degree label only (no dots).${extraHint} ` +
        "Use --parent-name alpha.agent.agi.eth and --label 12345678, not --label 12345678.alpha.agent.agi.eth."
    );
  }

  if (label.length < 8) {
    throw new Error(`Invalid label: "${label}". Labels must be at least 8 characters.`);
  }

  if (label.length > 63) {
    throw new Error(`Invalid label: "${label}". Labels must be at most 63 characters.`);
  }

  if (!LABEL_PATTERN.test(label)) {
    if (label !== label.toLowerCase()) {
      throw new Error(`Invalid label: "${label}". Labels must be lowercase.`);
    }

    throw new Error(
      `Invalid label: "${label}". Labels must be lowercase alphanumeric only ([a-z0-9]).`
    );
  }
}
