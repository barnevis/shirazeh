# Pey Core Changelog

All notable changes to the Pey Core package.

## [0.2.2] — 1405-04-28

### Fixed
- **`onDeactivated` called during startup deactivation** — `handleGroupFailure` now calls `onDeactivated` for prepared plugins before marking them INACTIVE. This ensures resources acquired during `prepare()` (e.g. database connections) are released even when `activate()` is never reached — including settlement cascading, activation failure, and infrastructure group short-circuit.

### Documentation
- **Lifecycle hooks must be registered in `prepare()`** — `docs/plugin-authoring.md` now explicitly states that `onShutdown` and `onDeactivated` must be assigned during `prepare()`, not `activate()`, because `activate()` may never be called.

## [0.2.1] — 1405-04-27

### Fixed
- **`DUPLICATE_PLUGIN_NAME`** — New startup error code for duplicate plugin names in bootstrap.json. Detected in `loadAllManifests` before manifest storage; infrastructure plugin duplicates are fatal, application plugin duplicates are non-fatal.

## [0.2.0] — 1405-04-24

### Added
- **`REQUIRED_DEPENDENCY_UNAVAILABLE`** — New startup failure reason code (`STARTUP_FAILURE_REASON` enum in `src/error-manager.js`). Used when a plugin is deactivated during startup because a required dependency's provider did not become available; this deactivation cascades to the failed plugin's own required dependents.
- **`MISSING_REQUIRED_DEPENDENCY_DECLARATION`** — New startup error code for two-stage validation (Stage 1). Used when a required dependency has no declared provider in any manifest.
- **Private StartupRegistry** — New module (`src/startup-registry.js`) that holds prepared services until group commit. Not exposed to plugins.
- **Group-based startup** — Infrastructure group (type: "infrastructure") starts first, then Application group (type: "product", "feature", "platform", "transport"). Each group goes through four phases: preparation, settlement, binding+activation, commit.
- **Two-phase entry point contract** — Plugins now export `prepare(prepareContext)` and `activate(services)` instead of a single `setup(context)`.
- **Two-stage dependency validation** — Stage 1 validates declarations across all manifests before any entry point loads. Stage 2 checks actual availability before group commit.
- **Cascading deactivation at startup** — Failed required dependencies cascade to dependents with `REQUIRED_DEPENDENCY_UNAVAILABLE`.
- **Required dependency cycles within groups** — Supported via the prepare-then-bind approach.

### Changed
- **Architecture version** — Bumped from `0.10` to `0.11` in `manifest.json`
- **Package version** — Bumped from `0.1.0` to `0.2.0` in `package.json`
- **Plugin lifecycle** — Replaced 9-step per-plugin startup with four-phase group processor (`processGroup`)
- **Context builder** — Split into `buildPrepareContext` (no services) and `buildServiceMapForGroup` (resolves from both registries)
- **Startup validator** — Replaced per-plugin Registry check with cross-manifest declaration validation and settlement
- **Internal state** — Added `group`, `prepared`, `committed` fields and `markPrepared`/`markCommitted` methods
- **System lifecycle** — Group-based startup: load all manifests → declaration validation → process infrastructure group → process application group → UI → `core:ready`
- **Plugin authoring** — Entry point contract changed from `setup(context)` to `prepare(prepareContext)` + `activate(services)`
- **Error codes** — Renamed `MISSING_REQUIRED_DEPENDENCY` to `MISSING_REQUIRED_DEPENDENCY_DECLARATION` (Stage 1); added `REQUIRED_DEPENDENCY_UNAVAILABLE` (Stage 2)
- **Entry point contract** — Plugins must export `prepare()` and `activate()` instead of `setup()`. See [`docs/plugin-authoring.md`](docs/plugin-authoring.md) for migration guide.
- **Startup order** — Plugins now start in groups (infrastructure first, then application). See [`docs/configuration.md`](docs/configuration.md) for plugin order.
- **Dependency validation** — Required dependencies must be declared in some manifest's `provides` (Stage 1) AND actually prepared by their provider (Stage 2).
- **Registry access** — Plugins no longer receive direct Registry reference during startup. Use `prepareContext` for config/events and `services` map for bound dependencies.
- **`pluginname:ready` event** — Now published after group commit, not after individual plugin completion.
- **`core:service-unavailable`** — No longer published for prepared services removed before group commit.

