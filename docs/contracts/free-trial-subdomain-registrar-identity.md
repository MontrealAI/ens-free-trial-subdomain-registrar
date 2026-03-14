# FreeTrialSubdomainRegistrarIdentity

Single active production contract.

## Public API
- `register(string label)`
- `claimIdentity(string label)`
- `syncIdentity(uint256 tokenId)`
- `syncIdentityByLabel(string label)`
- `available(string label)`
- `validateLabel(string label)`
- `preview(string label)`
- `rootHealth()`

## Root scope
Hard-coded to `alpha.agent.agi.eth` and its canonical root node.
No generic multi-parent flow is active.
