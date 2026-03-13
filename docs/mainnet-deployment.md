# Ethereum Mainnet Deployment Status

This repository tracks both the currently live registrar release and the next identity-primitive release path.

## Current live deployment (v1.0.0)

- Contract: `FreeTrialSubdomainRegistrar`
- Address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified: https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code
- Deployment tx: https://etherscan.io/tx/0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a
- Parent activation tx: https://etherscan.io/tx/0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205

### Constructor args (live v1)

```text
wrapper_ = 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
```

## Next flagship deployment (pending)

- Contract: `FreeTrialSubdomainRegistrarIdentity`
- Status: **not yet deployed to mainnet**
- Canonical constructor shape:

```text
wrapper_    = 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
ensRegistry = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
```

### Reproducible deployment commands

```bash
# legacy v1 registrar
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:mainnet -- --address 0xYourRegistrarAddress

# next identity primitive
npm run deploy:identity:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:identity:mainnet -- --address 0xYourIdentityAddress
```

## Shared ENS dependencies

- Network: Ethereum Mainnet (`chainId=1`)
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- ENS NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- Flagship parent example: `alpha.agent.agi.eth`

## Operator safety notes

- State-changing scripts are mainnet-gated with explicit confirmation.
- Labels must remain first-degree lowercase alphanumeric (`[a-z0-9]{8,63}`).
- Do not pass full ENS names into the label field.
- Deployment manifests are written under `deployments/mainnet/`.
- Release assets remain under `release-assets/`.
