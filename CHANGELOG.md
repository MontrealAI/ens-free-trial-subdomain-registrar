# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added
- Added flagship contract `FreeTrialSubdomainRegistrarIdentity` for atomic wrapped subname + soulbound ENS identity minting.
- Added identity-specific tests covering atomic minting, soulbound enforcement, claim, sync burn, and onchain tokenURI format.
- Added identity contract documentation at `docs/contracts/free-trial-subdomain-registrar-identity.md`.
- Added draft next-major release notes at `docs/releases/v2.0.0-draft.md`.

### Changed
- Updated deployment and verification scripts to support both `identity` (default) and `legacy` modes.
- Updated compiler/tooling baseline to Solidity `0.8.24` with optimizer runs 200.
- Updated README and deployment docs to clearly separate live v1.0.0 legacy deployment from pending identity deployment.

## [1.0.0] - 2026-03-13

### Added

- Added polished mainnet-focused README badges and trust links.
- Added dedicated Ethereum Mainnet deployment documentation at `docs/mainnet-deployment.md`.
- Added machine-readable deployment metadata at `release-assets/mainnet-deployment.json`.
- Added release process docs and a ready-to-publish `v1.0.0` release notes file.
- Added GitHub release-note category configuration at `.github/release.yml`.

### Changed

- Refined flagship `alpha.agent.agi.eth` use-case doc with direct links to live deployment references.
