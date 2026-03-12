# ENS Free Trial Subdomain Registrar

Production-focused ENS subname registrar for **free 30-day wrapped trials** with strict expiry behavior.

## Executive Summary

This system lets anyone register a free wrapped subname under approved parent names. Each child expiry is:

- `min(block.timestamp + 30 days, parent effective expiry)`

The child does **not** receive its own grace period. For `.eth` parents, parent grace is only used when determining parent effective expiry cap.

## Security Model (Important)

- Parent must already be wrapped and locked (`CANNOT_UNWRAP` burned on parent).
- Parent owner (or authorized operator) must approve this registrar on NameWrapper.
- Registrar forces child `CANNOT_UNWRAP` + `PARENT_CANNOT_CONTROL` to prevent trial-bypass via unwrap and to prevent parent takeover.
- Child owner is never granted `CAN_EXTEND_EXPIRY`.
- Registration is free (`register` is non-payable and contract rejects ETH).
- Labels are enforced onchain: lowercase alphanumeric only, 8–63 chars.

## What this repo includes

- Solidity registrar contract (`contracts/FreeTrialSubdomainRegistrar.sol`)
- Mainnet deployment script
- Parent approval/activation script
- Registration script
- Local tests with mocks for NameWrapper behavior
- CI workflow

## Prerequisites

- Node.js 22.10+ (required by Hardhat 3)
- npm
- Mainnet RPC endpoint
- Deployer wallet with ETH for gas
- Parent ENS name already wrapped in ENS NameWrapper

## Install

```bash
npm install
cp .env.example .env
npm run build
npm test
```

## Configure `.env`

Set required values:

```bash
MAINNET_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...
CONFIRM_MAINNET=YES
REGISTRAR_ADDRESS=0x... # after deploy
PARENT_NAME=example.eth
```

Optional override:

```bash
ENS_NAME_WRAPPER=0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## Deployment flow (mainnet)

All mainnet scripts require `CONFIRM_MAINNET=YES` as a deliberate safety guard.

### 1) Deploy registrar

```bash
npm run deploy:mainnet
```

### 2) Lock parent in ENS Manager

Before activation, burn `CANNOT_UNWRAP` on the parent. The script cannot do this for you.

### 3) Approve + activate parent

```bash
npm run setup:parent:mainnet
```

To deactivate later:

```bash
CONFIRM_MAINNET=YES ACTIVE=false npm run setup:parent:mainnet
```

### 4) Register subname trials

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipient
```

### 5) Verify contract

```bash
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## Resolver records

`register` supports optional resolver calls (`records`).

- If records are provided, resolver must be a deployed contract.
- Every record payload must include the child namehash in calldata bytes `[4:36]`.
- Use with care; malformed payloads revert.

## Operational constraints (non-negotiable)

- This is a **free trial registrar**, not paid rent collection.
- Child owners cannot self-extend expiry.
- Childs can still expire and become available again.
- Parent operators still hold operational power by controlling parent-level setup and authorization.

## Troubleshooting

- `ParentNotLocked`: burn `CANNOT_UNWRAP` on parent first.
- `RegistrarNotAuthorised`: run setup script from account that can approve operator for the wrapped parent.
- `InvalidLabelCharacter` / `LabelTooShort`: fix label to `[a-z0-9]{8,63}`.
- `Unavailable`: name currently has unexpired wrapped registration.

## Manual pre-mainnet checklist

- [ ] Contract built and tests pass locally.
- [ ] Parent wrapping and fuse state verified in ENS Manager.
- [ ] Correct NameWrapper address confirmed.
- [ ] Deployer key handled securely (hardware wallet/Safe preferred).
- [ ] Dry run done on test environment/fork.
- [ ] Contract verified after deployment.
- [ ] Monitoring/alerting in place for failed ops transactions.
