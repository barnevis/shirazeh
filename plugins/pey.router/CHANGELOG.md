# Changelog

All notable changes to `pey.router` are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-08-08

Initial release of `pey.router`, an infrastructure plugin for Bonyan architecture `0.11` providing client-side navigation, route registration, route matching, and current-route state through a replaceable Router adapter.

### Added

- Router service (`pey.router.service`) with the methods `registerRoutes`, `navigate`, `replace`, `back`, `forward`, `getCurrentRoute`, and `matchRoute`, wired into the Bonyan plugin lifecycle (`prepare` and `activate`).
- Cumulative, atomic route pattern registration via `registerRoutes` using the fixed `:paramName` segment syntax; a malformed pattern rejects the whole batch without partial registration.
- `navigate` and `replace` with query support through `NavigateOptions`, redirecting unmatched paths to the configured `notFoundPath`.
- `back` and `forward` thin wrappers over the adapter's history stack, with the same unmatched-path fallback.
- Synchronous `getCurrentRoute` returning the active `Route` (with `isNotFound: true` before any registered pattern matches) and `matchRoute`, the service's sole synchronous exception, throwing `ROUTER_MALFORMED_PATTERN` on a malformed pattern and returning `null` for a valid non-match.
- Events `router:changed` and `router:navigation-failed` (with the exhaustive `reason` code `ROUTE_NOT_FOUND`), published in a fixed order on unmatched navigation.
- Browser history Router adapter, plus an in-memory test fake, behind a shared adapter contract.
- Standardized structured error handling with the error codes `ROUTER_MALFORMED_PATH`, `ROUTER_MALFORMED_QUERY`, `ROUTER_MALFORMED_PATTERN`, and `ROUTER_NAVIGATION_FAILED`, all operational.
- Adapter error normalization that preserves a `detail.fatal` flag as the sole condition for reporting a Critical error to the Core; every other adapter failure is contained and logged, never escalates, and never crosses the plugin boundary.
- Startup handling that treats a failed initial `onExternalChange` subscription as a preparation error.
- Base path and query utilities, primitive query value validation, path matching and parameter extraction.
- Config keys `basePath` (default `/`) and `notFoundPath` (default `/not-found`).
- Complete reference documentation (`docs/reference.md`), README, requirements and implementation planning artifacts, and the shared adapter-contract test suite.
