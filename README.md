# ENS Free Trial Subdomain Registrar

Free, fixed-duration ENS subname trials with strict onchain rules:

- Expiry is always `min(block.timestamp + 30 days, parent effective expiry)`.
- The child gets **no extra grace period**.
- Registration is free.
- Child owners are **not** given `CAN_EXTEND_EXPIRY`.
- Labels are enforced onchain as lowercase alphanumeric, 8-63 chars.

> This repository is intended for production-oriented operations, but you should still run your own internal review and staging rehearsal before mainnet use.

## What this project is for

Use this when you want to let users claim a temporary ENS subname under your wrapped parent name (for onboarding, campaign trials, access passes, etc.) with no payment and no self-renewal path.

## Core safety properties

- **Free registration:** `register()` is non-payable and has no fee path.
- **Fixed trial period:** hardcoded 30-day max trial.
- **Parent-aware capping:** if parent expires sooner, child is capped earlier.
- **No child grace extension:** `.eth` grace is only considered when calculating parent effective expiry.
- **No child-owner renewal fuse:** registrar does not grant `CAN_EXTEND_EXPIRY`.
- **ETH rejected:** direct ETH sends revert.
- **Parent gating:** only explicitly activated parent nodes can register.

## Important trust and control assumptions

This contract is intentionally simple and does **not** remove ENS parent-owner powers. Parent operators who can modify the wrapped parent can still:

- deactivate the parent in this registrar,
- register conflicting names first,
- later extend or alter child settings using normal ENS wrapper capabilities (outside this contract).

This is expected ENS behavior; document it clearly for your users.

## Quick start

```bash
cp .env.example .env
npm install
npm run build
npm test
```

## Environment configuration

Required values in `.env`:

```bash
MAINNET_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...
```

Other useful variables are included in `.env.example`.

## Mainnet deployment flow

### 1) Deploy registrar

```bash
npm run deploy:mainnet
```

Copy the printed registrar address into `.env` as `REGISTRAR_ADDRESS`.

### 2) Prepare parent in ENS Manager

Before activation, your parent must already be:

1. Wrapped in NameWrapper.
2. Locked (`CANNOT_UNWRAP` burned).
3. Owned by the account (or Safe) you will use for setup.

### 3) Approve + activate parent

```bash
export REGISTRAR_ADDRESS=0xYourRegistrar
export PARENT_NAME=example.eth
npm run setup:parent:mainnet
```

To deactivate later:

```bash
export ACTIVE=false
npm run setup:parent:mainnet
```

### 4) Register trial subname

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipientAddress
```

Optional resolver + records are supported.

## Troubleshooting

- **ParentNotLocked:** burn `CANNOT_UNWRAP` on the wrapped parent first.
- **RegistrarNotAuthorised:** run setup script from parent owner and approve operator.
- **ParentExpired:** parent effective expiry is already reached.
- **Invalid label:** must be `[a-z0-9]{8,63}`.
- **Unavailable:** subname currently not expired.

## Validation checklist before production

- [ ] Run `npm run build` and `npm test` successfully in CI.
- [ ] Verify mainnet wrapper address is correct (`0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`).
- [ ] Rehearse full deploy/setup/register flow on a staging fork.
- [ ] Use a Safe/multisig for parent ownership when possible.
- [ ] Publish operator runbook and user-facing policy.

## Etherscan verification

```bash
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## Extra docs

- `docs/PRODUCTION_REVIEW.md` - security and production readiness review.
- `SECURITY.md` - vulnerability reporting policy.
