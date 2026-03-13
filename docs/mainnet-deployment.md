# Mainnet deployment (`alpha.agent.agi.eth`)

This repo uses one production contract only: `FreeTrialSubdomainRegistrarIdentity`.

## 1) Preflight
```bash
npm run doctor:mainnet -- --parent-name alpha.agent.agi.eth --registrar 0xYOUR_REGISTRAR
```

## 2) Deploy
```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
```
Deployment artifact is written to:
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.json`

## 3) Verify (standalone retry)
```bash
npm run verify:mainnet -- --address 0xYOUR_REGISTRAR
```

## 4) Activate / deactivate root
```bash
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0xYOUR_REGISTRAR --action activate
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0xYOUR_REGISTRAR --action deactivate
```

## 5) Register subname + mint SBT (single tx)
```bash
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --registrar 0xYOUR_REGISTRAR --label 12345678
```
