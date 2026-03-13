# `alpha.agent.agi.eth` flagship flow

- Root is fixed in-contract (`parentName`, `parentNode`).
- `register(label)` creates `label.alpha.agent.agi.eth` in NameWrapper and mints soulbound identity token (`tokenId = uint256(node)`) in one transaction.
- `claimIdentity(label)` only works for names under this root.
- `syncIdentity` and `syncIdentityByLabel` are permissionless lazy-burn paths for expiry or ownership desync.
