# Mainnet Deployment (alpha.agent.agi.eth)

Active architecture uses only:
- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

## Constants
- NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Root name: `alpha.agent.agi.eth`
- Root node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Preconditions (manual ENS steps)
1. Ensure `alpha.agent.agi.eth` is wrapped in NameWrapper.
2. Ensure wrapped parent has `CANNOT_UNWRAP` burned (locking is irreversible).
3. Approve deployed registrar as NameWrapper operator from wrapped parent owner account.
4. Ensure deployer/operator signer has ETH for gas.
5. Optional: transfer contract ownership to a production multisig.

## Commands
```bash
npm run doctor:mainnet -- --label 12345678
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run verify:mainnet -- --address 0xYourRegistrar
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
```

## Deployment artifact
A deployment artifact is written only by an actual deploy run to:
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.json`
