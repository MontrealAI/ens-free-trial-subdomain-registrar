# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and uses semantic version tags.

## [1.0.0] - 2026-03-13

### Added
- Public release polish for README trust signals, release process docs, and mainnet deployment references.
- Dedicated mainnet deployment record including contract address, tx hashes, NameWrapper constructor argument, and parent activation metadata.
- Machine-readable deployment manifest committed under `deployments/mainnet/`.
- GitHub release note categorization config (`.github/release.yml`).
- Release notes asset for maintainers (`release-assets/v1.0.0-mainnet.md`).

### Mainnet deployment reference
- Contract: `FreeTrialSubdomainRegistrar`
- Address: `0x7aAE649184182A01Ac7D8D5d7873903015C08761`
- Verified source: <https://etherscan.io/address/0x7aAE649184182A01Ac7D8D5d7873903015C08761#code>
- Deployment tx: `0x70a17265c9f3bc142b5b1c660f32439084672bf60e21a5d20e1dd233f4f39e0a`
- Parent activation tx: `0xddaa35a801612edd7dba3086e1740fb0c945d1eb1cc0c06f6b2ab78e713f6205`
