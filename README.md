# ENS Free Trial Subdomain Registrar

[![CI status](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/MontrealAI/ens-free-trial-subdomain-registrar?display_name=tag)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js 20.19.6](https://img.shields.io/badge/node-20.19.6-339933.svg)](https://nodejs.org/)
[![Live on Ethereum Mainnet](https://img.shields.io/badge/mainnet-live-3C3C3D.svg)](https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code)

Production-focused ENS subname registrar for **free, non-renewable 30-day wrapped trials**.

## Live mainnet deployment

- **Contract:** `FreeTrialSubdomainRegistrar`
- **Address:** [`0x7aAE649184182A01Ac7D8D5d7873903015C08761`](https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code)
- **Deployment tx:** [`0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a`](https://etherscan.io/tx/0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a)
- **Parent activation tx:** [`0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205`](https://etherscan.io/tx/0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205)
- **Mainnet deployment guide:** [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- **Latest release notes:** [`CHANGELOG.md`](CHANGELOG.md)

## Core behavior (invariants)

- Registration is free.
- Child expiry is always `min(block.timestamp + 30 days, parent effective expiry)`.
- Child receives no grace period of its own.
- For `.eth` parents, grace only impacts parent effective expiry cap and never extends child trial beyond 30 days.
- Child owner is never granted `CAN_EXTEND_EXPIRY` and cannot self-renew through this system.
- Labels are strict: lowercase alphanumeric only, length 8–63, single-label input only (no dotted labels/full names).

## Main docs

- **Mainnet deployment + activation details:** [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- **Flagship operator walkthrough (`alpha.agent.agi.eth`):** [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)
- **Etherscan no-CLI walkthrough:** [`docs/etherscan-web-guide.md`](docs/etherscan-web-guide.md)
- **Release workflow:** [`docs/release-process.md`](docs/release-process.md)
- **Security policy:** [`SECURITY.md`](SECURITY.md)

## Install and validate

```bash
npm ci
npm run build
npm test
npm run typecheck
```

Node.js runtime is pinned to **20.19.6** via `.nvmrc` and `.node-version`.

## Mainnet commands

```bash
MAINNET_CONFIRM=I_UNDERSTAND_MAINNET npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:mainnet -- --address 0x...
REGISTRAR_ADDRESS=0xYourRegistrarAddress MAINNET_CONFIRM=I_UNDERSTAND_MAINNET npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate
npm run register:mainnet -- --help
npm run doctor:mainnet -- --help
```

`deploy:mainnet`, `setup:parent:mainnet`, and state-changing register flows are mainnet-gated and require the explicit `I_UNDERSTAND_MAINNET` confirmation. Parent setup additionally requires `REGISTRAR_ADDRESS`.

## Flagship example

This repository remains generic; the following is a real production example:

- Parent: `alpha.agent.agi.eth`
- Parent node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`
- `LABEL=12345678` => `12345678.alpha.agent.agi.eth`
- `LABEL=ethereum` => `ethereum.alpha.agent.agi.eth`

## Releases

- Tags follow semantic versioning (`vMAJOR.MINOR.PATCH`).
- First stable mainnet release target: **`v1.0.0`**.
- See [`docs/release-process.md`](docs/release-process.md) for the exact maintainer checklist and `gh release` command.
