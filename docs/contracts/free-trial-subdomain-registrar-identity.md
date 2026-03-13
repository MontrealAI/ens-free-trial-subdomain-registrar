# FreeTrialSubdomainRegistrarIdentity

`FreeTrialSubdomainRegistrarIdentity` is the flagship merged contract for this repository.

## Purpose
One transaction:
1. Registers a wrapped ENS subname under an active parent.
2. Mints a soulbound identity NFT with `tokenId = uint256(node)`.

## Core guarantees
- Free registration (ETH transfers rejected).
- Single-label lowercase alphanumeric validation (8–63 chars, no dots).
- Child expiry policy: `min(now + 30 days, parent effective expiry)`.
- Parent fuse posture enforced for activation (`CANNOT_UNWRAP` required).
- Child fuse posture set at registration:
  - `CANNOT_UNWRAP`
  - `CANNOT_TRANSFER`
  - `PARENT_CANNOT_CONTROL`
- Soulbound NFT behavior (`approve`, `setApprovalForAll`, transfer methods all revert).
- EIP-5192-compatible `locked(tokenId) => true`.

## Identity lifecycle
- `registerIdentity(parentNode, label, owner)`: atomic wrapped subname + identity mint.
- `claimIdentity(node)`: backfills identity for eligible wrapped names if token missing/desynced.
- `syncIdentity(tokenId)`: permissionless sync that burns identity when:
  - wrapper expiry elapsed, or
  - wrapped owner and NFT owner diverge, or
  - wrapped name no longer exists.

## Metadata
`tokenURI` is fully onchain:
- `data:application/json;base64,...`
- includes base64 SVG image payload.

## Implementation provenance
- Canonical production source: `contracts/FreeTrialSubdomainRegistrarIdentity.sol`.
- If handoff/source variants exist (for example `*_noIR_*` filenames), treat this canonical path as the repository source of truth for build, test, deployment, and verification.

## Bytecode size discipline
- Compiler target: solc `0.8.24`, optimizer enabled, runs `200`, viaIR `false`.
- The identity contract is intentionally kept below the EIP-170 deployed code size cap (`24,576` bytes).
- CI coverage includes a bytecode-budget test to prevent accidental size regressions.

## Deployment status honesty
As of this repository state, `FreeTrialSubdomainRegistrarIdentity` is integrated and tested locally, but no new mainnet deployment record is declared here yet.
