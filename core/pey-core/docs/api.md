# Pey Core API Reference

## Public Entry Point

### `PeyCore` class

The Core is platform-neutral. It is constructed by the Runtime Host, which injects three platform-neutral sources at construction time: `configSource`, `envSource`, and `moduleLoader`.

```javascript
import { PeyCore } from '@pey/core';

const core = new PeyCore({ configSource, envSource, moduleLoader });
const { shutdown } = await core.start();
```

**Constructor parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `configSource` | object | Provides the parsed configuration content via `getConfig()` |
| `envSource` | object | Provides runtime environment values via `get(varName)` |
| `moduleLoader` | object | Provides platform-specific access to plugin/UI files via the two-step contract: `loadManifest(ref)` then `loadEntry(ref)` |

**Constructor validation:**
- `configSource` must have a `getConfig()` method
- `envSource` must have a `get(varName)` method
- `moduleLoader` must have `loadManifest(ref)` and `loadEntry(ref)` methods

If any source is missing or malformed, the constructor throws `INVALID_HOST_SOURCE`.

---

### `core.start()`

Starts the Pey Core system.

```javascript
const { shutdown } = await core.start();
```

**Returns:** `Promise<{ shutdown: Function }>` — An object with a `shutdown` function.

**Throws:**
- `INVALID_HOST_SOURCE` — if a source is missing or malformed (thrown at construction time)
- `CORE_ALREADY_STARTED` — if `start()` is called while the Core is already running

**Behavior (architecture 0.11):**
1. Pulls configuration from `configSource.getConfig()`
2. Validates configuration
3. Creates core modules (logger, state, eventBus, registry, startupRegistry)
4. Creates pluginLifecycle and uiHandler with the Host's `moduleLoader`
5. Starts **Infrastructure group** plugins (two-step loading: `loadManifest()` → validate → `loadEntry()`)
   - Preparation phase: all infrastructure plugins call `prepare()`
   - Settlement phase: infrastructure group commits
   - Binding+Activation phase: infrastructure plugins call `activate()` with bound dependencies
   - Group commit: infrastructure services registered in public Registry
6. Starts **Application group** plugins (same four-phase process)
7. Starts the UI (same two-step loading order)
8. Publishes `core:ready`

---

### `core.shutdown()`

Gracefully shuts down the system.

```javascript
await core.shutdown();
```

**Returns:** `Promise<void>`

**Behavior:**
1. Publishes `core:shutdown`
2. Stops UI (calls `onShutdown`)
3. Stops plugins in reverse group order (calls `onShutdown`, deregisters services)
4. Resolves when all plugins have stopped

No-op if `start()` was never called or already shut down. After `shutdown()`, `start()` can be called again.

---

## Runtime Host Sources

The Core expects the Runtime Host to provide these three interfaces:

### ConfigSource
```javascript
{
  async getConfig() {
    // Returns parsed configuration object (bootstrap.json content)
    // Must return object with: architecture, core, adapters, ui, plugins, config, app
  }
}
```

### EnvSource
```javascript
{
  get(varName) {
    // Returns string value or undefined
    // Used for ${VAR} environment variable substitution
  }
}
```

### ModuleLoader (two-step contract)
```javascript
{
  // Step 1: Load manifest — must NOT execute any plugin/UI code
  async loadManifest(ref) {
    // Returns parsed manifest object
  },

  // Step 2: Load entry point — only called after successful manifest validation
  async loadEntry(ref) {
    // Returns the entry module (e.g., { setup })
  }
}
```

**Loading order is mandatory.** The Core always calls `loadManifest()` first, validates the manifest, and only on success calls `loadEntry()`. If validation fails, `loadEntry()` is never called and the plugin/UI is marked inactive.

---

## PluginContext (Deprecated in 0.11)

In architecture 0.11, the single `setup(context)` entry point is replaced by a two-phase contract: `prepare(prepareContext)` and `activate(services)`. See [Plugin Authoring Guide](plugin-authoring.md) for details.

## PrepareContext (Phase 1 — Preparation)

The context object passed to a plugin's `prepare(prepareContext)` function.

```javascript
{
  // 1. Scoped Event Bus access
  events: {
    publish(eventType, data) => { success: boolean, error?: string },
    subscribe(eventType, listener) => unsubscribeFunction
  },

  // 2. Final merged configuration
  config: { /* manifest defaults overridden by project config */ },

  // 3. Lifecycle hooks (Core → Plugin)
  onShutdown: null,      // Plugin may assign: context.onShutdown = () => { ... }
  onDeactivated: null,   // Plugin may assign: context.onDeactivated = () => { ... }

  // 4. Critical error reporting (Plugin → Core)
  reportCriticalError: (error) => void
}
```

## Services Map (Phase 2 — Activation)

The services map passed to a plugin's `activate(services)` function.

```javascript
{
  // Service name -> service object
  // Resolved from StartupRegistry (same group) and public Registry (previous groups)
  [serviceName]: serviceObject
}
```

### `events.publish(eventType, data)`

Publishes an event with automatic enrichment.

