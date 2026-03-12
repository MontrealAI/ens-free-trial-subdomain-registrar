# AGENTS.md

## Repository layout
- `contracts/` — core Solidity registrar and test mocks.
- `scripts/` — mainnet operator scripts (`deploy-mainnet`, `approve-and-setup-parent`, `register-subname`) plus shared helpers.
- `test/` — Hardhat/Mocha tests for contract and script validation behavior.
- `docs/use-cases/` — operator walkthroughs (flagship: `alpha.agent.agi.eth`).

## Canonical commands
- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Full local CI: `npm run ci`
- Deploy (mainnet only): `npm run deploy:mainnet`
- Parent setup (mainnet only): `npm run setup:parent:mainnet`
- Register subname (mainnet only): `npm run register:mainnet -- --help`

## Product invariants (non-negotiable)
- Keep registrar logic generic; never hardcode `alpha.agent.agi.eth` into protocol logic.
- Free-trial expiry must remain `min(block.timestamp + 30 days, parent effective expiry)`.
- Child gets no independent grace period.
- For `.eth` parents, grace handling is only for parent effective-expiry capping and must never extend a child beyond 30 days.
- Registration must remain free and reject accidental ETH.
- Never grant `CAN_EXTEND_EXPIRY` to child owners.
- Labels must remain lowercase alphanumeric, length `8..63`, and first-degree only.
- Script/CLI UX must reject dotted/full-name labels with clear guidance.

## Conventions
- Prefer explicit, low-surprise changes; avoid unnecessary abstractions.
- Keep script preflights fail-closed (chain id, bytecode presence, active parent checks, etc.).
- When behavior changes, update docs + tests in the same patch.
- Preserve custom errors/revert reasons unless there is a strong correctness reason to change.

## Do-not rules
- Do not add fees, renewals, self-extension flows, governance, upgradeability, or extra admin powers.
- Do not weaken label validation or first-degree-only semantics.
- Do not merge changes without rerunning relevant checks.

## Done criteria
- `npm run build`, `npm test`, and `npm run typecheck` pass.
- Documentation clearly explains first-degree-only labels and operator usage.
- Tests cover invariant-critical behaviors (expiry math, `.eth` grace handling, ETH rejection, label constraints, fuse behavior).

## Review expectations
- Confirm invariants above are still true.
- Confirm docs/scripts examples are copy-pasteable and generic.
- Confirm flagship `alpha.agent.agi.eth` walkthrough remains accurate as an example, not hardcoded logic.
