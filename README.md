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

> ⚠️ Mainnet safety: this repository intentionally treats every state-changing script as **mainnet-only** and fails if connected to the wrong chain id.

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
- `scripts/approve-and-setup-parent.ts` — approve + activate/deactivate/remove parent
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

## Flagship operator example: `alpha.agent.agi.eth`

For a production-style, non-technical-operator walkthrough with copy/paste commands, see:

- [`docs/use-cases/alpha-agent-agi-eth.md`](docs/use-cases/alpha-agent-agi-eth.md)
- [`docs/etherscan-web-guide.md`](docs/etherscan-web-guide.md)

That guide explicitly demonstrates first-degree free-trial subnames:

- `12345678.alpha.agent.agi.eth`
- `ethereum.alpha.agent.agi.eth`

and explains why `--label` must be one label only (no dots, no full name input).

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
PARENT_ACTION=activate
```

## 7) Mainnet runbook

### Step 0 — Optional read-only doctor preflight

```bash
npm run doctor:mainnet -- --help
```

Recommended full preflight (no transactions sent):

```bash
npm run doctor:mainnet -- --registrar 0xYourRegistrar --parent-name example.eth --label trialpass8
```

### Step A — Deploy

```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
```

Script checks mainnet chain id, requires explicit mainnet confirmation, and writes a deployment manifest under `deployments/mainnet/`.

### Step B — Lock parent in ENS Manager

Burn `CANNOT_UNWRAP` on the wrapped parent.

### Step C — Approve and activate parent

```bash
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
```

Script safety checks include:
- strict `chainId == 1`
- explicit `--confirm-mainnet I_UNDERSTAND_MAINNET` (or `MAINNET_CONFIRM`) gate before broadcast
- ENS NameWrapper and registrar bytecode existence checks
- non-zero signer ETH balance
- parent lock validation before activation
- registrar approval checks against NameWrapper

Deactivate later with:

```bash
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action deactivate --parent-name example.eth
```

Remove parent config entry (also blocks new mints):

```bash
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action remove --parent-name example.eth
```

### Step D — Register subname

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipient \
  --confirm-mainnet I_UNDERSTAND_MAINNET
```

Important: `--label` is first-degree only.

- ✅ `--parent-name alpha.agent.agi.eth --label 12345678` creates `12345678.alpha.agent.agi.eth`
- ✅ `--parent-name alpha.agent.agi.eth --label ethereum` creates `ethereum.alpha.agent.agi.eth`
- ❌ `--label ethereum.12345678` (dotted/nested label)
- ❌ `--label 12345678.alpha.agent.agi.eth` (full name passed as label)

Script safety checks include:
- strict `chainId == 1`
- non-zero signer ETH balance
- `REGISTRAR_ADDRESS` and non-zero `RESOLVER` must contain deployed bytecode
- records require a non-zero resolver
- `PARENT_NODE` must be a 32-byte hex node if provided directly
- if both `PARENT_NAME` and `PARENT_NODE` are provided, they must resolve to the same node (fails closed on mismatch)
- onchain label validation preview before submitting tx
- parent active check (`isParentActive`) before submitting tx
- subname availability preflight (`available(node)`) before submitting tx

Get CLI help:

```bash
npm run register:mainnet -- --help
```

Doctor CLI help:

```bash
npm run doctor:mainnet -- --help
```

### Mainnet confirmation gate (all state-changing scripts)

To reduce accidental mainnet writes, deployment/setup/register scripts require an explicit confirmation phrase:

- CLI flag: `--confirm-mainnet I_UNDERSTAND_MAINNET`
- or env: `MAINNET_CONFIRM=I_UNDERSTAND_MAINNET`

Scripts fail closed if this confirmation is missing.

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
- Script error `This script is mainnet-only`: your RPC endpoint or network config is not chain id 1.
- Script error `No contract code found at REGISTRAR_ADDRESS`: wrong contract address or wrong network.
- Script error `Flag --<name> requires a value.`: a CLI flag was provided without its value (for example, `--label` with no label string).

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
- [ ] Keep a rollback action ready (`--action deactivate` or `--action remove` for parent).

## 12) Scope caveats

- Tests use mocks, not a full mainnet fork of ENS contracts.
- Perform at least one real test on a fork or test environment before production rollout.
- If ENS NameWrapper semantics change in future upgrades, re-review fuse and expiry assumptions.
- `records` forwarding is intentionally generic and only guards that calldata embeds the child node at bytes `[4:36]`; operators should only pass resolver calldata generated by trusted tooling.

## 13) Security audit notes (operator-facing)

Before production deployment, explicitly confirm:

- `registrar.wrapper()` equals the expected ENS NameWrapper address for the target chain.
- parent is wrapped, not expired (effective expiry), and locked.
- parent owner has approved registrar in NameWrapper.
- registration script preflight reports parent active and subname available.

Mainnet scripts are intentionally strict and will fail closed when these checks do not pass.
