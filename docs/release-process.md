# Release Process

This project uses simple semantic versioning tags and GitHub Releases.

## Versioning strategy

- Stable tags: `vMAJOR.MINOR.PATCH` (for example `v1.0.0`)
- Optional prerelease tags: `vMAJOR.MINOR.PATCH-rc.N`
- Use prerelease tags only when intentionally signaling a release candidate.

Current recommended first stable public mainnet release: **`v1.0.0`**.

## Release checklist

1. Ensure docs and deployment metadata are current:
   - `README.md`
   - `docs/mainnet-deployment.md`
   - `docs/use-cases/alpha-agent-agi-eth.md`
   - `CHANGELOG.md`
2. Run validation:

   ```bash
   npm ci
   npm run build
   npm test
   npm run typecheck
   ```

3. Commit release prep changes.
4. Create annotated tag:

   ```bash
   git tag -a v1.0.0 -m "v1.0.0: mainnet public release"
   git push origin v1.0.0
   ```

5. Create GitHub release (CLI):

   ```bash
   gh release create v1.0.0 \
     --title "v1.0.0 - Mainnet Public Release" \
     --notes-file release-assets/v1.0.0-mainnet.md
   ```

6. Attach or reference these assets/links in the release page:
   - mainnet deployment doc: `docs/mainnet-deployment.md`
   - deployment manifest JSON under `deployments/mainnet/`
   - verified Etherscan contract URL
   - deployment tx and activation tx links

## Future releases

- Update `CHANGELOG.md` first.
- Keep release notes short and operator-centric.
- Call out any security-sensitive changes (expiry math, fuses, authorization, value handling).
- If behavior changes, update tests and docs in the same release PR.
