# ENS Free Trial Subdomain Registrar

A production-oriented Hardhat project for a **free 30-day ENS subname trial**.

## What this contract does

- Every new subname gets:
  - `expiry = block.timestamp + 30 days`, or
  - the parent's effective expiry, if the parent expires sooner.
- The subname itself gets **no extra grace period**.
- Registration is **free**.
- The subname owner **cannot renew** through `CAN_EXTEND_EXPIRY`, because this fuse is not granted.
- Labels are limited to lowercase ASCII letters and digits only: `[a-z0-9]`.
- Labels must be **8 to 63 characters** long.
- The contract rejects ETH.
- Optional resolver record writes are supported.

## Recommended repository name

`ens-free-trial-subdomain-registrar`

## Quick start

```bash
cp .env.example .env
npm install
npm run build
```

## Required environment variables

Open `.env` and set at least:

```bash
MAINNET_RPC_URL=...
DEPLOYER_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...
```

## One-time mainnet deployment

```bash
npm run deploy:mainnet
```

The deploy script prints your deployed registrar address. Put it into `.env` as `REGISTRAR_ADDRESS`.

## Before activating a parent name

Your parent ENS name must already be:

1. Wrapped in the ENS NameWrapper.
2. Locked (`CANNOT_UNWRAP` burned on the parent).
3. Approved for this registrar via `NameWrapper.setApprovalForAll(registrar, true)`.

The script below can do the operator approval and the parent activation, but it **cannot** lock the parent for you. Lock the parent first, then run the script from the wrapped parent owner account.

## Activate a parent name

Example:

```bash
export REGISTRAR_ADDRESS=0xYourRegistrar
export PARENT_NAME=example.eth
npm run setup:parent:mainnet
```

To deactivate a parent later:

```bash
export ACTIVE=false
npm run setup:parent:mainnet
```

## Register a free trial subname

### Simplest form

```bash
export REGISTRAR_ADDRESS=0xYourRegistrar
export PARENT_NAME=example.eth
export LABEL=trialpass8
export NEW_OWNER=0xRecipientAddress
npm run register:mainnet
```

### Same thing with CLI flags

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipientAddress
```

### Optional resolver

If you want a resolver but no records:

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipientAddress \
  --resolver 0xYourResolver
```

### Optional fuse presets

- Transferable trial subname: `0`
- Non-transferable “free pass”: `5`
  - `5 = CANNOT_UNWRAP | CANNOT_TRANSFER`

Example:

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipientAddress \
  --fuses 5
```

## Verify on Etherscan

After deployment:

```bash
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

If you changed the wrapper address, replace the second constructor argument.

## Recommended GitHub settings

After pushing this repo to GitHub:

1. Protect the `main` branch.
2. Require pull requests for changes to `main`.
3. Require the CI workflow to pass before merge.
4. Enable Dependabot alerts.
5. Enable secret scanning / push protection.
6. Never commit `.env` or private keys.

## Human-friendly usage notes

- Use lowercase labels only.
- Pick labels of at least 8 characters.
- If the wrapped parent has less than 30 days left, the child expires when the parent effectively expires.
- For `.eth` parents, the registrar subtracts the usual parent grace period **only when capping against the parent**. It does **not** add grace to the child.
- The child owner cannot self-renew because `CAN_EXTEND_EXPIRY` is never granted.
- The parent owner can still choose to extend an existing child later, because that is how ENS subname expiry works.

## Common mistakes

### “Parent not locked”
Lock the parent first in ENS Manager by burning `CANNOT_UNWRAP`.

### “Registrar not authorised”
Approve the registrar on the NameWrapper, then run `npm run setup:parent:mainnet` again.

### “Invalid label”
Use only lowercase letters and numbers, 8 to 63 characters.

### “Verification failed”
Make sure you deployed and verified with the same build profile:

```bash
npm run build
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## Suggested release checklist

- [ ] Review the contract one more time.
- [ ] Run a Sepolia or local dry run first.
- [ ] Fund the deployer wallet with enough ETH.
- [ ] Double-check the parent name is wrapped and locked.
- [ ] Double-check `REGISTRAR_ADDRESS` in `.env`.
- [ ] Verify the contract after deployment.
- [ ] Turn on branch protection and repository security features.
