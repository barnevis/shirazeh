# Pey Core Configuration Guide

## Configuration Source

The Core is platform-neutral. It does not read configuration files directly. Configuration content is provided to the Core through `configSource.getConfig()`, injected by the Runtime Host at construction time.

How ConfigSource obtains the configuration is platform-specific: a bundled object in the browser, a file read in Node.js, a native bridge in Capacitor or Tauri. The Core only receives the parsed content.

## bootstrap.json Structure

The `bootstrap.json` file is the single configuration file that drives the entire system startup. Its content is provided to the Core via ConfigSource.

```json
{
  "architecture": "0.11",
  "core": {
    "name": "pey.core",
    "version": "0.1.0"
  },
  "adapters": {
    "storage": "IndexedDBAdapter",
    "auth": "OAuthAdapter"
  },
  "ui": {
    "path": "./ui"
  },
  "plugins": [
    {
      "name": "acme.storage",
      "version": "1.0.0",
      "path": "./plugins/storage"
    },
    {
      "name": "acme.router",
      "version": "1.0.0",
      "path": "./plugins/router"
    },
    {
      "name": "acme.app",
      "version": "1.0.0",
      "path": "./plugins/app"
    }
  ],
  "config": {
    "acme.storage": {
      "timeout": 5000,
      "retries": 3
    },
    "acme.router": {
      "basePath": "/api"
    }
  },
  "app": {
    "name": "MyApp",
    "version": "1.0.0"
  }
}
```

## Field Reference

### `architecture` (required, string)
The Core architecture version in `MAJOR.MINOR` format. Plugins declare their required architecture in their manifest; compatibility is checked at startup.

**Compatibility rules:**
- MAJOR must match exactly
- Plugin MINOR ≤ Core MINOR (plugin can be older, not newer)

### `core` (required, object)
- `name` (string) — Core package name, typically `"pey.core"`
- `version` (string) — Core version

### `adapters` (required, object)
Maps adapter types to their implementation names. Only infrastructure plugins with matching `adapterType` receive these.

```json
"adapters": {
  "storage": "IndexedDBAdapter",
  "auth": "OAuthAdapter"
}
```

**Rules:**
- If an infrastructure plugin declares `adapterType: "storage"`, it receives `config.adapter = "IndexedDBAdapter"`
- Adapters with no consumer plugin are ignored (not an error)
- Duplicate `adapterType` across infrastructure plugins → system fatal error

### `ui` (required, object)
- `path` (string) — Path to the UI root folder (contains `manifest.json` and `index.js`). The Core loads the UI manifest and entry point via ModuleLoader using this path as the reference.

### `plugins` (required, array)
Ordered list of plugins to start. **Order matters** — plugins start in this order, stop in reverse.

Each entry:
- `name` (string) — Must match `manifest.name`
- `version` (string) — Must match `manifest.version`
- `path` (string) — Path to plugin root (contains `manifest.json` and `index.js`). The Core loads the manifest and entry point via ModuleLoader using this path as the reference.

**Startup order (architecture 0.11):**
1. Infrastructure group (type: `infrastructure`) — preparation, settlement, binding+activation, commit
2. Application group (type: `product`, `feature`, `platform`, `transport`) — preparation, settlement, binding+activation, commit
3. UI (after both groups commit)

> **Note:** In architecture 0.11, the Core separates plugins into two groups based on `manifest.type`. Within each group, the configuration order is preserved and used for preparation, binding, activation, and `{pluginname}:ready` publication. Required dependency cycles are supported within a group but not between groups.

### `config` (optional, object)
Per-plugin configuration overrides. Keys are plugin names.

```json
"config": {
  "acme.storage": {
    "timeout": 5000,
    "retries": 3
  }
}
```

**Merge behavior:**
1. Start with `manifest.config` (defaults)
2. Deep-merge `config[pluginName]` (project overrides)
3. If infrastructure plugin has `adapterType`, inject `config.adapter = adapters[adapterType]`

### `app` (required, object)
Application metadata (passed to plugins via config if they declare it).
- `name` (string)
- `version` (string)

---

