# AGENTS.md

## Repository layout
- `contracts/` — core contracts (`FreeTrialSubdomainRegistrar` legacy + `FreeTrialSubdomainRegistrarIdentity` flagship).
- `contracts/test/` — mock ENS wrapper/resolver used by Hardhat tests.
- `scripts/` — mainnet operations (deploy/verify/setup/register/doctor).
- `scripts/utils/` — shared CLI and safety helpers.
- `test/` — contract and script utility tests.
- `docs/` — deployment, release, contract, and operator docs.

## Environment
- Required runtime: **Node.js 20.19.6**.
- Solidity compiler target: **0.8.24**, optimizer enabled (runs 200), viaIR false.

## Canonical commands
- Install: `npm ci`
- Build: `npm run build`
- Production build: `npm run build:production`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Full check: `npm run ci`
- Deploy (mainnet): `npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --contract identity|legacy`
- Verify (mainnet): `npm run verify:mainnet -- --address 0x... --contract identity|legacy`
- Setup parent for registrar flow: `npm run setup:parent:mainnet`
- Register helper (legacy registrar flow): `npm run register:mainnet -- --help`
- Identity claim helper: `npm run claim:mainnet -- --help`
- Identity sync helper: `npm run sync:mainnet -- --help`
- Read-only doctor: `npm run doctor:mainnet -- --help`

## Live release vs next release
- Current live release: `v1.0.0` (`FreeTrialSubdomainRegistrar` at `0x7aAE649184182A01Ac7D8D5d7873903015C08761`).
- Next planned flagship release: `FreeTrialSubdomainRegistrarIdentity` (deployment pending; do not claim live deployment before manifest + explorer proof exist).
- Never invent deployment data or release claims.

## Product invariants (non-negotiable)
1. ENS-based protocol remains the core primitive.
2. Free registration.
3. Child expiry = `min(block.timestamp + 30 days, parent effective expiry)`.
4. No child grace period.
5. `.eth` grace only affects parent cap, not child > 30 days.
6. Never grant child `CAN_EXTEND_EXPIRY`; no child self-renew path.
7. Labels are single-label only, lowercase alphanumeric, 8–63 chars.
8. Dotted labels/full ENS names as label input must be rejected.
9. Identity NFT is soulbound.
10. ENS wrapped owner and identity NFT owner must stay aligned (`syncIdentity` / `claimIdentity` behavior).

## Conventions
- Prefer explicit, low-surprise, minimal diffs.
- Keep state-changing scripts mainnet-gated.
- Update tests/docs when behavior changes.
- Re-run relevant build/test/typecheck after edits.
- Preserve existing custom errors and revert style unless there is strong reason.
