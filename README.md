# ENS Free Trial Subdomain Registrar Identity (Mainnet-Ready)

This repository is standardized on a **single production contract**:

- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

It atomically does both in one transaction:
1. Registers a wrapped ENS subname under `*.alpha.agent.agi.eth`
2. Mints a soulbound identity NFT (`tokenId = uint256(node)`)

## Mainnet defaults
- NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Parent name: `alpha.agent.agi.eth`
- Parent node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Toolchain
- Node.js `20.19.6`
- Hardhat `2.x`
- Solidity `0.8.24` (optimizer 200, viaIR false)

## Install and checks
```bash
npm ci
npm run build
npm test
npm run typecheck
```

## Mainnet operator flow
```bash
# 1) Read-only preflight
npm run doctor:mainnet -- --parent-name alpha.agent.agi.eth --label 12345678

# 2) Deploy (writes release artifact)
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify

# 3) Setup parent + activate root
npm run setup:parent:mainnet -- --registrar 0xYourRegistrar --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve

# 4) Register
npm run register:mainnet -- --registrar 0xYourRegistrar --label 12345678 --confirm-mainnet I_UNDERSTAND_MAINNET

# 5) Standalone verify retry
npm run verify:mainnet -- --address 0xYourRegistrar
```

## Manual ENS prerequisites (cannot be safely auto-forced)
- Parent `alpha.agent.agi.eth` must already be wrapped in NameWrapper.
- Parent must be locked (`CANNOT_UNWRAP` burned).
- Parent wrapped owner must approve registrar as NameWrapper operator if not yet approved.

## Architecture guardrails
- Free registration (`register` never accepts ETH).
- 30-day max child expiry capped by effective parent expiry.
- Root-scoped claim/sync only for `*.alpha.agent.agi.eth`.
- Soulbound forever (approvals/transfers revert, EIP-5192 `Locked` emitted on mint).
