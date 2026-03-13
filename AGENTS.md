# AGENTS.md

## Repository layout
- `contracts/` — core contracts (legacy registrar + flagship identity contract) and test mocks.
- `scripts/` — mainnet operational scripts for deploy/verify/setup/register.
- `scripts/utils/` — shared script helpers (CLI, safety gates, label/parent validation, manifests).
- `test/` — Hardhat tests for contract behavior and script-side validation helpers.
- `docs/contracts/` — contract-level docs.
- `docs/use-cases/` — operator walkthroughs (flagship example: `alpha-agent-agi-eth.md`).
- `docs/releases/` — release note files.

## Environment
- Required runtime: **Node.js 20.19.6** (do not require Node 22+).

## Canonical commands
- Install: `npm ci`
- Build: `npm run build`
- Production build: `npm run build:production`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Full CI-like local check: `npm run ci`

### Mainnet: legacy live registrar (v1)
- Deploy registrar: `npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET`
- Verify registrar: `npm run verify:mainnet -- --address 0x...`
- Approve + activate/deactivate/remove parent: `npm run setup:parent:mainnet`
- Register subname helper: `npm run register:mainnet -- --help`
- Read-only preflight: `npm run doctor:mainnet -- --help`

### Mainnet: flagship identity contract (next release path)
- Deploy identity registrar: `npm run deploy:identity:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET`
- Verify identity registrar: `npm run verify:identity:mainnet -- --address 0x...`
- Claim/sync are onchain contract calls (`claimIdentity(bytes32)`, `syncIdentity(uint256)`) and should be executed via safe operator tooling until dedicated scripts are added.

## Live release vs next release
- Current live mainnet release: `v1.0.0` with `FreeTrialSubdomainRegistrar` at `0x7aAE649184182A01Ac7D8D5d7873903015C08761`.
- Next planned release: identity primitive track centered on `FreeTrialSubdomainRegistrarIdentity`.
- Do **not** invent deployment details for identity contract unless actually deployed and recorded.

## Product invariants (non-negotiable)
1. ENS-based architecture remains mandatory.
2. Free-trial path remains free.
3. Child expiry stays `min(block.timestamp + 30 days, parent effective expiry)`.
4. Child gets no grace period of its own.
5. For `.eth` parents, grace only affects parent effective expiry cap; it must never extend child beyond 30 days.
6. Never grant child owner `CAN_EXTEND_EXPIRY`.
7. Child owner cannot self-renew via this system.
8. Labels must remain lowercase alphanumeric only, 8–63 chars.
9. First-degree labels only: single label input; dotted/full names are invalid.
10. Soulbound requirement for identity token transfers/approvals.
11. ENS wrapped owner and identity token owner must stay aligned or burnable via sync.
12. Keep protocol logic generic; do not hardcode `alpha.agent.agi.eth` in contracts.

## Conventions
- Prefer explicit, low-surprise, minimal diffs.
- Keep state-changing scripts mainnet-gated unless intentionally changing policy.
- If behavior changes, update tests and relevant docs in the same patch.
- Preserve existing custom errors/revert style unless strong reason exists.

## Do not
- Do not add fees, renewal paths, upgradeability, governance, or extra admin powers.
- Do not weaken label restrictions, trial expiry guarantees, or soulbound behavior.
- Do not merge UX examples into hardcoded protocol behavior.

## Verification / done criteria
- Run relevant checks after edits (`npm run build`, `npm test`, `npm run typecheck`).
- Confirm docs and examples match actual CLI behavior.
- Ensure docs clearly distinguish live v1 deployment vs pending identity deployment.
- Ensure `CHANGELOG.md`, `docs/mainnet-deployment.md`, and release notes remain in sync.

## Review expectations
- Call out assumptions and anything not verified on live chain.
- Include exact files changed and rationale.
- Highlight security-sensitive changes (expiry math, fuses, auth, ownership alignment, value handling).
