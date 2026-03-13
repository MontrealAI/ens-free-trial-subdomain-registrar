# Use Case: alpha.agent.agi.eth Identity Issuance

This repository is production-scoped for `*.alpha.agent.agi.eth` using one contract:
- `FreeTrialSubdomainRegistrarIdentity`

## User flow
1. Operator activates root after ENS prerequisites are met.
2. User calls `register(label)`.
3. Contract creates wrapped subname and mints soulbound identity NFT to caller.
4. If token/NW state diverges, anyone may call `syncIdentity`.
5. Legit owner can call `claimIdentity(label)` for stale/missing token recovery.

## Operational guarantees
- Free registration (gas only).
- Child expiry `min(now + 30d, effective parent expiry)`.
- Child fuses: `CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL`.
- No `CAN_EXTEND_EXPIRY` on children.
- Label policy: lowercase alphanumeric, 8-63 chars, one label only.
