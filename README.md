# ENS Free Trial Subdomain Registrar

Free, production-focused ENS subname registrar for wrapped parent names.

## What it guarantees

- New child expiry is always:
  - `min(block.timestamp + 30 days, parentEffectiveExpiry)`.
- Child names do **not** receive their own grace period.
- `.eth` parent grace is only used to compute `parentEffectiveExpiry` (parent expiry minus 90 days).
- Registration is free (no payable registration path).
- Child owner cannot self-extend by fuse grant from this registrar (no `CAN_EXTEND_EXPIRY` grant).
- Labels are enforced onchain as lowercase alphanumeric `[a-z0-9]`, 8–63 chars.
- Parent must be wrapped, locked (`CANNOT_UNWRAP`), and registrar-authorized.

---

## Safety model (important)

This contract is intentionally minimal and does **not** remove ENS parent control realities:

- Parent operator can still extend or modify subnames if NameWrapper permissions allow it.
- This project prevents **automatic child self-renew rights** during minting; it does not change ENS protocol ownership semantics.

If you require immutable parent behavior, design a stricter fuse policy and parent governance process before mainnet use.

---

## Prerequisites

- Node.js 22+
- npm
- Mainnet RPC URL
- Deployer wallet with ETH for gas
- Wrapped ENS parent name
- Parent locked (`CANNOT_UNWRAP` burned)

---

## Install

```bash
cp .env.example .env
npm install
npm run build
npm test
```

Populate `.env` from `.env.example`.

---

## Mainnet deploy flow

### 1) Deploy registrar

```bash
npm run deploy:mainnet
```

Save emitted address as `REGISTRAR_ADDRESS` in `.env`.

### 2) Approve + activate parent

```bash
export PARENT_NAME=example.eth
npm run setup:parent:mainnet
```

The script will:
- validate inputs
- check lock state
- approve registrar in NameWrapper (if needed)
- activate/deactivate parent in registrar

### 3) Register a subname

```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrar \
  --parent-name example.eth \
  --label trialpass8 \
  --owner 0xRecipientAddress
```

---

## Optional registration arguments

- `--resolver 0x...`
- `--fuses <0..65535>` owner-controlled fuse bits
- `--records '["0x..."]'` resolver calldata payloads

If `records` are provided, resolver must be a deployed contract and each payload must embed the child namehash.

---

## Common failures

- `ParentNotLocked`: burn `CANNOT_UNWRAP` on the wrapped parent first.
- `RegistrarNotAuthorised`: run parent setup from wrapped parent owner context.
- `ParentExpired`: parent effective expiry is already elapsed.
- `InvalidLabelCharacter` / `LabelTooShort`: update label format.
- `Unavailable`: existing subname not yet expired.

---

## Verify on Etherscan

```bash
npm run verify:mainnet -- 0xYourRegistrar 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

---

## Operator checklist

- [ ] Parent name is wrapped.
- [ ] `CANNOT_UNWRAP` burned on parent.
- [ ] Registrar is approved in NameWrapper.
- [ ] Parent is activated in registrar.
- [ ] Dry-run on test/sim environment complete.
- [ ] Deployment and setup transactions archived.
- [ ] Contract verified on Etherscan.
- [ ] Key management and signer policy documented.

---

## Security notes

- Contract rejects direct ETH.
- Registration path is non-reentrant.
- Resolver calls are optional and externally executed; use trusted resolvers only.
- Keep owner-controlled fuses conservative for trial names.

See `SECURITY.md` for vulnerability reporting.