**Parameters:**
- `eventType` (string) — Must be declared in `manifest.events`
- `data` (object) — Event payload (no sensitive data)

**Returns:** `{ success: boolean, error?: string }`

**Errors:**
- `INVALID_EVENT` — pluginEvent is null, not an object, or array
- `INVALID_EVENT_TYPE` — type is missing or empty string
- `EVENT_NOT_DECLARED_IN_MANIFEST` — eventType not in manifest.events

**Enrichment (added automatically):**
- `id` — unique event ID
- `source` — plugin's manifest.name (cannot be forged)
- `timestamp` — ISO 8601 UTC

---

### `events.subscribe(eventType, listener)`

Subscribes to an event type.

**Parameters:**
- `eventType` (string) — Event type to listen for, or `"*"` for all events
- `listener` (Function) — Callback: `(event) => void`

**Returns:** `Function` — Unsubscribe function

**Event object received by listener:**
```javascript
{
  id: "evt-1",
  type: "event:type",
  source: "plugin.name",
  timestamp: "2024-01-01T00:00:00.000Z",
  data: { /* payload */ }
}
```

---

### `reportCriticalError(error)`

Reports a critical error to the Core, triggering the deactivation cycle.

**Parameters:**
- `error` (object) — PeyError object with `code`, `message`, `type: "critical"`, etc.

**Behavior:**
1. Core sets plugin status to INACTIVE
2. Calls `onDeactivated()` if provided
3. Deregisters plugin's services (publishes `core:service-unavailable`)
4. Publishes `core:plugin-crashed`
5. System continues with degraded capability

---

## UIContext

The context object passed to the UI's `setup(context)` function.

```javascript
{
  services: { [serviceName]: serviceObject },
  events: {
    publish(eventType, data) => { success: boolean, error?: string },
    subscribe(eventType, listener) => unsubscribeFunction
  },
  config: { /* config.ui from bootstrap.json */ },
  onShutdown: null  // UI may assign: context.onShutdown = () => { ... }
}
```

**Differences from PluginContext:**
- No `provides` — UI does not provide services
- No `reportCriticalError` — UI is not a plugin
- No `onDeactivated` — UI has no services to deregister
- `events.publish` source is UI manifest name

---

## Core Manifest

The Core's own manifest (used for event publishing):

```javascript
{
  name: "pey.core",
  version: "0.1.0",
  architecture: "0.11",
  type: "infrastructure",
  dependencies: { required: [], optional: [] },
  provides: [],
  events: [
    { name: "core:ready", description: "", data: [] },
    { name: "core:shutdown", description: "", data: [] },
    { name: "core:plugin-failed", description: "", data: [] },
    { name: "core:plugin-crashed", description: "", data: [] },
    { name: "core:ui-failed", description: "", data: [] },
    { name: "core:startup-failed", description: "", data: [] },
    { name: "core:service-unavailable", description: "", data: [] }
  ],
  config: {}
}
```

---

## Internal Modules (Not Public API)

The following modules are internal and not exported by `index.js`. They are documented here for architecture understanding.

### `createPluginLifecycle(deps)`

Creates the plugin lifecycle manager.

**Dependencies:**
- `logger` — InternalLogger
- `internalState` — InternalState
- `registry` — Registry
- `eventBus` — EventBus
- `coreManifest` — Core manifest
- `moduleLoader` — The Runtime Host's module loader (two-step contract: `loadManifest` / `loadEntry`)

**Returns:** `{ startPlugin, reportCriticalError, stopPlugin }`

### `createUIHandler(deps)`

Creates the UI handler.

**Dependencies:**
- `logger` — InternalLogger
- `registry` — Registry
- `eventBus` — EventBus
- `coreManifest` — Core manifest
- `moduleLoader` — The Runtime Host's module loader (two-step contract)

**Returns:** `{ startUI, stopUI }`

### `createRegistry(logger, coreManifest)`

Creates the service registry.

**Methods:**
- `register(name, object, providerPlugin, manifest)` — Register a service
- `getForPlugin(name, pluginName, manifest)` — Get a service (with access check)
- `has(name)` — Check if service exists
- `remove(name)` — Remove a service
- `deregisterByPlugin(pluginName, eventBus)` — Remove all services by plugin

### `createEventBus(logger)`

Creates the event bus.

**Methods:**
- `publish(pluginEvent, sourcePluginName, manifest)` — Publish event
- `subscribe(eventType, listener, subscriberName)` — Subscribe to event

### `createInternalState()`

Creates the internal state manager.

**Methods:**
- `registerPlugin({ name, version, manifest, context })`
- `getPlugin(name)`
- `hasPlugin(name)`
- `setPluginStatus(name, status)`
- `getStartupOrder()`
- `addProvidedService(pluginName, serviceName)`
- `clearProvidedServices(pluginName)`

### `createInternalLogger()`

Creates the internal logger.

**Methods:**
- `info(message, context?)`
- `warn(message, context?)`
- `error(message, context?)`
- `security(message, context?)`
- `getEntries()`

---

## Error Codes

See [Error Codes Catalog](error-codes.md) for complete list.

---

## Core Events

See [Core Events Catalog](events.md) for complete list.
