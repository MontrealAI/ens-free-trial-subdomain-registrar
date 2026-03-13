# FreeTrialSubdomainRegistrarIdentity

`FreeTrialSubdomainRegistrarIdentity` is the flagship next-generation contract in this repository.

## Positioning

It upgrades the registrar-only model into a **universal ENS-based identity primitive**:
- wrapped ENS subname issuance
- identity NFT mint
- ownership alignment checks
- soulbound semantics
- onchain metadata

## Canonical behavior

- `registerIdentity(parentNode, label)`:
  - validates strict first-degree label rules
  - computes trial expiry with same registrar invariant
  - wraps subname with identity fuse posture
  - mints identity token to the wrapped owner
- token ID is canonical: `uint256(node)`.
- `claimIdentity(node)` allows wrapped-owner backfill minting.
- `syncIdentity(tokenId)` is permissionless and burns identity tokens when:
  - wrapper expiry has elapsed
  - wrapped owner and token owner diverge
  - wrapped node no longer resolves in NameWrapper

## Soulbound posture

Identity tokens are intentionally non-transferable:
- `transferFrom` reverts
- `safeTransferFrom` reverts
- `approve` reverts
- `setApprovalForAll` reverts
- `locked(tokenId)` is exposed for EIP-5192-compatible readers

## Fuse policy for issued identity subnames

Subname wrap applies:
- `CANNOT_UNWRAP`
- `CANNOT_TRANSFER`
- `PARENT_CANNOT_CONTROL`

## Invariants preserved from registrar v1

- registration is free
- child expiry is `min(now + 30 days, parent effective expiry)`
- no child grace extension
- no child self-renewal path
- label policy remains lowercase alphanumeric `[a-z0-9]{8,63}`
- dotted/full-name label inputs remain rejected

## Deployment status

- **Current status:** integrated in repository and test-covered.
- **Mainnet status:** deployment pending (no deployed address is claimed yet).

## Legacy live release continuity

The existing deployed `FreeTrialSubdomainRegistrar` at `0x7aAE649184182A01Ac7D8D5d7873903015C08761` remains the live v1.0.0 infrastructure until the identity contract is deployed and released.
