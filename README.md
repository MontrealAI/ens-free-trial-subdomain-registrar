# ENS Free Trial Subdomain Registrar Identity (Mainnet-Ready)

Single-contract architecture for `*.alpha.agent.agi.eth` using:
- wrapped ENS subname registration
- soulbound ERC-721 identity (EIP-5192)

Active production contract: `contracts/FreeTrialSubdomainRegistrarIdentity.sol`.

## Mainnet defaults
- NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Parent name: `alpha.agent.agi.eth`
- Parent node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Install / build / test
```bash
npm ci
npm run build
npm test
npm run typecheck
```

## Mainnet operator flow
```bash
npm run doctor:mainnet -- --parent-name alpha.agent.agi.eth --registrar 0xYOUR_REGISTRAR
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run verify:mainnet -- --address 0xYOUR_REGISTRAR
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0xYOUR_REGISTRAR --action activate
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0xYOUR_REGISTRAR --label 12345678
```

## Manual ENS prerequisites
1. Parent `alpha.agent.agi.eth` must be wrapped.
2. Parent must be locked (`CANNOT_UNWRAP` burned).
3. Registrar contract must be approved in NameWrapper (`setApprovalForAll`) by parent owner.
4. Owner activates root in registrar (`setup:parent:mainnet -- --action activate`).

## Security invariants
- Labels: lowercase alphanumeric, single-label, 8–63 chars.
- Child expiry: `min(now + 30 days, parent effective expiry)`.
- Child fuses burn: `CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL`.
- Soulbound forever: approvals/transfers revert, `Locked(tokenId)` emitted on mint.
- Identity root-scoped to `alpha.agent.agi.eth`.
