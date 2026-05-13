# Changelog

All notable changes to `@rebornix/lean` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release. Authentication (`auth login` / `status` /
  `logout`), issue management (`list` / `view` / `create` / `edit` /
  `close` / `comment`), raw GraphQL escape hatch (`api`), and
  token-budgeted discovery (`usage`).
- Structured JSON errors in agent mode with stable identifiers and
  exit codes (1 user, 2 auth, 3 network, 4 internal).
- Default-to-`@me` for `issue list`; `--all` opts out.
- 48 executable doc-tests against a forked Linear emulator.
- ESLint v9 + Prettier 3 mirroring `linear/linear`'s monorepo.

