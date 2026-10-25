# Pey Core Manifest Schema

## Plugin Manifest

Every plugin must have a `manifest.json` in its root folder. The manifest file name and JSON format are architectural — they ensure that `moduleLoader.loadManifest()` can locate and parse the manifest on every supported platform without prior negotiation.

```json
{
  "name": "acme.storage",
  "version": "1.0.0",
  "architecture": "0.11",
  "description": "Storage infrastructure plugin",
  "type": "infrastructure",
  "dependencies": {
    "required": ["acme.logger"],
    "optional": ["acme.metrics"]
  },
  "provides": [
    {
      "name": "acme.storage.service",
      "description": "Persistent storage service",
      "methods": ["get", "set", "delete", "list"]
    }
  ],
  "events": [
    {
      "name": "storage:changed",
      "description": "Fired when storage data changes",
      "data": [
        { "name": "key", "type": "string" },
        { "name": "operation", "type": "string" }
      ]
    }
  ],
  "config": {
    "timeout": 5000,
    "retries": 3
  },
  "adapterType": "storage"
}
```

## Field Reference

### `name` (required, string)
Unique plugin identifier in `vendor.name` format. Must be unique across all plugins.

### `version` (required, string)
Plugin version in `MAJOR.MINOR.PATCH` format.

### `architecture` (required, string)
Required Core architecture version in `MAJOR.MINOR` format.

**Compatibility:**
- MAJOR must match Core's architecture MAJOR
- Plugin MINOR ≤ Core MINOR

### `description` (required, string)
Human-readable description of the plugin.

### `type` (required, string)
One of:
- `"infrastructure"` — Provides adapters, failure is fatal
- `"platform"` — Platform services (router, etc.)
- `"product"` — Application features, failure is non-fatal
- `"feature"` — Feature-level plugins
- `"transport"` — Transport-layer plugins

Any other value is rejected during structural validation (Step 1b) with `INVALID_MANIFEST_STRUCTURE`.

### `dependencies` (required, object)
```json
{
  "required": ["service.name"],
  "optional": ["service.name"]
}
```
- `required` — Services that must be available after group commit (checked in two stages)
- `optional` — Services used if available, not an error if absent

**Two-stage validation (architecture 0.11):**
1. **Declaration validation** — Before any entry point loads, the Core verifies that every required dependency is declared in some validated manifest's `provides`.
2. **Actual availability check** — Before group commit, the Core verifies that the provider actually prepared the service. If not, the plugin is cascade-deactivated with reason `REQUIRED_DEPENDENCY_UNAVAILABLE`.

> **Required dependency cycles** are supported within a single group (infrastructure or application) but not between groups.

### `provides` (required, array)
Services this plugin registers in the Registry.

Each entry:
- `name` (string) — Service name (must be unique)
- `description` (string)
- `methods` (array of strings) — Method names for documentation

### `events` (required, array)
Events this plugin can publish.

Each entry:
- `name` (string) — Event type (e.g., `"storage:changed"`)
- `description` (string)
- `data` (array of objects) — Expected data fields for documentation. Each field specifies its name and type; purely descriptive, the Core never reads it at runtime.

```json
"data": [
  { "name": "key", "type": "string" },
  { "name": "operation", "type": "string" }
]
```

### `config` (optional, object)
Default configuration values. Merged with project config from `bootstrap.json`.

### `adapterType` (optional, string)
**Only for `type: "infrastructure"` plugins.** Declares which adapter this plugin uses.

```json
"adapterType": "storage"
```

The Core injects `config.adapter = bootstrap.adapters[adapterType]` into the plugin's final config.

**Validation:**
- Only allowed for `type: "infrastructure"`
- Must be unique across infrastructure plugins
- Corresponding adapter must exist in `bootstrap.json` adapters

---

## UI Manifest

