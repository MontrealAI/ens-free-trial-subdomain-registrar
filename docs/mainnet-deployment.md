# Ethereum Mainnet Deployment: FreeTrialSubdomainRegistrar

This document records the canonical public Ethereum Mainnet deployment and parent activation for this repository.

## Network

- Network: Ethereum Mainnet
- chainId: `1`
- Contract name: `FreeTrialSubdomainRegistrar`

## Live deployment references

- Contract address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified contract: https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code
- Deployment transaction: https://etherscan.io/tx/0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a
- Parent activation transaction: https://etherscan.io/tx/0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205

## Parent and protocol dependencies

- Parent ENS name: `alpha.agent.agi.eth`
- Parent node (namehash hex): `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`
- Parent node (decimal): `90143518335307518480231233843615928237269120030432379444131890004974153510238`
- ENS NameWrapper (mainnet): `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`

## Constructor arguments

The deployed constructor parameters are:

```text
nameWrapper_ = 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401
trialDuration_ = 2592000  // 30 days in seconds
```

## Activation function used

The parent was activated using:

```solidity
activateParent(bytes32 parentNode)
```

With:

```text
parentNode = 0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e
```

## Canonical reproducible commands

### 1) Deploy

```bash
npm run deploy:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET
```

### 2) Verify

```bash
npm run verify:mainnet -- --address 0x7aAE649184182A01Ac7D8D5d7873903015C08761
```

### 3) Approve + activate parent

```bash
PARENT_NAME=alpha.agent.agi.eth npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action activate
```

### 4) Register example subname

```bash
npm run register:mainnet -- \
  --registrar 0x7aAE649184182A01Ac7D8D5d7873903015C08761 \
  --parent-name alpha.agent.agi.eth \
  --label 12345678 \
  --owner 0xRecipientAddress \
  --confirm-mainnet I_UNDERSTAND_MAINNET
```

## Confirm parent is active

Use one of:

- Script preflight (read-only):

```bash
npm run doctor:mainnet -- --registrar 0x7aAE649184182A01Ac7D8D5d7873903015C08761 --parent-name alpha.agent.agi.eth --label 12345678
```

- Onchain read calls:
  - `isParentActive(parentNode)` returns `true`
  - `getParentStatus(parentNode)` should indicate parent locked, authorised, and usable

## Deactivate or remove parent later

Stop new minting immediately:

```bash
PARENT_NAME=alpha.agent.agi.eth npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action deactivate
```

Or remove registrar state for that parent:

```bash
PARENT_NAME=alpha.agent.agi.eth npm run setup:parent:mainnet -- --confirm-mainnet I_UNDERSTAND_MAINNET --action remove
```

These actions stop **new** free trial registrations. Previously minted names remain valid until their individual expiry.

## Operator assumptions and warnings

- State-changing scripts are mainnet-gated and require explicit `I_UNDERSTAND_MAINNET` confirmation.
- Registration is free; sending ETH to `register` is rejected.
- Labels must be single-label lowercase alphanumeric, length 8–63.
- Dotted labels and full ENS names passed as labels are rejected by script/UX and contract validation.
- Child owner is not granted `CAN_EXTEND_EXPIRY`; no child self-renewal path exists in this system.

## Deployment manifest asset

Machine-readable metadata for this deployment is stored at:

- `release-assets/mainnet-deployment.json`
