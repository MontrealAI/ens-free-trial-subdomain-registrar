# Etherscan Web Guide (No CLI Required)

This guide is for non-technical operators using a verified `FreeTrialSubdomainRegistrar` contract directly on Etherscan.

Flagship example parent:
- Parent name: `alpha.agent.agi.eth`
- Parent node (namehash): `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Allowed vs Forbidden label input

Allowed:
- `12345678`
- `ethereum`

Forbidden:
- `ethereum.12345678`
- `12345678.alpha.agent.agi.eth`
- any uppercase label
- any label shorter than 8 chars

**Rule:** label must match `[a-z0-9]{8,63}` and be one label only.

## What you type / What gets created

- parent=`alpha.agent.agi.eth`, label=`12345678` -> `12345678.alpha.agent.agi.eth`
- parent=`alpha.agent.agi.eth`, label=`ethereum` -> `ethereum.alpha.agent.agi.eth`

If you accidentally pass a full ENS name as the label, the transaction must fail.

## Step 1: find/copy the parent node and open the registrar

1. Compute/copy the parent node for `alpha.agent.agi.eth`:
   - ENS app manager tools or CLI (`ethers.namehash("alpha.agent.agi.eth")`) should return
     `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`.
2. Open your registrar contract address on Etherscan.
3. Go to **Contract -> Write Contract** and connect the wallet that can modify the wrapped parent.

## Step 2: confirm parent readiness (read functions)

Under **Read Contract**:
1. `isParentActive(parentNode)`
2. `getParentStatus(parentNode)`

`getParentStatus` returns:
- `active`
- `parentLocked`
- `registrarAuthorised`
- `parentUsable`
- `parentEffectiveExpiry`

For safe activation, `parentLocked`, `registrarAuthorised`, and `parentUsable` should all be `true`.

## Step 3: activate parent

Under **Write Contract** call:
- `activateParent(bytes32 parentNode)`

Use parent node:
`0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`

## Step 4: register from happy path

Use:
- `registerSimple(bytes32 parentNode, string label, address newOwner)`

Example A (creates `12345678.alpha.agent.agi.eth`):
- parentNode: `0xc74b6c5e8a0d97ed1fe28755da7d06a84593b4de92f6582327bc40f41d6c2d5e`
- label: `12345678`
- newOwner: recipient address

Example B (creates `ethereum.alpha.agent.agi.eth`):
- same parentNode
- label: `ethereum`
- newOwner: recipient address

## Step 5: stop new free minting immediately

Use either:
- `deactivateParent(parentNode)` (reversible)
- `removeParent(parentNode)` (deletes active flag entry)

Both block **new mints** for that parent.

## Step 6: confirm minting is stopped

1. Read: `isParentActive(parentNode)` should be `false`.
2. Any new `registerSimple`/`register` calls for that parent should revert with `ParentNameNotActive`.

## Existing names after deactivate/remove

Already-issued subnames are **not** retroactively invalidated by this registrar. They remain valid until their own expiry.

## Troubleshooting

- `ParentNotLocked`: burn parent `CANNOT_UNWRAP` in ENS Manager.
- `RegistrarNotAuthorised`: approve registrar on NameWrapper.
- `ParentExpired`: parent effective expiry already passed.
- `ParentNameNotActive`: activate parent first.
- `DottedLabelNotAllowed`: you passed a dotted label/full ENS name; pass one label only (for example `12345678`).
- `InvalidLabelCharacter` or `LabelTooShort`: fix label format.

Human-friendly reminder:

> Do not pass a full ENS name as the label. Use parent alpha.agent.agi.eth and label 12345678, which creates 12345678.alpha.agent.agi.eth.