The UI manifest is similar to a plugin manifest but with restrictions. Like plugin manifests, the UI manifest is loaded via `moduleLoader.loadManifest()` and validated before the UI entry point is loaded via `moduleLoader.loadEntry()`.

```json
{
  "name": "myapp.ui",
  "version": "1.0.0",
  "architecture": "0.11",
  "description": "Main application UI",
  "dependencies": {
    "required": ["acme.router.service"],
    "optional": ["acme.auth.service"]
  },
  "events": [
    {
      "name": "ui:navigate",
      "description": "Navigation event",
      "data": [
        { "name": "route", "type": "string" }
      ]
    }
  ],
  "config": {
    "theme": "dark"
  }
}
```

## Restrictions

| Field | Plugin | UI |
|-------|--------|-----|
| `type` | Required | **Forbidden** |
| `provides` | Required | **Forbidden** |
| `adapterType` | Optional (infrastructure only) | **Forbidden** |
| `reportCriticalError` | Available in context | Not available |
| `onDeactivated` | Available in context | Not available |

---

## Validation Rules

### Plugin Manifest
| Rule | Error Code |
|------|------------|
| Missing required field | `INVALID_MANIFEST` |
| `name` not in `vendor.name` format | `INVALID_MANIFEST` |
| `architecture` not `MAJOR.MINOR` | `INVALID_MANIFEST` |
| `type` not one of allowed values | `INVALID_MANIFEST` |
| `adapterType` on non-infrastructure | `ADAPTER_TYPE_NOT_ALLOWED` |
| Duplicate service in `provides` | `INVALID_MANIFEST` |
| Service in `provides` missing `name` | `INVALID_MANIFEST` |

### UI Manifest
| Rule | Error Code |
|------|------------|
| Has `type` field | `INVALID_UI_MANIFEST` |
| Has `provides` field | `INVALID_UI_MANIFEST` |
| Has `adapterType` field | `INVALID_UI_MANIFEST` |

---

## Example: Complete Plugin Manifest

```json
{
  "name": "acme.storage",
  "version": "1.2.0",
  "architecture": "0.11",
  "description": "IndexedDB storage infrastructure",
  "type": "infrastructure",
  "dependencies": {
    "required": ["acme.logger"],
    "optional": ["acme.metrics"]
  },
  "provides": [
    {
      "name": "acme.storage.service",
      "description": "Key-value storage with persistence",
      "methods": ["get", "set", "delete", "list", "clear"]
    }
  ],
  "events": [
    {
      "name": "storage:changed",
      "description": "Fired when a key is set or deleted",
      "data": [
        { "name": "key", "type": "string" },
        { "name": "operation", "type": "string" },
        { "name": "oldValue", "type": "any" },
        { "name": "newValue", "type": "any" }
      ]
    },
    {
      "name": "storage:error",
      "description": "Fired on storage operation failure",
      "data": [
        { "name": "key", "type": "string" },
        { "name": "operation", "type": "string" },
        { "name": "error", "type": "string" }
      ]
    }
  ],
  "config": {
    "dbName": "app-db",
    "timeout": 5000,
    "retries": 3
  },
  "adapterType": "storage"
}
```

---

## Example: Complete UI Manifest

```json
{
  "name": "myapp.ui",
  "version": "1.0.0",
  "architecture": "0.11",
  "description": "Main application UI",
  "dependencies": {
    "required": ["acme.router.service", "acme.auth.service"],
    "optional": ["acme.notifications.service"]
  },
  "events": [
    {
      "name": "ui:navigate",
      "description": "User navigated to a route",
      "data": [
        { "name": "route", "type": "string" },
        { "name": "params", "type": "object" }
      ]
    },
    {
      "name": "ui:error",
      "description": "UI error occurred",
      "data": [
        { "name": "message", "type": "string" },
        { "name": "stack", "type": "string" }
      ]
    }
  ],
  "config": {
    "theme": "dark",
    "language": "en",
    "apiBaseUrl": "/api"
  }
}