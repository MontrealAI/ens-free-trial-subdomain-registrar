# Flagship use case: `alpha.agent.agi.eth` free-trial subnames

This guide shows a production-style operator flow for issuing **first-degree only** free-trial subnames under:

- Parent: `alpha.agent.agi.eth`
- Parent node (namehash): `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

The registrar remains generic. This document is a real-world example of how to run it.

## What you type / What gets created

- `LABEL=12345678` creates `12345678.alpha.agent.agi.eth`
- `LABEL=ethereum` creates `ethereum.alpha.agent.agi.eth`

The `label` input is **one label only**, never a full ENS name.

## Allowed vs forbidden label input

Allowed:

- `12345678`
- `ethereum`

Forbidden (must be rejected):

- `ethereum.12345678`
- `foo.bar`
- `12345678.alpha.agent.agi.eth`
- anything with uppercase, symbols, or length under 8

## Prerequisites

- `.env` created from `.env.example`
- `MAINNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `ETHERSCAN_API_KEY` set
- Parent `alpha.agent.agi.eth` already wrapped
- Parent locked (`CANNOT_UNWRAP` burned)

Set these in `.env`:

```bash
PARENT_NAME=alpha.agent.agi.eth
# optional equivalent reference:
# PARENT_NODE=0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e
```

## 1) Deploy registrar

```bash
npm run deploy:mainnet
```

Copy the printed registrar address into:

```bash
REGISTRAR_ADDRESS=0xYourRegistrarAddress
```

## 2) Approve and activate parent

```bash
npm run setup:parent:mainnet
```

This script checks mainnet chain id, wrapper bytecode, registrar bytecode, approval state, and parent lock state before activation.

## 3) Register `12345678.alpha.agent.agi.eth`

```bash
npm run register:mainnet -- \
  --registrar "$REGISTRAR_ADDRESS" \
  --parent-name alpha.agent.agi.eth \
  --label 12345678
```

## 4) Register `ethereum.alpha.agent.agi.eth`

```bash
npm run register:mainnet -- \
  --registrar "$REGISTRAR_ADDRESS" \
  --parent-name alpha.agent.agi.eth \
  --label ethereum
```

## First-degree-only guardrails

The flow enforces first-degree labels in two places:

1. **Onchain**: labels are `[a-z0-9]{8,63}` only, so `.` and nested names are invalid.
2. **Script preflight**: `register-subname.ts` rejects dotted / full-name label input with an explicit operator hint.

If you run:

```bash
npm run register:mainnet -- --parent-name alpha.agent.agi.eth --label 12345678.alpha.agent.agi.eth
```

you should get a clear correction to use:

- `--parent-name alpha.agent.agi.eth`
- `--label 12345678`

## What expires when

For each registration:

- child expiry = `min(block.timestamp + 30 days, parent effective expiry)`
- no child grace period is added
- for `.eth` parents, parent grace only affects the parent cap calculation and never extends the child beyond 30 days

## What the subname owner can and cannot do

Can:

- hold and use the wrapped subname during its valid trial period

Cannot:

- self-renew to extend expiry via this registrar flow
- bypass expiry cap beyond 30 days

## What the parent owner can still do

Can:

- activate/deactivate parent in registrar
- decide operator process and registration policy offchain

Still required:

- keep parent wrapped and locked
- keep registrar approved in NameWrapper

## How to view in ENS Manager / ENS App

After registration:

1. Open ENS Manager / ENS App.
2. Search the full created name (for example `12345678.alpha.agent.agi.eth`).
3. Confirm owner, resolver, fuses, and expiry align with script output.

## Troubleshooting

- **Dotted label** (`ethereum.12345678`): rejected. Use a single label only.
- **Accidental full ENS name in label**: rejected. Keep full parent in `--parent-name`; keep one label in `--label`.
- **Short label** (`short7`): rejected (minimum 8 chars).
- **Invalid characters / uppercase** (`TrialPass8`, `trial-pass8`): rejected.
- **Parent not wrapped / locked / approved**: setup script fails closed with clear errors.
- **Parent inactive**: run `npm run setup:parent:mainnet` with `ACTIVE=true`.
