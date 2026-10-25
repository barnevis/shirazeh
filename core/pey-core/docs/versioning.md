# Pey Core Versioning & Compatibility

## Architecture Versioning

The Core architecture version follows `MAJOR.MINOR` format (e.g., `0.5`, `1.0`, `2.3`).

### Compatibility Rules

A plugin is compatible with the Core if:

1. **MAJOR matches exactly** — Plugin MAJOR == Core MAJOR
2. **Plugin MINOR ≤ Core MINOR** — Plugin can be older, not newer

```
Core: 0.5
Plugin: 0.5  ✓ (exact match)
Plugin: 0.4  ✓ (older minor)
Plugin: 0.6  ✗ (newer minor)
Plugin: 1.0  ✗ (different major)
```

### Rationale

- **MAJOR change** = Breaking changes to Core contracts (Registry, EventBus, PluginContext, etc.)
- **MINOR change (pre-1.0)** = May include breaking changes. Architecture version bumps (e.g., 0.10 → 0.11) indicate breaking changes.
- **MINOR change (post-1.0)** = Backward-compatible additions (new events, new optional config, etc.)
- Plugins written for older MINOR work on newer Core only if no breaking changes were introduced
- Plugins written for newer MINOR may use features that don't exist

### Pre-1.0 Breaking Changes Warning

**Important:** Until Core reaches version 1.0, MINOR version bumps may introduce breaking changes. For example, architecture 0.10 → 0.11 introduced:

- Two-phase entry point contract (`prepare` + `activate` instead of `setup`)
- Group-based startup (infrastructure group, then application group)
- Private StartupRegistry (replaces public Registry access during startup)
- New error codes (`REQUIRED_DEPENDENCY_UNAVAILABLE`, `MISSING_REQUIRED_DEPENDENCY_DECLARATION`)

A plugin written for architecture 0.10 will **not** work with Core 0.11, even though 0.10 ≤ 0.11 numerically. Plugin authors must update their `architecture` field to the new version and migrate their code accordingly.

After Core 1.0, the traditional SemVer rules apply: MINOR bumps are backward-compatible, MAJOR bumps are breaking.

## Plugin Versioning

Plugins use `MAJOR.MINOR.PATCH` (SemVer).

- **MAJOR** — Breaking changes to plugin's provided services or events
- **MINOR** — New services, events, or backward-compatible changes
- **PATCH** — Bug fixes, no API changes

## Version Compatibility Matrix

| Core Arch | Plugin Arch | Compatible? |
|-----------|-------------|-------------|
| 1.0       | 1.0         | ✓           |
| 1.0       | 0.5         | ✗ (MAJOR differs) |
| 1.2       | 1.0         | ✓           |
| 1.2       | 1.3         | ✗ (plugin MINOR > core MINOR) |
| 2.0       | 1.5         | ✗ (MAJOR differs) |
| 0.11      | 0.10        | ✗ (pre-1.0: MINOR may be breaking — see Pre-1.0 Breaking Changes Warning) |
| 0.11      | 0.11        | ✓           |

## Declaring Architecture Version

### In Plugin Manifest
```json
{
  "architecture": "0.11"
}
```

### In bootstrap.json
```json
{
  "architecture": "0.11"
}
```

The Core receives the architecture version from `configSource.getConfig()` at startup and passes it to StartupValidator.

## Breaking Changes (MAJOR)

The following require a Core MAJOR version bump:

- Changes to PluginContext structure
- Changes to EventBus publish/subscribe signatures
- Changes to Registry register/get/deregister signatures
- Changes to PluginContext lifecycle hooks
- Changes to PeyError structure
- Changes to Core error event names or data
- Changes to bootstrap.json required sections
- Changes to manifest schema (required fields, types)
- Removal of Core error codes
- Changes to security enforcement points

## Non-Breaking Changes (MINOR)

The following are MINOR (backward-compatible):

- New optional fields in PluginContext
- New Core error events (plugins don't need to handle)
- New optional config fields
- New optional manifest fields
- New Core error codes (for new failure modes)
- New optional services in Core manifest
- Performance improvements
- Bug fixes

## Plugin Compatibility Declaration

Plugins should declare the minimum Core architecture they support:

```json
{
  "architecture": "0.5"
}
```

This means: "I work with Core 0.5, 0.6, 0.7... but not 1.0+"

## Runtime Version Checks

The Core performs version validation at startup (StartupValidator). No runtime version checks occur — compatibility is enforced at startup only.

## Migration Guide Template

When releasing a new MAJOR version, provide a migration guide:

```markdown
# Migration from Core 0.x to 1.0

## Breaking Changes

1. **PluginContext.events.publish signature changed**
   - Old: `publish(eventType, data, callback)`
   - New: `publish(eventType, data)` returns Promise

2. **Registry.getForPlugin returns new structure changed**
   - Old: `{ service, available }`
   - New: `{ available, service, reason }`

## Migration Steps

1. Update plugin manifest `architecture` to `"1.0"`
2. Update `events.publish` calls to use new signature
3. Update `Registry.getFor` handling
3. Test with Core 1.0
```

## Version Negotiation (Future)

Future versions may support:
- Plugin declaring `architectureRange: ">=0.5 <2.0"`
- Core providing multiple architecture versions simultaneously
- Automatic adapter/shim layers for older plugins

## Current Version

**Core Architecture: 0.11**

This is a pre-1.0 version. MAJOR version 0 indicates unstable API — breaking changes may occur in MINOR versions until 1.0.

### Changes in 0.11

- Group-based startup: plugins separated into Infrastructure group (started first) and Application group (started second)
- Two-phase entry point contract: `prepare()` returns services → `activate()` receives bound dependencies
- Private StartupRegistry: holds prepared services until group commit; not visible to plugins
- Two-stage dependency validation: declaration validation → actual availability check before group commit
- Cascading deactivation at startup: failed required dependency cascades to dependents with `REQUIRED_DEPENDENCY_UNAVAILABLE`
- Required dependency cycles supported within groups
- Added `REQUIRED_DEPENDENCY_UNAVAILABLE` error code

### Changes in 0.9

- Introduced the Runtime Host architecture: the Core is now platform-neutral, constructed with injected ConfigSource, EnvSource, and ModuleLoader
- Replaced `start(bootstrapPath)` with the `PeyCore` class
- ModuleLoader uses a two-step contract: `loadManifest()` → validate → `loadEntry()`
- The Core no longer reads files, accesses `process.env`, or uses dynamic `import()` directly
- Added `INVALID_HOST_SOURCE` and `CORE_ALREADY_STARTED` error codes