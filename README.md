# ENS Free Trial Subdomain Registrar + Identity Primitive

[![CI status](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/MontrealAI/ens-free-trial-subdomain-registrar?display_name=tag)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 20.19.6](https://img.shields.io/badge/node-20.19.6-339933.svg)](https://nodejs.org/)
[![Legacy registrar live on Ethereum Mainnet](https://img.shields.io/badge/mainnet-live%20(v1.0.0)-3C3C3D.svg)](https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code)

This repository now has two clearly separated tracks:

1. **Current live infrastructure (v1.0.0):** `FreeTrialSubdomainRegistrar` on Ethereum mainnet.
2. **Next flagship contract:** `FreeTrialSubdomainRegistrarIdentity` — a universal ENS-based identity primitive that atomically registers a wrapped subname and mints a soulbound identity NFT.

## What is live today vs next

### Live today (already deployed)
- Contract: `FreeTrialSubdomainRegistrar`
- Mainnet address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified: https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code
- Release: `v1.0.0`

### Next release (prepared in this repo)
- Contract: `FreeTrialSubdomainRegistrarIdentity`
- Mainnet deployment status: **not deployed yet (deployment pending)**
- Canonical contract source: `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

## Identity primitive summary

`FreeTrialSubdomainRegistrarIdentity` keeps registrar invariants and adds identity semantics:
- Atomic wrapped subname registration + NFT mint in one transaction.
- `tokenId = uint256(node)`.
- Soulbound NFT posture (`transfer/approve` disabled, EIP-5192 `locked`).
- Onchain SVG image + onchain JSON metadata.
- Permissionless `syncIdentity(tokenId)` to burn stale/desynced identities.
- `claimIdentity(node)` for legacy/backfill cases where wrapped ownership already exists.

## Product invariants

- Registration remains free.
- Child expiry remains `min(block.timestamp + 30 days, parent effective expiry)`.
- No child grace period / no child self-renewal path.
- Labels: lowercase alphanumeric only, length 8–63.
- First-degree labels only (no dots / no full ENS names as label input).
- No protocol hardcoding of `alpha.agent.agi.eth`.

## Documentation map

- Mainnet deployment history and status: [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- Flagship identity contract doc: [`docs/contracts/free-trial-subdomain-registrar-identity.md`](docs/contracts/free-trial-subdomain-registrar-identity.md)
- Legacy flagship use-case (`alpha.agent.agi.eth`): [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)
- Release process: [`docs/release-process.md`](docs/release-process.md)
- Releases: [`docs/releases/`](docs/releases)

## Install and validate

```bash
npm ci
npm run build
npm test
npm run typecheck
```

## Mainnet operator commands

```bash
# legacy registrar deploy/verify
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:mainnet -- --address 0xYourRegistrarAddress

# identity deploy/verify (next release path)
npm run deploy:identity:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:identity:mainnet -- --address 0xYourIdentityAddress
```
