# Release Process

This repository uses semantic-versioned tags and GitHub Releases, while separating **live deployment history** from **code readiness**.

## Current release baseline

- Current live release: `v1.0.0` (legacy `FreeTrialSubdomainRegistrar` on mainnet).
- Next planned release: `v2.0.0` centered on `FreeTrialSubdomainRegistrarIdentity`.
- Honesty rule: do not mark `v2.0.0` as mainnet-live until identity deployment + verification evidence is published.

## Version strategy

- Stable releases: `vMAJOR.MINOR.PATCH`
- Optional prereleases: `vMAJOR.MINOR.PATCH-rc.N`
- Major bump policy: use a major version for contract-surface evolution and architecture repositioning.

### Why next release is major (`v2.0.0`)

`FreeTrialSubdomainRegistrarIdentity` changes the product center from registrar-only to an ENS identity primitive (atomic wrapped subname + soulbound NFT + sync/claim lifecycle). That is an architectural elevation significant enough to justify a major release.

## What goes into a release

Attach/reference at minimum:

- Deployment manifest(s): `release-assets/mainnet-deployment.json` plus new identity manifest after deployment.
- Verified Etherscan links.
- Contract addresses + deployment tx hashes.
- Parent setup / activation transaction references.
- Updated docs:
  - `README.md`
  - `docs/mainnet-deployment.md`
  - `docs/contracts/free-trial-subdomain-registrar-identity.md`
  - `CHANGELOG.md`

## Maintainer checklist (identity release)

1. Ensure `main` is green (`npm run ci`).
2. Confirm draft release notes are updated: `docs/releases/v2.0.0-draft.md`.
3. Confirm deployment status wording is honest (pending vs live).
4. Deploy identity contract on mainnet with explicit identity mode.
5. Verify on Etherscan and persist manifest metadata.
6. Update docs with final deployment address + tx + verification link.
7. Commit release-prep updates.
8. Tag and push:

```bash
git tag -a v2.0.0 -m "v2.0.0"
git push origin v2.0.0
```

9. Publish GitHub release:

```bash
gh release create v2.0.0 \
  --title "v2.0.0 - ENS identity primitive flagship" \
  --notes-file docs/releases/v2.0.0-draft.md \
  release-assets/mainnet-deployment.json
```

## Suggested release titles

- `v1.0.0 - Ethereum Mainnet production release` (already published baseline)
- `v2.0.0 - ENS identity primitive flagship` (next major target)

## Future release flow

- Patch (`vX.Y.z`): bug fixes/docs corrections with no intended behavior shift.
- Minor (`vX.y.0`): additive, backward-compatible script/operator improvements.
- Major (`vX.0.0`): intentional contract/API architecture evolution.
