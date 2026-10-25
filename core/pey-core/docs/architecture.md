# Pey Core Architecture Specification

This document describes the architecture of the Pey Core — the foundational runtime for the Pey plugin system.

## Table of Contents

1. [Core Responsibilities](#1-core-responsibilities)
2. [Module Overview](#2-module-overview)
3. [Runtime Host](#3-runtime-host)
4. [Startup Sequence](#4-startup-sequence)
5. [Shutdown Sequence](#5-shutdown-sequence)
6. [Plugin Lifecycle](#6-plugin-lifecycle)
7. [Private Startup Registry](#7-private-startup-registry)
8. [Service Registry](#8-service-registry)
9. [Event Bus](#9-event-bus)
10. [Configuration](#10-configuration)
11. [Security Model](#11-security-model)
12. [UI Layer](#12-ui-layer)
13. [Error Handling](#13-error-handling)
14. [Platform Neutrality](#14-platform-neutrality)

---

## 1. Core Responsibilities

The Core **IS**:
- A communication infrastructure (Registry + Event Bus + Lifecycle)
- The first to start and the last to shut down
- The enforcer of manifest declarations (services, events, dependencies)
- Platform-neutral — all environment interaction is injected by the Runtime Host

The Core **IS NOT**:
- A service provider (StorageService, RouterService, etc. come from plugins)
- A business logic container (no rules, calculations, or validation)
- A communication intermediary (calls are direct between plugin and service)
- A general logger (internal log covers only Core operations)
- An application state holder (business data lives in plugins)
- The Runtime Host (bootstrap, file reading, env access, module loading belong to the Host)

---

## 2. Module Overview

| Module | Responsibility |
|--------|----------------|
| `index.js` | Public entry point — exports the `PeyCore` class |
| `system-lifecycle.js` | Orchestrates startup/shutdown, wires modules together |
| `config-loader.js` | Validates configuration content, orchestrates env var substitution |
| `config-merger.js` | Deep-merges manifest defaults with project config |
| `env-substitutor.js` | Replaces `${VAR}` placeholders with environment values |
| `startup-validator.js` | Two-stage validation: declaration validation + actual-availability settlement |
| `startup-registry.js` | Private startup registry — holds prepared services until group commit |
| `registry.js` | Service registration, lookup, and deregistration with access control |
| `event-bus.js` | Publish/subscribe with enrichment, source forging prevention, declaration check |
| `plugin-lifecycle.js` | Group-based plugin startup (prepare → settle → bind+activate → commit), cascading deactivation |
| `ui-handler.js` | UI manifest validation, context building, entry point invocation (two-step loading) |
| `adapter-handler.js` | Injects active adapter name and configuration into infrastructure plugin config |
| `context-builder.js` | Assembles PrepareContext (no services) and ServiceMap (from both registries) |
| `security.js` | Shared access-control primitives (service/event declaration checks) |
| `error-manager.js` | PeyError structure, core error events, sensitive data validation |
| `internal-logger.js` | Core-only logging, security event recording |
| `internal-state.js` | Plugin records, status tracking, startup order, group membership, prepared/committed flags |

---

## 3. Runtime Host

The Runtime Host is the thin, platform-specific layer that sits outside the Core. It is not a plugin, is not managed by the Core, and has no manifest.

The Host provides three platform-neutral sources to the Core at construction time:

**ConfigSource:** Provides the final configuration content to the Core via `getConfig()`. How the content is obtained is platform-specific: a bundled object in the browser, a file read in Node.js, a native bridge in Capacitor or Tauri.

**EnvSource:** Provides runtime environment values on request via `get(varName)`. In Node.js this may wrap `process.env`. In the browser this source may be empty or build-time injected.

**ModuleLoader:** Provides platform-specific access to plugin and UI files via a two-step contract:
- `loadManifest(ref)` — returns the manifest as a parsed object. **Must not execute any plugin/UI code.**
- `loadEntry(ref)` — loads and evaluates the entry point, **after manifest validation has succeeded**.

The split guarantees: the manifest is read and validated before any plugin code runs. If manifest validation fails, `loadEntry()` is never called.

### Host Lifecycle

1. The Host prepares ConfigSource, EnvSource, and ModuleLoader for the current runtime.
2. The Host constructs the Core (`new PeyCore({ configSource, envSource, moduleLoader })`), injecting the three sources.
3. The Host calls `core.start()`. From this point the Core's own lifecycle takes over.
4. On shutdown, the Core shuts down first, then the Host releases any remaining host resources.

---

## 4. Startup Sequence

```
1. Construct PeyCore with injected sources (ConfigSource, EnvSource, ModuleLoader)
   └── Constructor validates all three sources

2. core.start()
   ├── Get config from configSource.getConfig()
   ├── Validate config structure (ConfigLoader)
   ├── Substitute ${ENV_VAR} placeholders (EnvSubstitutor via EnvSource)
   └── Create Core modules
       ├── InternalLogger
       ├── InternalState
       ├── EventBus
       ├── Registry (with Core manifest)
       └── StartupRegistry (private — internal to Core only)

3. Load ALL manifests via moduleLoader.loadManifest() — must not execute plugin code
   ├── For each plugin (two-step loading):
   │   ├── Step 1: Load manifest via moduleLoader.loadManifest(ref) — no code executed
   │   ├── Step 1a: Duplicate plugin name check — if name already registered → handleDeclarationFailure with DUPLICATE_PLUGIN_NAME
   │   ├── Step 1b: Structural validation — required fields present, correct types, name in vendor.name format
   │   │   └── If structure invalid → handleDeclarationFailure (infrastructure failure is fatal)
   │   └── Store validated manifest
   ├── Step 2: Declaration validation across ALL validated manifests (two-stage validation)
   │   ├── Architecture version compatibility
   │   ├── Service-provider uniqueness (exactly one provider per service name)
   │   ├── Required dependency has declared provider (across all manifests)
   │   └── adapterType rules (infrastructure only, no duplicates, adapter configured)
   │   └── System-fatal errors (duplicate service provider, duplicate adapterType) → core:startup-failed + stop
   │   └── Per-plugin errors → deactivate plugin (entry point never loaded)
   ├── Separate plugins into groups based on manifest.type:
   │   ├── Infrastructure group: type == "infrastructure"
   │   └── Application group: type in ["product", "feature", "platform", "transport"]

4. Process Infrastructure Group (group-based startup)
   For each infrastructure plugin (in configuration order):
   ├── Phase 1 — Preparation:
   │   ├── Merge config (manifest defaults + project config + adapter injection)
   │   ├── Build PrepareContext (config + events, NO services)
   │   ├── Load entry point via moduleLoader.loadEntry(ref)
   │   ├── Call entryModule.prepare(prepareContext) → returns prepared services
   │   └── Add prepared services to private StartupRegistry (validated against manifest.provides)
   ├── Phase 2 — Settlement:
   │   ├── Check actual availability of required dependencies
   │   ├── Cascade-deactivate plugins whose required provider did not prepare the service
   │   └── Infrastructure failure at any phase → fatal (stop entire system)
   ├── Phase 3 — Dependency Binding + Local Activation:
   │   ├── Build ServiceMap (from StartupRegistry + public Registry)
   │   ├── Call entryModule.activate(services) — plugin receives bound dependencies
   │   └── Activation failure → re-settle (cascade to dependents)
   └── Phase 4 — Group Commit:
       ├── Promote prepared services from StartupRegistry to public Registry
       ├── Mark all surviving plugins ACTIVE
       └── Publish {pluginname}:ready events in configuration order

5. Process Application Group (same four phases as infrastructure)
   ├── Application failure at any phase → non-fatal (cascading deactivation handles dependents)
   └── {pluginname}:ready published after group commit, in configuration order

6. Start UI (after both groups commit, same two-step loading order)
   ├── Load UI manifest via moduleLoader.loadManifest(ref)
   ├── Validate UI manifest (no type, no provides)
   ├── Load UI entry point via moduleLoader.loadEntry(ref)
   ├── Build UIContext (services, scoped events, config, onShutdown)
   ├── Invoke UI entry point
   │   └── Failure publishes core:ui-failed but continues
   └── Store UIContext for shutdown

7. Publish core:ready — the only global success event
```

## 4.1 Group-Based Startup

In architecture 0.11, plugins are processed in groups rather than sequentially. There are two groups:

| Group | Members | Failure Behavior |
|-------|---------|------------------|
| Infrastructure | `type: "infrastructure"` | Fatal — stops entire system |
| Application | `type: "product"`, `"feature"`, `"platform"`, `"transport"` | Non-fatal — cascading deactivation handles dependents |

Each group goes through four phases:

1. **Preparation** — Each plugin prepares its declared services without calling another application plugin's service. Prepared services go into the private StartupRegistry.
2. **Settlement** — Check actual availability of required dependencies. Cascade-deactivate plugins whose required provider did not prepare the service.
3. **Dependency Binding + Local Activation** — The Core binds direct service references for surviving plugins. Each plugin performs local activation.
4. **Group Commit** — Promote prepared services to the public Registry, mark plugins ACTIVE, publish `{pluginname}:ready` in configuration order.

## 4.2 Two-Phase Entry Point Contract

Plugins in architecture 0.11 export two functions instead of a single `setup()`:

```javascript
// Phase 1 — Preparation: no services available yet
export function prepare(prepareContext) {
  // prepareContext: { config, events, reportCriticalError, onShutdown, onDeactivated }
  // The plugin must NOT call another application plugin's service.
  // Returns: [{ name, object }] — prepared service implementations
}

// Phase 2 — Activation: bound dependencies available
export function activate(services) {
  // services: { serviceName -> serviceObject }
  // Resolved from StartupRegistry (same group) and public Registry (previous groups)
  // The plugin stores these references and performs local activation.
  // Returns: void (throws on failure)
}
```

## 4.3 Required Dependency Cycles

Required dependency cycles are supported **within a single group** but **not between groups**. An infrastructure plugin can depend on another infrastructure plugin, and application plugins can form cycles among themselves. However, an infrastructure plugin cannot require a service from an application plugin, and vice versa.

---

## 5. Shutdown Sequence

```
1. Publish core:shutdown

2. Stop UI (before any plugin)
   ├── Call uiContext.onShutdown()
   └── Errors logged but don't block

3. Stop plugins in reverse startup order
   For each plugin:
   ├── Call context.onShutdown()
   ├── Set status: INACTIVE
   ├── Deregister services from Registry
   │   └── Publishes core:service-unavailable for each
   └── Publish {pluginname}:stopped

4. Core stops

5. Control returns to the Runtime Host, which may release host-level resources
```

---

## 6. Plugin Lifecycle

### States
- **INACTIVE** — Registered but not fully started, or deactivated
- **ACTIVE** — Startup completed successfully, services registered

There is no "failed" state. A plugin that fails startup is simply INACTIVE.

### Startup (Group-Based, Four-Phase)
See [Startup Sequence](#4-startup-sequence) steps 4–5.

Plugins are processed in groups (infrastructure first, then application). Each group goes through four phases:

1. **Preparation** — Plugin exports `prepare(prepareContext)` which returns its declared services. Services go into the private StartupRegistry.
2. **Settlement** — Core checks actual availability of required dependencies. Plugins whose required provider did not prepare the service are cascade-deactivated.
3. **Dependency Binding + Local Activation** — Plugin exports `activate(services)` receiving bound dependencies from the StartupRegistry (same group) and public Registry (previous groups).
4. **Group Commit** — Services are promoted from StartupRegistry to the public Registry. Plugins are marked ACTIVE. `{pluginname}:ready` is published.

The two-step ModuleLoader contract guarantees: manifest is loaded and validated before any plugin code runs. If validation fails, the entry point is never loaded.

### Fatality on Missing Type
If the manifest's `type` field is missing or the manifest cannot be read, the Core cannot determine the plugin's role. In this case the failure is treated as **fatal** — the Core stops startup rather than risk continuing with an unclassifiable plugin. This conservative behavior ensures that infrastructure plugins are never silently skipped due to a malformed manifest.

### Critical Error at Runtime
1. Plugin calls `context.reportCriticalError(error)`
2. Core sets plugin status: INACTIVE
3. Calls `context.onDeactivated()` — **before** removing services
4. Deregisters services (publishes `core:service-unavailable`)
5. Publishes `core:plugin-crashed`
6. System continues with degraded capability

### Cascading Deactivation at Startup
If a plugin fails during preparation, binding, or activation, the Core cascade-deactivates every plugin that has a required dependency on a service the failed plugin did not make available. Each dependent produces `core:plugin-failed` with reason `REQUIRED_DEPENDENCY_UNAVAILABLE`. Services of deactivated plugins are removed silently from the private StartupRegistry (no `core:service-unavailable` because they were never public). The Core repeats settlement until no remaining plugin has an unavailable required dependency.

For any plugin that was prepared (its `prepare()` ran successfully), the Core calls `onDeactivated` **before** marking it INACTIVE — even if `activate()` was never reached. This ensures resources acquired during preparation (e.g. a database connection) are released. Plugin authors must register `onDeactivated` and `onShutdown` in `prepare()`, not `activate()`, because `activate()` may never be called.

> **Note:** Cascading deactivation applies only to the **application group**. An infrastructure plugin failure stops the entire system.

### Shutdown
1. Core calls `context.onShutdown()`
2. Sets status: INACTIVE
3. Deregisters services
4. Publishes `{pluginname}:stopped`

---

## 7. Private Startup Registry

The private StartupRegistry is a new data structure in architecture 0.11. It holds prepared services during startup until the group commits. It is internal to the Core and does not make a plugin publicly active.

### Purpose

Without a private startup registry, a plugin that prepares services would immediately make them public. Other plugins in the same group could then call those services before the group has fully settled — violating the group barrier and exposing a partially started plugin. The private registry holds prepared services until the group commits, ensuring a plugin is only publicly active once its entire group has succeeded.

### Rules

- The private startup registry is not visible outside the Core and does not make a plugin publicly active.
- A service not declared in the manifest cannot be prepared.
- `core:service-unavailable` is NOT published for a prepared service removed before group commit, because that service was never public.
- Services are promoted to the public Registry only after the group commits.

### Methods

| Method | Description |
|--------|-------------|
| `add(serviceName, serviceObject, providerPlugin, manifest)` | Add a prepared service (validated against manifest.provides) |
| `has(serviceName)` | Check if a service is in the registry |
| `get(serviceName)` | Get a service object |
| `getProvider(serviceName)` | Get the name of the plugin that prepared this service |
| `removeByPlugin(pluginName)` | Remove all services for a plugin (silent — no event) |
| `remove(serviceName)` | Remove a specific service |
| `promoteToPublic(registry, pluginName, manifest)` | Move prepared services to the public Registry during group commit |

---

## 8. Service Registry

### Registration
- Only services declared in `manifest.provides` can be registered
- Duplicate service names are rejected
- Registration happens during plugin startup (step 8)

### Lookup
- `registry.getForPlugin(serviceName, pluginName, manifest)`
- Validates that `serviceName` is in `manifest.dependencies` (required or optional)
- Returns `{ available: true, service }` or `{ available: false, reason }`
- Optional dependencies return `available: false` if not present — not an error

### Deregistration
- `registry.deregisterByPlugin(pluginName, eventBus)`
- Removes all services registered by that plugin
- Publishes `core:service-unavailable` for each

### Security
- Registry is **never** handed to plugins or UI
- Plugins receive direct service references at startup
- Access control enforced at startup only

---

## 8. Event Bus

### Publish
```javascript
eventBus.publish({ type, data }, sourcePluginName, manifest)
```

Enrichment added automatically:
- `id` — unique event ID
- `source` — from manifest.name (cannot be forged)
- `timestamp` — ISO 8601 UTC

Validation:
- `pluginEvent` must be object with string `type`
- `type` must be declared in `manifest.events` (unless source is `core`)

### Subscribe
```javascript
eventBus.subscribe(eventType, listener, subscriberName)
```
- `eventType` can be `"*"` for all events
- No access declaration required for listening
- Returns unsubscribe function

### Security
- Source is always taken from manifest, never from runtime
- Undeclared event publish → `EVENT_NOT_DECLARED_IN_MANIFEST` + security log
- Core publishes lifecycle events (`core:*`, `{pluginname}:ready/stopped`) without manifest declaration

---

## 9. Configuration

### Configuration Source

The Core receives its configuration content from `configSource.getConfig()`, provided by the Runtime Host. The Core never reads a file directly and never accesses platform-specific environment APIs directly.

### bootstrap.json Structure
```json
{
  "architecture": "0.11",
  "core": { "name": "pey.core", "version": "0.1.0" },
  "adapters": { "storage": "IndexedDBAdapter" },
  "ui": { "path": "./ui" },
  "plugins": [
    { "name": "acme.storage", "version": "1.0.0", "path": "./plugins/storage", "type": "infrastructure" }
  ],
  "config": { "acme.storage": { "timeout": 5000 } },
  "app": { "name": "MyApp", "version": "1.0.0" }
}
```

### Environment Variables
- Placeholders: `${VAR_NAME}` in any string value
- Required form: `{ "env": "${VAR_NAME}", "required": true }`
- Substitution happens at load time using EnvSource
- Resolved values **never** appear in logs, errors, or events

### Per-Plugin Config Merge
1. Start with `manifest.config` (defaults)
2. Deep-merge `config[pluginName]` (project overrides)
3. If infrastructure plugin has `adapterType`, inject `config.adapter = adapters[adapterType]` (and any related adapter configuration)

### Plugin Order in 0.11
The `plugins` array order in `bootstrap.json` determines the configuration order used for:
- **Preparation phase** — plugins are prepared in this order within each group
- **Dependency binding** — services are bound in this order
- **Local activation** — `activate(services)` is called in this order
- **`{pluginname}:ready` publication** — events are published in this order after group commit

> **Note:** The Core separates plugins into two groups (infrastructure and application) based on `manifest.type`. Within each group, the configuration order is preserved.

---

## 11. Security Model

### Enforcement Points
| Point | When | Violation Action |
|-------|------|------------------|
| Manifest validity | Startup | Plugin not started |
| Architecture version | Startup | Plugin not started |
| Required dependencies | Startup | Plugin deactivated (startup) / critical error (runtime) |
| Plugin name uniqueness | Startup | Plugin deactivated |
| adapterType (infrastructure only) | Startup | Validation fails |
| Duplicate adapterType | Startup | System fatal |
| adapterType without adapter | Startup | Plugin fails |
| Service access (dependencies) | Startup | Rejected + logged |
| Service registration (provides) | Startup | Rejected + logged |
| Event publishing | Runtime | Rejected + logged |
| Event source | Runtime | Auto-injected from manifest |
| Registry access | Always | Registry never handed to plugin or UI |
| Two-step loading order | Startup | loadEntry() never called on validation failure |

### Two-Step Loading Guarantee
The ModuleLoader's two-step contract (`loadManifest()` → validate → `loadEntry()`) guarantees that no unvalidated plugin code ever runs. If manifest validation fails, the entry point is never loaded.

### Registry Isolation
- The Registry is **internal to Core only** and is never handed to plugins or UI.
- Plugins receive direct service references at startup (via `activate(services)` or the legacy `setup(context)`).
- Access control is enforced at startup only — once a plugin has a service reference, calls are direct.
- The private StartupRegistry is also internal and does not make services publicly available until group commit.

### Cascading Deactivation
When a required dependency becomes unavailable at startup, the Core cascade-deactivates all dependent plugins. Each cascade produces `core:plugin-failed` with reason `REQUIRED_DEPENDENCY_UNAVAILABLE`. At runtime, a plugin that detects a missing required dependency reports a critical error, triggering the formal deactivation cycle.

### Security Logging
Core internal log records:
- Undeclared service access attempts
- Non-existent service access attempts
- Invalid manifest plugins
- Undeclared service registration attempts
- Undeclared event publish attempts

### Sensitive Data Rules
- Never in Event Bus (public)
- Never in error structure (not even `detail`)
- Only through declared services to authorized plugins
- Resolved env vars not retained longer than necessary

### Host Security
The Runtime Host is responsible for host-level security before the Core starts. The Core is the first Bonyan-level line of defense.

---

## 12. UI Layer

The UI is not a plugin but has a similar contract:

### UI Manifest
- No `type` field
- No `provides` field
- Has `dependencies`, `events`, `config`

### UI Context
```javascript
{
  services: Map,           // declared dependencies only
  events: {                // scoped EventBus
    publish(type, data),   // source = UI manifest name
    subscribe(type, listener)
  },
  config: Object,          // config.ui from bootstrap.json
  onShutdown: Function?    // set by UI entry point
}
```

### Startup (Two-Step Loading)
- UI starts at step 4 of system startup (after all plugins)
- Manifest loaded via `moduleLoader.loadManifest()`, validated, then entry point loaded via `moduleLoader.loadEntry()`
- If UI fails, `core:ui-failed` is published but the system continues

---

## 13. Error Handling

### Error Types
| Type | When | Handled By |
|------|------|------------|
| `startup` | During plugin loading | Core |
| `operational` | During normal operation | Plugin itself |
| `critical` | Plugin completely disabled | Core (via reportCriticalError) |

### Core Error Events
- `core:plugin-failed` — plugin failed during startup (including `REQUIRED_DEPENDENCY_UNAVAILABLE` for cascaded dependents)
- `core:plugin-crashed` — plugin reported critical error at runtime
- `core:ui-failed` — UI failed to start
- `core:startup-failed` — startup cannot continue (infrastructure failure)
- `core:service-unavailable` — service removed from Registry (runtime only; NOT published for prepared services removed before group commit)

See [Error Codes Catalog](error-codes.md) for complete list.

---

## 14. Platform Neutrality

The Core is platform-neutral. It contains no platform-specific APIs:
- Does not read files directly — configuration comes from ConfigSource
- Does not access `process.env` or similar — environment values come from EnvSource
- Does not load modules directly — module loading is via ModuleLoader

All environment interaction is provided by the Runtime Host through ConfigSource, EnvSource, and ModuleLoader. This separation is what makes the Core portable across browser, mobile, and desktop without changing application code.
