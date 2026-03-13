# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

- Added new flagship contract `FreeTrialSubdomainRegistrarIdentity` with atomic wrapped subname registration plus soulbound identity minting.
- Added identity sync and backfill flows: `syncIdentity(tokenId)` and `claimIdentity(node)`.
- Added fully onchain metadata/SVG token URI generation for identity tokens.
- Added identity-focused deployment and verification scripts for mainnet (`deploy:identity:mainnet`, `verify:identity:mainnet`).
- Added dedicated identity contract documentation at `docs/contracts/free-trial-subdomain-registrar-identity.md`.
- Added identity contract test coverage in `test/FreeTrialSubdomainRegistrarIdentity.test.ts`.

### Changed

- Updated Hardhat compiler settings to support both `0.8.17` (legacy contract) and `0.8.24` (identity contract).
- Updated top-level README and mainnet deployment docs to clearly separate:
  - current live v1.0.0 registrar deployment, and
  - pending next identity deployment.

## [1.0.0] - 2026-03-13

### Added

- Added polished mainnet-focused README badges and trust links.
- Added dedicated Ethereum Mainnet deployment documentation at `docs/mainnet-deployment.md`.
- Added machine-readable deployment metadata at `release-assets/mainnet-deployment.json`.
- Added release process docs and a ready-to-publish `v1.0.0` release notes file.
- Added GitHub release-note category configuration at `.github/release.yml`.

### Changed

- Refined flagship `alpha.agent.agi.eth` use-case doc with direct links to live deployment references.
