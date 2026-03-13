# ENS Free-Trial Subdomain Registrar (Identity Edition)

Production-ready mainnet workflow for **one active contract only**:
- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

This contract is root-scoped to:
- root name: `alpha.agent.agi.eth`
- root node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

It handles both:
1. wrapped ENS subname registration
2. soulbound ERC-721 identity minting (EIP-5192)

## Toolchain
- Node `20.19.6`
- Hardhat `2.x`
- TypeScript
- Solidity `0.8.24` (optimizer runs `200`, `viaIR: false`)

## Install & checks
```bash
npm ci
npm run clean
npm run build
npm test
npm run typecheck
npm run ci
```

## Mainnet commands
```bash
npm run doctor:mainnet -- --label 12345678
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run verify:mainnet -- --address 0xYourRegistrar
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
```

## Required ENS prerequisites (manual)
1. `alpha.agent.agi.eth` must be wrapped in NameWrapper.
2. Parent must be locked (`CANNOT_UNWRAP` burned).
3. Deployed registrar must be authorized by wrapped parent owner (typically `setApprovalForAll`).
4. Optional: transfer contract ownership to multisig after deployment.

Notes:
- Parent locking is irreversible.
- Registration is free in protocol terms, but still costs gas.
- Activation requires wrapper authorization.

## Legacy / historical deployment
- Historical legacy contract (`FreeTrialSubdomainRegistrar`) live release `v1.0.0`:
  - `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- This repository’s **active** deployment flow no longer uses that legacy contract.
