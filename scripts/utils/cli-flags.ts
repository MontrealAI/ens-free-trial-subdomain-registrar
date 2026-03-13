function envKey(name: string): string {
  return `npm_config_${name.replace(/-/g, "_")}`;
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`) || process.env[envKey(name)] !== undefined;
}

export function readFlagValue(argv: readonly string[], name: string): string | undefined {
  const key = `--${name}`;
  const index = argv.indexOf(key);
  if (index !== -1) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Flag ${key} requires a value.`);
    }
    return value;
  }

  return process.env[envKey(name)];
}
