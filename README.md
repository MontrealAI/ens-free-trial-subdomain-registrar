# ENS Free Trial Subdomain Registrar

Production-focused ENS subname registrar for **free, non-renewable 30-day wrapped trials**.

## 1) What this does

This registrar allows anyone to register a wrapped subname under approved parent names for free.

The child expiry is always:

- `min(block.timestamp + 30 days, parent effective expiry)`

Where **parent effective expiry** means:

- For non-`.eth` parents: the wrapped parent expiry from `NameWrapper.getData`.
- For `.eth` parents (`IS_DOT_ETH` fuse set): `parentExpiry - 90 days`.

This ensures:

- child trial is never longer than 30 days,
- child never receives its own grace period,
- `.eth` grace only affects parent-cap calculations.

## 2) Security model and invariants

- Parent must be wrapped and locked (`CANNOT_UNWRAP` burned on the parent).
- Registrar must be approved as NameWrapper operator for the wrapped parent owner.
- Registrar enforces child fuses:
  - always `CANNOT_UNWRAP`
  - always `PARENT_CANNOT_CONTROL`
  - plus optional **owner-controlled** fuses from caller
- Registrar does **not** grant `CAN_EXTEND_EXPIRY`.
- Child owner cannot self-renew / self-extend through this system.
- Registration is free (`register` reverts if any ETH is sent; contract also rejects direct ETH transfers).
- Label validation is onchain and strict: lowercase alphanumeric only, length 8–63.

## 3) Repository layout

- `contracts/FreeTrialSubdomainRegistrar.sol` — registrar contract
- `scripts/deploy-mainnet.ts` — mainnet deploy
- `scripts/approve-and-setup-parent.ts` — approve + activate/deactivate parent
- `scripts/register-subname.ts` — operator registration utility
- `test/FreeTrialSubdomainRegistrar.test.ts` — contract tests with mocks
- `.github/workflows/ci.yml` — CI for build/test/typecheck

## 4) Prerequisites

- Node.js **22.10+** (required by this repo and Hardhat 3 config)
- npm
- Ethereum mainnet RPC URL
- Deployer/operator wallet with ETH for gas
- Parent ENS name already wrapped in NameWrapper

## 5) Install and local validation

```bash
npm ci
cp .env.example .env
npm run build
npm test
npm run typecheck
```

## 6) Environment configuration

Copy `.env.example` and set:

```bash
MAINNET_RPC_URL=...
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...

# set after deployment
REGISTRAR_ADDRESS=0x...

# choose one
PARENT_NAME=example.eth
# PARENT_NODE=0x...
```

Optional:

```bash
ENS_NAME_WRAPPER=0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
LABEL=trialpass8
NEW_OWNER=0xRecipientAddress
RESOLVER=0x0000000000000000000000000000000000000000
OWNER_CONTROLLED_FUSES=0
RECORDS_JSON=[]
ACTIVE=true
```

## 7) Mainnet runbook

### Step A — Deploy

```bash
npm run deploy:mainnet
```

Script checks mainnet chain id and prints next actions.

### Step B — Lock parent in ENS Manager

Burn `CANNOT_UNWRAP` on the wrapped parent.

### Step C — Approve and activate parent

```bash
npm run setup:parent:mainnet
```

Deactivate later with:

```bash
ACTIVE=false npm run setup:parent:mainnet
```

### Step D — Register subname

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipient
```

Get CLI help:

```bash
npm run register:mainnet -- --help
```

### Step E — Verify contract

```bash
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## 8) Resolver records option

`register` can forward resolver calls through `records`.

Safety rules:

- If records are provided, resolver must be a contract.
- Each calldata payload must embed the child node at bytes `[4:36]`.
- Mismatched payloads revert.

## 9) Common failure modes

- `ParentNotLocked`: burn `CANNOT_UNWRAP` on parent first.
- `RegistrarNotAuthorised`: approve registrar as NameWrapper operator.
- `ParentNameNotActive`: parent has not been activated in this registrar.
- `ParentExpired`: parent effective expiry already passed.
- `InvalidLabelCharacter` / `LabelTooShort`: label must match `[a-z0-9]{8,63}`.
- `Unavailable`: subname already exists and is not expired.

## 10) Mainnet deployment checklist

- [ ] Node.js 22.10+ in operator environment.
- [ ] `npm ci`, `npm run build`, `npm test`, `npm run typecheck` all pass.
- [ ] Wrapper address confirmed for target chain.
- [ ] Parent wrapped and locked (`CANNOT_UNWRAP` burned).
- [ ] Registrar deployed and verified.
- [ ] Parent approved and activated.
- [ ] Test registration performed and resolver behavior validated.
- [ ] Monitoring and transaction alerting in place.

## 11) Operator checklist

- [ ] Use dedicated ops wallet / Safe flow.
- [ ] Never expose private keys in shell history or logs.
- [ ] Confirm chain id before every state-changing command.
- [ ] Keep `.env` out of version control.
- [ ] Document parent node/name and registrar address in runbooks.
- [ ] Keep a rollback action ready (`ACTIVE=false` for parent).

## 12) Scope caveats

- Tests use mocks, not a full mainnet fork of ENS contracts.
- Perform at least one real test on a fork or test environment before production rollout.
- If ENS NameWrapper semantics change in future upgrades, re-review fuse and expiry assumptions.
