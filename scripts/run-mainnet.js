#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/run-mainnet.js <script.ts> [--flag value]');
  process.exit(1);
}

const env = { ...process.env };
const extra = process.argv.slice(3);
for (let i = 0; i < extra.length; i++) {
  const arg = extra[i];
  if (!arg.startsWith('--')) continue;
  const key = `npm_config_${arg.slice(2).replace(/-/g, '_')}`;
  const next = extra[i + 1];
  if (next && !next.startsWith('--')) {
    env[key] = next;
    i++;
  } else {
    env[key] = 'true';
  }
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['hardhat', 'run', target, '--network', 'mainnet'],
  { stdio: 'inherit', env }
);

process.exit(result.status ?? 1);
