# Alpha Agent AGI ETH: Operator Guide

Root is fixed to `alpha.agent.agi.eth` in the identity contract constructor.

## Deploy
```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
```

## Activate
```bash
npm run setup:parent:mainnet -- --registrar 0xYourRegistrar --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve
```

## Register
```bash
npm run register:mainnet -- --registrar 0xYourRegistrar --label 12345678 --confirm-mainnet I_UNDERSTAND_MAINNET
```

## Notes
- Labels must be lowercase alphanumeric, length 8-63.
- One transaction performs wrapped subname registration + SBT mint.
- Identity is forever soulbound.
