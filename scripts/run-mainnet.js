#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/run-mainnet.js <script.ts> [--flag value]');
  process.exit(1);
}

if (!process.env.MAINNET_RPC_URL || process.env.MAINNET_RPC_URL.trim() === '') {
  console.error('Missing MAINNET_RPC_URL. Set MAINNET_RPC_URL in your environment or .env before running mainnet scripts.');
  process.exit(1);
}

const extra = process.argv.slice(3);
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['hardhat', 'run', target, '--network', 'mainnet', '--', ...extra],
  { stdio: 'inherit', env: { ...process.env } }
);

process.exit(result.status ?? 1);
