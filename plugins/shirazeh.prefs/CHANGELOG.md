# Changelog

All notable changes to `shirazeh.prefs` are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows the Bonyan architecture rules.

## [0.1.0] - 2026-10-26

Initial experimental release. The 0.x range marks a plugin whose contract may still change.

### Added

- `shirazeh.prefs.service` with `get(key)` and `set(key, value)`: reads/writes `{ key, value }` records in the configured storage collection through `pey.storage.service`. Graceful degradation is the contract — a missing preference reads as null and a failed write returns false; storage problems reduce capability, never break the UI.
- Required dependency on `pey.storage.service`; runtime loss reported as a critical error via `core:service-unavailable`.
- Config key `collection` (`prefs`).
- Unit tests with a fake storage service and the manifest contract test.