### Migration
- Full migration plan: [`plans/architecture-0.11-migration.md`](plans/architecture-0.11-migration.md)
- Plugin migration: [`docs/plugin-authoring.md`](docs/plugin-authoring.md) — update entry point from `setup(context)` to `prepare(prepareContext)` + `activate(services)`
- Version compatibility: [`docs/versioning.md`](docs/versioning.md) — architecture 0.10 plugins are NOT compatible with Core 0.11 (pre-1.0 breaking changes in MINOR)

## [0.1.0] — 1405-04-17

### Added
- **Core Architecture** — Complete implementation of the Pey Core runtime
- **Runtime Host architecture** — Platform-neutral Core with three injected sources: `configSource`, `envSource`, and `moduleLoader`
- **`PeyCore` class** — Public entry point with constructor source validation and `start()` / `shutdown()` methods
- **ModuleLoader two-step contract** — Mandatory two-step loading: `loadManifest(ref)` (must not execute plugin/UI code) then `loadEntry(ref)` (called only after successful manifest validation)
- **ConfigLoader** — bootstrap.json loading, validation, env var substitution
- **ConfigMerger** — Deep merge of manifest defaults with project config
- **EnvSubstitutor** — `${VAR}` and `{ env, required }` placeholder resolution
- **StartupValidator** — Architecture version, uniqueness, dependencies, adapterType validation
- **Registry** — Service registration, lookup, deregistration with access control
- **EventBus** — Publish/subscribe with enrichment, source forging prevention, declaration check
- **PluginLifecycle** — 9-step startup, crash handling, shutdown with rollback
- **UIHandler** — UI manifest validation, context building, entry point invocation
- **AdapterHandler** — Adapter config injection for infrastructure plugins
- **ContextBuilder** — PluginContext assembly (services, scoped events, config, hooks)
- **Security** — Shared access-control primitives (service/event declaration checks)
- **ErrorManager** — PeyError structure, core error events, sensitive data validation
- **InternalLogger** — Core-only logging, security event recording
- **InternalState** — Plugin records, status tracking, startup order
- **SystemLifecycle** — Full startup/shutdown orchestration

### Changed
- **Public API** — Replaced `start(bootstrapPath)` with the `PeyCore` class, constructed by the Runtime Host with three injected sources
- **`plugin-lifecycle.js`** — Replaced the two optional loaders (`loadModule`, `readManifest`) with a single required `moduleLoader` parameter exposing the two-step contract
- **`ui-handler.js`** — Same two-step `moduleLoader` adaptation as plugin-lifecycle
- **`system-lifecycle.js`** — `start()` now accepts `(configContent, envSource, moduleLoader)` and passes the single `moduleLoader` to plugin and UI handlers

### Added (Error Codes)
- **`INVALID_HOST_SOURCE`** — Thrown when a Runtime Host source is missing or malformed
- **`CORE_ALREADY_STARTED`** — Thrown when `start()` is called while the Core is already running

### Security
- **Two-step loading guarantee** — No unvalidated plugin or UI code ever runs; the entry point is loaded only after successful manifest validation
- **Host security** — The Runtime Host is responsible for host-level security before the Core starts
- Manifest-based access control (services, events, dependencies)
- Event source forging prevention (auto-injected from manifest)
- Registry isolation (never exposed to plugins/UI)
- Sensitive data protection (heuristic check, never in events/errors)
- Security logging (unauthorized access attempts recorded)

### Testing
- 223 tests across 16 test files
- Unit tests use fake two-step ModuleLoader (loadManifest / loadEntry)
- Integration tests use a Node.js-style Runtime Host (file-backed ConfigSource, process.env EnvSource, fs + import ModuleLoader) via the `PeyCore` class
- All tests passing

### Documentation
- Architecture Specification
- API Reference
- Configuration Guide
- Manifest Schema
- Error Codes Catalog
- Core Events Catalog
- Security Model
- Testing Guide
- Adapter Integration Guide
- Plugin Authoring Guide
- UI Integration Guide
- Versioning & Compatibility
