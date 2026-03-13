# Mainnet Deployment Runbook (Identity-Only)

This repo deploys only `FreeTrialSubdomainRegistrarIdentity`.

## Constants
- Wrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- Parent: `alpha.agent.agi.eth`
- Parent node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## 0) Preflight
```bash
npm run doctor:mainnet -- --parent-name alpha.agent.agi.eth --label 12345678
```

## 1) Deploy + auto-verify
```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
```
Deployment artifact is written to:
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.json`

## 2) Retry verify (if needed)
```bash
npm run verify:mainnet -- --address 0xYourRegistrarAddress
```

## 3) Approve + activate root
```bash
npm run setup:parent:mainnet -- \
  --registrar 0xYourRegistrarAddress \
  --confirm-mainnet I_UNDERSTAND_MAINNET \
  --action activate \
  --approve
```

## 4) Register first name
```bash
npm run register:mainnet -- \
  --registrar 0xYourRegistrarAddress \
  --label 12345678 \
  --confirm-mainnet I_UNDERSTAND_MAINNET
```

## Manual ENS steps
- Ensure `alpha.agent.agi.eth` is wrapped.
- Ensure parent has `CANNOT_UNWRAP` burned.
- If setup script cannot auto-approve, manually approve registrar operator in ENS Manager / NameWrapper.
