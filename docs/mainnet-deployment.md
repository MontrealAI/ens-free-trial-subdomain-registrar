# Mainnet Deployment (alpha.agent.agi.eth)

Active architecture uses only:
- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

## Constants
- NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Root name: `alpha.agent.agi.eth`
- Root node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Preconditions
1. Parent is wrapped.
2. Parent is locked (`CANNOT_UNWRAP` burned; irreversible).
3. Registrar approved as NameWrapper operator by wrapped parent owner.
4. Deployer account funded for gas.

## Commands
```bash
npm run doctor:mainnet -- --label 12345678
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
npm run claim:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
npm run sync:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
```

## Verify only
```bash
npm run verify:mainnet -- --address 0xYourRegistrar
```

## Artifact
A deployment artifact is written only by an actual deploy run to:
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.json`
