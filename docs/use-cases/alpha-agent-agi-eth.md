# Flagship Use Case: `alpha.agent.agi.eth`

This walkthrough shows how to run this registrar for the real ENS parent name:

- **Parent name:** `alpha.agent.agi.eth`
- **Parent node (namehash):** `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

> This repository remains generic. `alpha.agent.agi.eth` is a production-style example, not hardcoded protocol logic.

## What you type / What gets created

- `LABEL=12345678` creates `12345678.alpha.agent.agi.eth`
- `LABEL=ethereum` creates `ethereum.alpha.agent.agi.eth`

`label` is always one label only (first-degree child of the parent), never a full ENS name.

---

## Allowed vs Forbidden label inputs

### Allowed
- `12345678`
- `ethereum`

### Forbidden
- `ethereum.12345678` (contains `.`)
- `foo.bar` (contains `.`)
- `12345678.alpha.agent.agi.eth` (full name, not single label)
- `EthEreum` (uppercase)
- `trial-0001` (hyphen)
- `short7` (too short)

Rule: labels must match `[a-z0-9]{8,63}`.

---

## Quick commands (copy/paste)

## 0) Prepare

```bash
npm ci
cp .env.example .env
```

Set at least:

```bash
MAINNET_RPC_URL=...
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
PARENT_NAME=alpha.agent.agi.eth
```

## 1) Deploy registrar

```bash
npm run deploy:mainnet
```

Copy printed `Registrar address` into `.env`:

```bash
REGISTRAR_ADDRESS=0xYourRegistrarAddress
```

## 2) Approve and activate parent

Before this step, in ENS Manager ensure the wrapped parent is locked (`CANNOT_UNWRAP` burned).

```bash
PARENT_NAME=alpha.agent.agi.eth ACTIVE=true npm run setup:parent:mainnet
```

## 3) Register `12345678.alpha.agent.agi.eth`

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrarAddress \
  --parent-name alpha.agent.agi.eth \
  --label 12345678 \
  --owner 0xRecipientAddress
```

## 4) Register `ethereum.alpha.agent.agi.eth`

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrarAddress \
  --parent-name alpha.agent.agi.eth \
  --label ethereum \
  --owner 0xRecipientAddress
```

---

## What expires when

Each child expiry is:

- `min(block.timestamp + 30 days, parent effective expiry)`

Notes:

- Children never receive their own grace period.
- For `.eth` parents, parent grace is used only when computing **parent effective expiry** (subtracting 90 days), and never to extend a child beyond 30 days.

---

## What the subname owner can and cannot do

Subname owner **can**:
- Use the wrapped subname until expiry.
- Use resolver records (if configured at registration).

Subname owner **cannot**:
- Renew / self-extend expiry through this registrar.
- Receive `CAN_EXTEND_EXPIRY` from this registrar.

---

## What the parent owner can still do

Parent owner/operator can:
- Activate/deactivate parent in registrar.
- Continue managing parent-level policy.

Parent owner/operator cannot:
- Make trials longer than 30 days via this registrar.

---

## ENS Manager / ENS app viewing guide

1. Open `https://app.ens.domains`.
2. Search `12345678.alpha.agent.agi.eth` or `ethereum.alpha.agent.agi.eth`.
3. Confirm wrapped status, owner, resolver, and expiry.
4. Compare expiry with registration timestamp to verify 30-day cap behavior.

---

## Troubleshooting

### Error: dotted label / accidental full name input
Use a single label only.

✅ Correct:
- `--parent-name alpha.agent.agi.eth --label 12345678`

❌ Incorrect:
- `--label 12345678.alpha.agent.agi.eth`

### Error: label too short
Use at least 8 characters, e.g. `trial0001`.

### Error: invalid characters / uppercase
Use lowercase `a-z` and digits `0-9` only.

### Error: parent not wrapped / not locked / not approved
- Parent must be wrapped in NameWrapper.
- `CANNOT_UNWRAP` must be burned on parent.
- Registrar must be approved by wrapped parent owner in NameWrapper.

### Error: parent not active
Run:

```bash
PARENT_NAME=alpha.agent.agi.eth ACTIVE=true npm run setup:parent:mainnet
```
