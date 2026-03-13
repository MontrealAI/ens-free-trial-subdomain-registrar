# Mainnet Deployment: FreeTrialSubdomainRegistrar

This document is the canonical deployment and activation record for the live Ethereum mainnet registrar.

## Deployment summary

- **Network:** Ethereum Mainnet
- **chainId:** `1`
- **Contract name:** `FreeTrialSubdomainRegistrar`
- **Contract address:** `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- **Verified contract:** <https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code>
- **Deployment transaction:** `0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a`
- **ENS NameWrapper (constructor arg):** `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`
- **Parent activation transaction:** `0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205`
- **Activation call used:** `activateParent(bytes32 parentNode)`
- **Parent ENS name:** `alpha.agent.agi.eth`
- **Parent node (namehash, hex):** `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`
- **Parent node (decimal):** `90143518335307518480231233843615928237269120030432379444131890004974153510238`

## Constructor arguments

`FreeTrialSubdomainRegistrar` was deployed with:

```text
["0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401"]
```

## Durable deployment metadata

Machine-readable deployment manifest:

- [`deployments/mainnet/FreeTrialSubdomainRegistrar-0x7aae649184182a01ac7d8d5d7873903015c08761.json`](../deployments/mainnet/FreeTrialSubdomainRegistrar-0x7aae649184182a01ac7d8d5d7873903015c08761.json)

Release-ready notes asset:

- [`release-assets/v1.0.0-mainnet.md`](../release-assets/v1.0.0-mainnet.md)

## Canonical commands

### Deploy (mainnet)

```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
```

### Verify (mainnet)

```bash
npm run verify:mainnet -- --address 0x7aAE649184182A01Ac7D8D5d7873903015C08761
```

### Approve + activate parent

```bash
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate --parent-name alpha.agent.agi.eth
```

### Register example subname

```bash
npm run register:mainnet -- --registrar 0x7aAE649184182A01Ac7D8D5d7873903015C08761 --parent-name alpha.agent.agi.eth --label 12345678 --owner 0xRecipientAddress --confirm-mainnet I_UNDERSTAND_MAINNET
```

## Verification and operational checks

### Confirm contract is verified

1. Open Etherscan: <https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code>
2. Confirm source, compiler `0.8.17`, and constructor argument wrapper address.

### Confirm parent activation

1. Inspect activation transaction:
   - <https://etherscan.io/tx/0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205>
2. Confirm call target is registrar `0x7aAE649184182A01Ac7D8D5d7873903015C08761`.
3. Confirm function is `activateParent(bytes32)` with parent node `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`.

### Confirm subname mint flow

Flagship examples:

- `12345678.alpha.agent.agi.eth`
- `ethereum.alpha.agent.agi.eth`

Use ENS Manager / app to inspect ownership, wrapped status, and expiry behavior.

## Deactivation / removal behavior

To stop new mints for a parent:

```bash
# reversible stop
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action deactivate --parent-name alpha.agent.agi.eth

# remove parent config entry
npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action remove --parent-name alpha.agent.agi.eth
```

Important: these actions stop **new** registrations only. Already-issued subnames continue until their current expiry.

## Operator assumptions and warnings

- Parent must be wrapped and locked (`CANNOT_UNWRAP` burned) before activation.
- Registrar must be approved as operator by wrapped parent owner in NameWrapper.
- Scripts are mainnet-only and fail closed unless explicit confirmation is provided.
- This system keeps registration free and does not provide child self-renewals.
- Child expiry remains bounded by `min(now + 30 days, parent effective expiry)`.
