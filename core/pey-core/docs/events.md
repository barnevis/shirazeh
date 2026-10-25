# Pey Core Events Catalog

## Core Events

Events published by the Core itself. All have `source: "pey.core"`.

| Event | When Published | Data |
|-------|----------------|------|
| `core:ready` | After both groups commit and UI starts/fails; the only global success event | `{}` |
| `core:shutdown` | Before shutdown sequence begins | `{}` |
| `core:plugin-failed` | A plugin fails during startup (preparation, binding, activation, or declaration validation) | `{ pluginName: string, code: string }` — code may be `REQUIRED_DEPENDENCY_UNAVAILABLE` |
| `core:plugin-crashed` | A plugin reports a critical error at runtime | `{ pluginName: string, code: string }` |
| `core:ui-failed` | The UI fails to start (UI is not a plugin) | `{ reason: string }` |
| `core:startup-failed` | Startup cannot continue (infrastructure plugin failure or system-fatal declaration error) | `{ reason: string }` |
| `core:service-unavailable` | A service is removed from Registry because its provider was deactivated at runtime | `{ serviceName: string, providerPlugin: string }` — NOT published for prepared services removed before group commit |

## Plugin Lifecycle Events

Events published by the Core on behalf of plugins. Source is the plugin's manifest name.

| Event | When Published | Data |
|-------|----------------|------|
| `{pluginname}:ready` | Plugin startup completed successfully | `{}` |
| `{pluginname}:stopped` | Plugin shutdown completed | `{}` |

**Note:** `pluginname` is the name segment after the vendor prefix. E.g., for `acme.storage`, the event is `storage:ready`.

## Event Structure

All events have this structure when received by subscribers:

```javascript
{
  id: "evt-1",  // sequential counter (evt-1, evt-2, ...)
  type: "event:type",
  source: "plugin.name",  // or "pey.core" for core events
  timestamp: "2024-01-01T00:00:00.000Z",
  data: { /* event-specific payload */ }
}
```

## Publishing Rules

### Plugin-Published Events
- Only events declared in `manifest.events` can be published
- Source is automatically set from `manifest.name` (cannot be forged)
- Validation error: `EVENT_NOT_DECLARED_IN_MANIFEST`

### Core-Published Events
- Core events (`core:*`) and plugin lifecycle events (`{pluginname}:ready/stopped`) are published by the Core
- These do not need to be declared in any manifest
- Source is `"pey.core"` for core events, plugin name for lifecycle events

## Subscribing

```javascript
// Subscribe to specific event
const unsubscribe = context.events.subscribe('storage:changed', (event) => {
  console.log(event.data.key, event.data.operation);
});

// Subscribe to all events (wildcard)
const unsubscribeAll = context.events.subscribe('*', (event) => {
  console.log(event.type, event.source);
});

// Unsubscribe
unsubscribe();
```

## Event Data Reference

### `core:plugin-failed`
```javascript
{ pluginName: "acme.storage", code: "INCOMPATIBLE_ARCHITECTURE" }
```

### `core:plugin-crashed`
```javascript
{ pluginName: "acme.app", code: "PLUGIN_CRASHED" }
```

### `core:ui-failed`
```javascript
{ reason: "UI_STARTUP_FAILED" }
```

### `core:startup-failed`
```javascript
{ reason: "INCOMPATIBLE_ARCHITECTURE" }
```

### `core:service-unavailable`
```javascript
{ serviceName: "acme.storage.service", providerPlugin: "acme.storage" }
```

### `storage:changed` (example plugin event)
```javascript
{ key: "user:123", operation: "set", oldValue: null, newValue: "{...}" }
```

## Security Notes

- Event Bus is public — any plugin can subscribe to any event
- Source cannot be forged (set by Core from manifest)
- Only declared events can be published by plugins
- Sensitive data must never be placed in event data
- Core internal log records unauthorized publish attempts