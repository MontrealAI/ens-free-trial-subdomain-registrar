# AGENTS.md

## Repository layout
- `contracts/` — core registrar + test mocks.
- `scripts/` — mainnet operational scripts (`deploy-mainnet.ts`, `approve-and-setup-parent.ts`, `register-subname.ts`).
- `scripts/utils/` — shared script helpers (including label validation).
- `test/` — Hardhat tests for contract behavior and script-side validation helpers.
- `docs/use-cases/` — operator walkthroughs (flagship: `alpha-agent-agi-eth.md`).

## Environment
- Required runtime: **Node.js 20.19.6** (do not require Node 22+).

## Canonical commands
- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Full CI-like local check: `npm run ci`
- Deploy registrar (mainnet): `npm run deploy:mainnet`
- Approve + activate/deactivate parent: `npm run setup:parent:mainnet`
- Register subname: `npm run register:mainnet -- --help`
- Read-only mainnet preflight: `npm run doctor:mainnet -- --help`

## Product invariants (non-negotiable)
1. Free-trial ENS registrar; registration stays free.
2. Child expiry must be `min(block.timestamp + 30 days, parent effective expiry)`.
3. Child gets no grace period of its own.
4. For `.eth` parents, grace only affects parent effective expiry cap; it must never extend child beyond 30 days.
5. Never grant child owner `CAN_EXTEND_EXPIRY`.
6. Child owner cannot renew/self-extend through this system.
7. Labels must stay lowercase alphanumeric only, 8–63 chars.
8. First-degree labels only: input is a single label, never a full ENS name.
9. Script/UX must reject dotted labels with a clear human-friendly error.
10. Keep protocol logic generic; do not hardcode `alpha.agent.agi.eth` into contracts.

## Conventions
- Prefer explicit, low-surprise, minimal diffs.
- Keep state-changing scripts mainnet-gated unless intentionally changing that policy.
- If behavior changes, update tests and relevant docs in the same patch.
- Preserve existing custom errors/revert style unless there is a strong reason.

## Do not
- Do not add fees, renewal paths, upgradeability, governance, or extra admin powers.
- Do not weaken label restrictions or trial expiry guarantees.
- Do not merge UX examples into hardcoded protocol behavior.

## Verification / done criteria
- Run relevant checks after edits (`npm run build`, `npm test`, `npm run typecheck`, plus targeted scripts/tests as needed).
- Confirm docs and examples match actual CLI behavior.
- Ensure alpha walkthrough remains a flagship example while registrar stays reusable.

## Review expectations
- Call out assumptions and anything not verified on live chain.
- Include exact files changed and rationale.
- Highlight security-sensitive changes (expiry math, fuses, authorization, value handling).
