export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

export function readFlagValue(argv: readonly string[], name: string): string | undefined {
  const key = `--${name}`;
  const index = argv.indexOf(key);
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Flag ${key} requires a value.`);
  }

  return value;
}
