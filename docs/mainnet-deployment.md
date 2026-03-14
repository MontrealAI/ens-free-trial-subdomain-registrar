# Mainnet Deployment (alpha.agent.agi.eth)

Active production architecture uses only:
- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

## Hard-coded production constants

- NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Root name: `alpha.agent.agi.eth`
- Root node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Toolchain pinning

- Node `20.19.6`
- Hardhat `2.x`
- Solidity `0.8.24`
- Optimizer enabled, runs `200`
- `viaIR: true`

## Manual ENS prerequisites

1. Ensure `alpha.agent.agi.eth` is wrapped in NameWrapper.
2. Ensure wrapped parent is locked (`CANNOT_UNWRAP` burned). **Irreversible.**
3. Ensure deployed registrar is approved as NameWrapper operator by wrapped parent owner.
4. Ensure deployer/operator account has ETH for gas.
5. Optional: transfer registrar ownership to a multisig after deployment.

## Commands

```bash
npm run doctor:mainnet -- --label 12345678
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run verify:mainnet -- --address 0xYourRegistrar
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
```

## Notes

- Registration is free, but gas is required.
- Wrapped subnames are non-transferable via burned child fuses.
- SBTs are non-transferable.
- Reverse resolution is optional and configured out-of-band.
- Do not claim merged-contract mainnet live status unless a real deployment artifact exists.
