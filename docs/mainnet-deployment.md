# Ethereum Mainnet Deployment Status

## Live now (legacy/current release)

- Release: `v1.0.0`
- Contract: `FreeTrialSubdomainRegistrar`
- Address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified: https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code
- Deployment tx: https://etherscan.io/tx/0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a
- Parent activation tx: https://etherscan.io/tx/0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205

## Next release target (deployment pending)

- Contract: `FreeTrialSubdomainRegistrarIdentity`
- Source: `contracts/FreeTrialSubdomainRegistrarIdentity.sol`
- Mainnet deployment: **not yet recorded in this repository**
- Constructor shape: `(address wrapper)`

Mainnet constants:
- ENS Registry: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- ENS NameWrapper: `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`

## Canonical commands

```bash
# legacy registrar (default operator-safe mode while setup flow is registrar-native)
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
npm run verify:mainnet -- --address 0xYourRegistrarAddress

# identity (explicit)
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --contract identity
npm run verify:mainnet -- --address 0xYourIdentityAddress --contract identity
```

## Operator safety notes

- All state-changing scripts remain mainnet gated.
- Registration remains free.
- Label rules remain single-label lowercase alphanumeric, 8–63 chars.
- No mainnet deployment claim is made for identity contract until real deployment metadata exists.
