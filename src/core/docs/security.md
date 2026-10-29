# Pey Core Security Model

## Foundational Principle

**Anything not declared is forbidden.**

The Core enforces security at multiple enforcement points. Plugins and UI only receive what they have explicitly declared in their manifests.

## Enforcement Points

| Enforcement Point | When | Violation Action |
|-------------------|------|------------------|
| Manifest validity | Startup | Plugin not started |
| Architecture version compatibility | Startup | Plugin not started |
| Required dependencies exist | Startup | Plugin deactivated |
| Plugin name uniqueness | Startup | Plugin deactivated |
| `adapterType` only for infrastructure | Startup | Plugin validation fails |
| Duplicate `adapterType` | Startup | System startup error (fatal) |
| `adapterType` with no adapter configured | Startup | Plugin fails to start |
| Service access (dependencies) | Startup | Undeclared access rejected + logged |
| Service registration (provides) | Startup | Undeclared registration rejected + logged |
| Event publishing (events) | Runtime | Undeclared event rejected + logged |
| Event source | Runtime | Auto-injected from manifest; cannot be forged |
| Registry access | Always | Registry never handed to plugin or UI |
| Two-step loading order | Startup | `loadEntry()` never called on manifest validation failure |
| Host source validation | Construction | `INVALID_HOST_SOURCE` thrown if a source is missing or malformed |

## Two-Step Loading Guarantee

The ModuleLoader's two-step contract (`loadManifest()` → validate → `loadEntry()`) guarantees that no unvalidated plugin or UI code ever runs. If manifest validation fails, the entry point is never loaded and the plugin/UI is marked inactive.

## Host Security

The Runtime Host is responsible for host-level security before the Core starts. The Core is the first Bonyan-level line of defense. The Host provides ConfigSource, EnvSource, and ModuleLoader — all platform-specific security concerns (file access, environment access, module loading) belong to the Host.

## Access Control Model

### Service Access
- **At startup:** Plugin declares dependencies in `manifest.dependencies` (required + optional)
- **Validation:** StartupValidator checks required services exist in Registry
- **Runtime:** Plugin receives direct service references — no intermediary
- **Security:** Registry never exposed to plugins; access control only at startup

### Event Publishing
- **Declaration:** Plugin declares events in `manifest.events`
- **Validation:** EventBus checks each publish against manifest
- **Source forging prevention:** Source automatically set from `manifest.name`
- **Core events:** Core publishes `core:*` and `{pluginname}:ready/stopped` without manifest declaration

### Registry Isolation
- Registry is **internal to Core only**
- Plugins never receive Registry reference
- Plugins hold only direct service references given at startup
- This prevents enumeration or access to undeclared services
- **StartupRegistry (private)** is never exposed to plugins or UI — it holds prepared services until group commit

## Security Logging

The Core maintains an internal security log (not accessible to plugins). Recorded events:

- Attempt to access an undeclared service
- Attempt to access a service that does not exist
- Plugin started with invalid manifest
- Attempt to register an undeclared service
- Attempt to publish an undeclared event

Log entries include:
- Timestamp
- Event type
- Source plugin (or "core")
- Relevant details (service name, event type, etc.)

## Sensitive Data Rules

| Rule | Enforcement |
|------|-------------|
| Sensitive data not in Event Bus | EventBus is public; validation in error-manager |
| Sensitive data not in error structure | `hasNoSensitiveData` check on error creation |
| Sensitive data only through declared services | Access control at startup |
| Resolved env vars not in logs/errors | Substituted values stored in config objects but must not appear in logs, errors, or event payloads |

### What Counts as Sensitive
Heuristic check for strings containing (case-insensitive):
- `password`
- `token`
- `secret`
- `apikey`
- `api_key`

Applied to both **keys and values** in objects (recursively).

## Plugin Security Responsibilities

### At Startup
- Declare all required and optional service dependencies
- Declare all events the plugin will publish
- Declare all services the plugin provides
- Use `config` for non-sensitive configuration only

### At Runtime
- Never expose sensitive data through events
- Never put sensitive data in error `detail` fields
- Report critical errors via `context.reportCriticalError()`
- Implement `onDeactivated` to transition services to unavailable state
- Implement `onShutdown` to release resources

### Service Implementation
Services must know when their providing plugin is deactivated and return standard Pey errors. The mechanism is plugin-specific (e.g., internal flag set in `onDeactivated`).

### Cascading Deactivation at Startup
If a required dependency is not prepared (e.g., infrastructure group fails), the Core cascades deactivation to all dependents with `REQUIRED_DEPENDENCY_UNAVAILABLE` error reason. This ensures failed dependencies propagate through the entire dependency graph.

## UI Security

The UI follows the same model as plugins but with restrictions:
- No `type`, `provides`, or `adapterType` in manifest
- No `reportCriticalError` or `onDeactivated` in context
- Receives only declared service dependencies
- Event source is UI manifest name
- Shutdown via `onShutdown` only

## Security Checklist for Plugin Authors

- [ ] All service dependencies declared in `dependencies`
- [ ] All published events declared in `events`
- [ ] All provided services declared in `provides`
- [ ] No sensitive data in event payloads
- [ ] No sensitive data in error `detail` fields
- [ ] `onDeactivated` implemented to mark services unavailable
- [ ] `onShutdown` implemented to release resources
- [ ] Critical errors reported via `reportCriticalError`
- [ ] Config contains no secrets (use env vars with substitution)

## Security Checklist for Core Integrators

- [ ] Provide `configSource` with `getConfig()` method
- [ ] Provide `envSource` with `get()` method and only necessary environment variables
- [ ] Provide `moduleLoader` with `loadManifest()` and `loadEntry()` methods
- [ ] Never expose Core internal modules (Registry, EventBus, InternalState) to plugins
- [ ] Validate all host-provided configuration before passing to Core
- [ ] Monitor Core internal security log for anomalies