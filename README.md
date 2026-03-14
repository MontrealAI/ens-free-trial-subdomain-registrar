# ENS Free-Trial Subdomain Registrar (Identity Edition)

Production scope: **one active smart contract only**.

- `contracts/FreeTrialSubdomainRegistrarIdentity.sol`

This single contract handles both:
1. wrapped ENS subname registration
2. soulbound ERC-721 identity minting (EIP-5192)

## Root-specific production model

- Root name: `alpha.agent.agi.eth`
- Root node: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`
- NameWrapper (mainnet): `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- ENS Registry (mainnet): `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`

No runtime parent arguments are required in the active operator flow.

## Toolchain

- Node `20.19.6`
- Hardhat `2.x`
- TypeScript
- Solidity `0.8.24` (optimizer runs `200`, `viaIR: true`)

## Install and checks

```bash
npm ci
npm run clean
npm run build
npm test
npm run typecheck
npm run ci
```

## Mainnet operator commands

```bash
npm run doctor:mainnet -- --label 12345678
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --verify
npm run verify:mainnet -- --address 0xYourRegistrar
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --approve-operator
npm run register:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --label 12345678
```

## Manual ENS prerequisites

1. Wrap `alpha.agent.agi.eth` in NameWrapper if not already wrapped.
2. Lock the wrapped parent (`CANNOT_UNWRAP` burned). **Locking is irreversible.**
3. Approve the deployed registrar contract as NameWrapper operator from wrapped parent owner account.
4. Activate the registrar root (`setRootActive(true)`) via `setup:parent:mainnet`.
5. Optional: transfer registrar ownership to a production multisig.

## User behavior and guarantees

- Registration is protocol-free (no registration fee), but Ethereum gas is still required.
- Child expiry is always `min(now + 30 days, effective parent expiry)`.
- Wrapped child burns `CANNOT_UNWRAP | CANNOT_TRANSFER | PARENT_CANNOT_CONTROL`.
- Wrapped subnames are non-transferable (`CANNOT_TRANSFER` burned).
- Identity NFTs are soulbound (all approvals/transfers revert).
- Reverse resolution is optional and should be configured separately outside this core contract.

## Deployment artifacts

Real deploys write:
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.json`
- `release-assets/mainnet-free-trial-subdomain-registrar-identity.constructor-args.json`

## Legacy / Historical Deployment

Historical legacy contract (`FreeTrialSubdomainRegistrar`) live release `v1.0.0`:
- `0x7aAE649184182A01Ac7D8D5d7873903015C08761`

That legacy contract is historical only and is not part of the active deploy/operator flow in this repository.
