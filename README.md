# ENS Free Trial Subdomain Registrar

[![CI status](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/MontrealAI/ens-free-trial-subdomain-registrar?display_name=tag)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 20.19.6](https://img.shields.io/badge/node-20.19.6-339933.svg)](https://nodejs.org/)
[![Mainnet live (legacy registrar v1.0.0)](https://img.shields.io/badge/mainnet-live%20legacy%20registrar-3C3C3D.svg)](https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code)

Production ENS tooling now centered on **FreeTrialSubdomainRegistrarIdentity**, a universal ENS-based identity primitive that atomically creates a wrapped subname and soulbound identity NFT (`tokenId = uint256(node)`).

## What is live today vs next release

### Current live release (v1.0.0)
- Contract: `FreeTrialSubdomainRegistrar`
- Address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified: https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code

### Next flagship release (deployment pending)
- Contract: `FreeTrialSubdomainRegistrarIdentity`
- Status: integrated in this repository, **not yet deployed to mainnet in this repo**
- Canonical contract source: `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

## Identity primitive highlights
- Atomic wrapped subname registration + identity mint.
- Soulbound NFT (`transferFrom`, `safeTransferFrom`, approvals revert).
- EIP-5192 `locked()` compatibility.
- Onchain SVG + onchain JSON metadata.
- `claimIdentity` for backfill/migration.
- Permissionless `syncIdentity` for expiry/desync burn.

## Invariants
- Registration remains free.
- Trial expiry is `min(block.timestamp + 30 days, parent effective expiry)`.
- No child grace period; no child self-renew path.
- Labels are single-label lowercase alphanumeric only, 8–63 chars.
- Dotted labels/full names as labels are rejected.

## Docs
- Mainnet deployment status and runbook: [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- Identity flagship contract doc: [`docs/contracts/free-trial-subdomain-registrar-identity.md`](docs/contracts/free-trial-subdomain-registrar-identity.md)
- Legacy registrar release notes: [`docs/releases/v1.0.0.md`](docs/releases/v1.0.0.md)
- Next release draft notes: [`docs/releases/v2.0.0-draft.md`](docs/releases/v2.0.0-draft.md)
- Flagship operator walkthrough (`alpha.agent.agi.eth`): [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)

## Install and validate

```bash
npm ci
npm run build
npm test
npm run typecheck
```

## Mainnet commands

```bash
# Deploy/verify legacy registrar (default operator-safe mode)
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:mainnet -- --address 0xYourRegistrarAddress

# Deploy/verify identity explicitly
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --contract identity
npm run verify:mainnet -- --address 0xYourIdentityAddress --contract identity
```
