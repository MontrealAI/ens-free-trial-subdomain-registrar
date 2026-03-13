# Release Process

## Active line
- Active production contract line: `FreeTrialSubdomainRegistrarIdentity`.
- Root scope: `alpha.agent.agi.eth` only.

## Historical line
- Legacy historical deployment (`v1.0.0`): `FreeTrialSubdomainRegistrar` at `0x7aAE649184182A01Ac7D8D5d7873903015C08761`.

## Verification checklist
1. `npm ci`
2. `npm run clean`
3. `npm run build`
4. `npm test`
5. `npm run typecheck`
6. `npm run doctor:mainnet -- --label 12345678`
7. `npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify`
8. `npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator`
9. `npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678`
