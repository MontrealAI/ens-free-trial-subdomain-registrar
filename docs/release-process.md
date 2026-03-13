# Release Process

This repository uses simple semantic versioning tags and GitHub Releases.

## Version strategy

- Stable releases: `vMAJOR.MINOR.PATCH`
- Optional prereleases: `vMAJOR.MINOR.PATCH-rc.N`
- First stable public mainnet release target: **`v1.0.0`**

Rationale: the contract is deployed and verified on Ethereum Mainnet, with production docs and CI in place.

## What goes into a release

Attach or reference at minimum:

- `release-assets/mainnet-deployment.json`
- Verified Etherscan link
- Contract address and deployment tx
- Parent activation tx and parent metadata
- Any major docs/UX changes since prior tag

## Maintainer checklist

1. Ensure `main` is green (`npm run ci`).
2. Confirm docs are up to date:
   - `README.md`
   - `docs/mainnet-deployment.md`
   - `docs/use-cases/alpha-agent-agi-eth.md`
   - `CHANGELOG.md`
3. Commit release prep updates.
4. Create and push tag:

```bash
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
```

5. Create GitHub release:

```bash
gh release create v1.0.0 \
  --title "v1.0.0 - Ethereum Mainnet production release" \
  --notes-file docs/releases/v1.0.0.md \
  release-assets/mainnet-deployment.json
```

## Suggested release title

`v1.0.0 - Ethereum Mainnet production release`

## Future release flow

- Patch (`v1.0.x`): bug fixes/docs-only corrections that do not change intended behavior.
- Minor (`v1.x.0`): additive, backward-compatible operator or script improvements.
- Major (`v2.0.0`): intentional breaking change to script behavior or contract interface.
