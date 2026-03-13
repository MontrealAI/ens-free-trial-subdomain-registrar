# Use Case: alpha.agent.agi.eth Identity Issuance

This repository is production-scoped for `*.alpha.agent.agi.eth` using one contract:
- `FreeTrialSubdomainRegistrarIdentity`

## User flow
1. Operator verifies readiness with `doctor:mainnet`.
2. Operator activates root after ENS prerequisites are met.
3. User calls `register(label)` to register wrapped subname and mint SBT to self.
4. If token/wrapper state diverges, anyone may call `syncIdentity` for lazy cleanup.
5. Wrapped owner may call `claimIdentity(label)` for stale/missing token recovery.

## Operational guarantees
- Free registration (gas only).
- Child expiry `min(now + 30d, effective parent expiry)`.
- Child fuses: `CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL`.
- No `CAN_EXTEND_EXPIRY` on children.
- Label policy: lowercase alphanumeric, 8-63 chars, one label only.