## Environment Variable Substitution

The Core does not access platform-specific environment APIs directly. Environment values are provided by EnvSource (injected by the Runtime Host) via `get(varName)`.

Any string value in the configuration can contain `${VAR_NAME}` placeholders.

```json
{
  "config": {
    "acme.storage": {
      "connectionString": "${DB_CONNECTION_STRING}",
      "timeout": { "env": "${STORAGE_TIMEOUT}", "required": true }
    }
  }
}
```

### Forms

| Form | Description |
|------|-------------|
| `${VAR}` | Optional. Empty string if not set. |
| `{ "env": "${VAR}", "required": true }` | Required. Throws `ENV_VAR_REQUIRED_MISSING` if not set. |
| `{ "env": "${VAR}", "required": false }` | Optional. Empty string if not set. |

### Rules
- Substitution happens at load time (first startup step)
- Resolved values are **strings only**
- Resolved values **never** appear in logs, errors, or events
- Non-string values are not substituted

---

## Per-Plugin Config Merge

The final config passed to a plugin is a deep merge of:

1. **Manifest defaults** (`manifest.config`)
2. **Project overrides** (`bootstrap.json` → `config[pluginName]`)

```javascript
// manifest.config
{ "timeout": 1000, "nested": { "a": 1 } }

// bootstrap.json config.acme.plugin
{ "timeout": 5000, "nested": { "b": 2 } }

// Result
{ "timeout": 5000, "nested": { "a": 1, "b": 2 } }
```

**Rules:**
- Project config overrides manifest defaults
- Deep merge for nested objects
- Original objects are not mutated
- Invalid project config (non-object) throws `INVALID_PLUGIN_CONFIG`

---

## Adapter Injection

If an infrastructure plugin declares `adapterType` in its manifest:

```json
// manifest.json
{
  "type": "infrastructure",
  "adapterType": "storage"
}
```

The Core injects the adapter name into the plugin's final config:

```javascript
// Final config passed to plugin
{
  ...mergedConfig,
  adapter: "IndexedDBAdapter"  // from bootstrap.json adapters.storage
}
```

The plugin is responsible for loading and using the adapter.

---

## Validation Errors

| Code | Cause |
|------|-------|
| `CONFIG_FILE_MISSING` | Configuration content is missing or not an object |
| `CONFIG_FILE_INVALID` | Required section missing |
| `INVALID_ENV_SOURCE` | envSource missing or no `get` method |
| `ENV_VAR_MISSING` | `${VAR}` not in envSource |
| `ENV_VAR_REQUIRED_MISSING` | Required env var not set |
| `INVALID_PLUGIN_CONFIG` | Project config for plugin is not an object |
| `INVALID_HOST_SOURCE` | A Runtime Host source (configSource, envSource, moduleLoader) is missing or malformed |

---

## Example: Complete bootstrap.json

```json
{
  "architecture": "0.11",
  "core": {
    "name": "pey.core",
    "version": "0.1.0"
  },
  "adapters": {
    "storage": "IndexedDBAdapter",
    "auth": "OAuthAdapter"
  },
  "ui": {
    "path": "./ui"
  },
  "plugins": [
    {
      "name": "acme.storage",
      "version": "1.0.0",
      "path": "./plugins/storage"
    },
    {
      "name": "acme.auth",
      "version": "1.0.0",
      "path": "./plugins/auth"
    },
    {
      "name": "acme.router",
      "version": "1.0.0",
      "path": "./plugins/router"
    },
    {
      "name": "acme.app",
      "version": "1.0.0",
      "path": "./plugins/app"
    }
  ],
  "config": {
    "acme.storage": {
      "dbName": "${APP_DB_NAME}",
      "timeout": { "env": "${STORAGE_TIMEOUT}", "required": true }
    },
    "acme.auth": {
      "clientId": "${OAUTH_CLIENT_ID}",
      "redirectUri": "http://localhost:3000/callback"
    },
    "acme.router": {
      "basePath": "/api/v1"
    }
  },
  "app": {
    "name": "MyApp",
    "version": "1.0.0"
  }
}
```
