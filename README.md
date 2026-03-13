# ENS Free Trial Subdomain Registrar

[![CI status](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/actions/workflows/ci.yml)
[![Latest GitHub release](https://img.shields.io/github/v/release/MontrealAI/ens-free-trial-subdomain-registrar?display_name=tag)](https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/releases)
[![License: MIT](https://img.shields.io/github/license/MontrealAI/ens-free-trial-subdomain-registrar)](./LICENSE)
[![Node.js 20.19.6](https://img.shields.io/badge/node-20.19.6-339933)](./.nvmrc)
[![Mainnet contract verified on Etherscan](https://img.shields.io/badge/mainnet-verified%20contract-3C3C3D)](https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code)

Production-focused ENS registrar for **free, non-renewable 30-day wrapped subname trials**.

## Live on Ethereum Mainnet

- **Contract:** `FreeTrialSubdomainRegistrar`
- **Address:** `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- **Etherscan (verified):** <https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code>
- **Mainnet deployment guide:** [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- **Flagship operator walkthrough (`alpha.agent.agi.eth`):** [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)
- **Latest releases:** <https://github.com/MontrealAI/ens-free-trial-subdomain-registrar/releases>

## Core behavior

This registrar allows anyone to register wrapped first-degree subnames under approved parents for free.

Child expiry is always:

- `min(block.timestamp + 30 days, parent effective expiry)`

Where parent effective expiry is:

- non-`.eth` parent: parent wrapped expiry from `NameWrapper.getData`
- `.eth` parent (`IS_DOT_ETH`): `parentExpiry - 90 days`

This guarantees:

- children never exceed 30 days,
- children get no independent grace period,
- `.eth` grace only affects parent-cap math,
- child owner is never granted `CAN_EXTEND_EXPIRY`.

## Input semantics (operator safety)

- Label input is **single-label only** (first-degree child semantics).
- Dotted labels are rejected.
- Full ENS names passed as `--label` are rejected.
- Labels must match `[a-z0-9]{8,63}`.

Examples:

- ✅ `--parent-name alpha.agent.agi.eth --label 12345678` → `12345678.alpha.agent.agi.eth`
- ✅ `--parent-name alpha.agent.agi.eth --label ethereum` → `ethereum.alpha.agent.agi.eth`
- ❌ `--label ethereum.alpha.agent.agi.eth`

## Quickstart

### Prerequisites

- Node.js **20.19.6**
- npm
- mainnet RPC URL
- signer wallet with ETH for gas

### Install and validate

```bash
npm ci
npm run build
npm test
npm run typecheck
```

### Mainnet operations

```bash
# deploy
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET

# verify
npm run verify:mainnet -- --address 0x7aAE649184182A01Ac7D8D5d7873903015C08761

# activate parent
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --parent-name alpha.agent.agi.eth

# register a subname
npm run register:mainnet -- --registrar 0x7aAE649184182A01Ac7D8D5d7873903015C08761 --parent-name alpha.agent.agi.eth --label 12345678 --owner 0xRecipientAddress --confirm-mainnet I_UNDERSTAND_MAINNET
```

## Documentation

- Mainnet deployment metadata and verification commands: [`docs/mainnet-deployment.md`](docs/mainnet-deployment.md)
- Flagship operational walkthrough: [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)
- Explorer-first operational flow: [`docs/etherscan-web-guide.md`](docs/etherscan-web-guide.md)
- Maintainer release process: [`docs/release-process.md`](docs/release-process.md)
- Security policy: [`SECURITY.md`](SECURITY.md)

## Safety notes

- State-changing scripts are intentionally mainnet-gated and require explicit confirmation.
- `register` rejects accidental ETH; the contract also rejects direct ETH transfers.
- Deactivating/removing a parent stops **new** mints only; existing issued subnames remain until expiry.
