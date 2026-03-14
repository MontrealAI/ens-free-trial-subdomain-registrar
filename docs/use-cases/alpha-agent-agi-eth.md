# Use Case: `*.alpha.agent.agi.eth` Identity Issuance

This repository is production-scoped for `alpha.agent.agi.eth` with one active contract:
- `FreeTrialSubdomainRegistrarIdentity`

## Operator flow

1. Run read-only diagnostics: `npm run doctor:mainnet -- --label 12345678`.
2. Deploy the registrar contract.
3. Approve NameWrapper operator and activate root.
4. Users self-register labels (`register(label)`).
5. Users can recover stale identity state with `claimIdentity(label)`.
6. Anyone can run lazy cleanup with `syncIdentity` / `syncIdentityByLabel`.

## Guarantees

- Free registration (gas only).
- Child expiry: `min(now + 30 days, effective parent expiry)`.
- Parent `.eth` grace is only applied to parent cap calculations.
- Childs burn: `CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL`.
- No child `CAN_EXTEND_EXPIRY`.
- Wrapped ENS subname and SBT ownership are expected to stay aligned.
- Identity token is soulbound.
- Labels: lowercase alphanumeric only, 8-63 chars, single-label only.
