# Pey Core UI Integration Guide

## Overview

The UI is not a plugin but integrates with the Core through a similar contract. It has a manifest, an entry point, and receives a context with services, events, and configuration.

## UI Manifest

Located at `ui/manifest.json` (path from `bootstrap.json` → `ui.path`).

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
    { "name": "ui:navigate", "description": "Navigation", "data": ["route"] },
    { "name": "ui:error", "description": "UI error", "data": ["message"] }
  ],
  "config": {
    "theme": "dark",
    "language": "en"
  }
}
```

## Restrictions

| Field | Allowed? |
|-------|----------|
| `type` | **No** |
| `provides` | **No** |
| `adapterType` | **No** |

If present, UI startup fails with `INVALID_UI_MANIFEST`.

## UI Context

Passed to `setup(context)`:

```javascript
{
  services: { [serviceName]: serviceObject },
  events: {
    publish(type, data) => { success, error? },
    subscribe(type, listener) => unsubscribeFn
  },
  config: { /* config.ui from bootstrap.json */ },
  onShutdown: null  // Assign: context.onShutdown = () => {}
}
```

**Differences from PluginContext:**
- No `provides` — UI doesn't provide services
- No `reportCriticalError` — UI is not a plugin
- No `onDeactivated` — UI has no services to deregister
- Event source is UI manifest name

## Entry Point (ui/index.js)

```javascript
// ui/index.js
export async function setup(context) {
  const router = context.services['acme.router.service'];
  const auth = context.services['acme.auth.service'];
  
  // Subscribe to core events
  context.events.subscribe('core:ready', () => {
    initApp();
  });
  
  // core:shutdown announces that shutdown is starting — it is a notification
  // to the rest of the system, not a cleanup hook. Final UI cleanup runs
  // exclusively in context.onShutdown below — do not run it here too.
  context.events.subscribe('core:shutdown', () => {
    // e.g. block further user input before onShutdown runs
  });
  
  // Subscribe to plugin events
  context.events.subscribe('auth:login', (event) => {
    showUser(event.data.user);
  });
  
  // Publish UI events
  function navigate(route) {
    context.events.publish('ui:navigate', { route });
    router.navigate(route);
  }
  
  // Lifecycle hook
  context.onShutdown = () => {
    saveState();
    cleanup();
  };
  
  // Initialize
  function initApp() {
    // Check auth, load initial route, etc.
  }
  
  function cleanup() {
    // Remove listeners, cancel timers, etc.
  }
  
  function saveState() {
    // Persist UI state
  }
}
```

## Startup

UI starts at **step 4** of system startup (after all plugins):
1. All infrastructure plugins
2. All application plugins
3. **UI starts here** (two-step loading):
   - Manifest loaded via `moduleLoader.loadManifest()` — no UI code executed
   - Manifest validated (no `type`, no `provides`)
   - If validation succeeds, entry point loaded via `moduleLoader.loadEntry()`
   - If validation fails, `loadEntry()` is never called
4. `core:ready` published (after UI starts or fails)

If UI fails:
- Publishes `core:ui-failed`
- **System continues** — `core:ready` still published
- UI context not stored (no shutdown hook called)

## Shutdown

UI stops **before any plugin**:
1. Core publishes `core:shutdown`
2. **UI stops first** — calls `onShutdown`
3. Then plugins stop in reverse order

If UI `onShutdown` throws:
- Error logged
- Plugin shutdown continues

**Cleanup ownership:** `core:shutdown` is published at the very start of the shutdown sequence — **before** `onShutdown` is called (see [events.md](events.md)). Treat it as a notification to prepare the rest of the system (e.g. tell peers the UI is going down), **not** as a cleanup hook. `context.onShutdown` is the **only** official path for the UI's final cleanup. A `core:shutdown` subscriber runs **in addition** to `onShutdown`, so never run the same cleanup in both — doing so duplicates it.

## Configuration

UI config comes from `bootstrap.json`:

```json
{
  "config": {
    "ui": {
      "theme": "dark",
      "language": "fa",
      "apiBaseUrl": "/api"
    }
  }
}
```

Accessed via `context.config`.

## Event Publishing

```javascript
// Source is automatically set to UI manifest name (e.g., "myapp.ui")
context.events.publish('ui:navigate', { route: '/dashboard' });
```

**Rules:**
- Only events declared in UI manifest `events` can be published
- Source is auto-set from UI manifest `name`
- Data must not contain sensitive information

## Event Subscription

```javascript
// Subscribe to any event (no access declaration needed)
context.events.subscribe('auth:login', (event) => {
  showUser(event.data.user);
});

// Wildcard for debugging
context.events.subscribe('*', (event) => {
  console.log(event.type, event.source);
});
```

## Services

UI receives direct references to declared services:

```javascript
const router = context.services['acme.router.service'];
const auth = context.services['acme.auth.service'];

// Direct calls — no Core intermediary
router.navigate('/dashboard');
const user = await auth.getCurrentUser();
```

**Rules:**
- Only services in `dependencies` (required + optional) are provided
- Optional services absent if not in Registry — not an error
- Direct calls — no Core intermediary

## Bootstrap.json UI Section

```json
{
  "ui": {
    "path": "./ui"
  },
  "config": {
    "ui": {
      "theme": "dark",
      "language": "fa"
    }
  }
}
```

## Complete Example

### ui/manifest.json
```json
{
  "name": "myapp.ui",
  "version": "1.0.0",
  "architecture": "0.5",
  "description": "Main application UI",
  "dependencies": {
    "required": ["acme.router.service", "acme.auth.service"],
    "optional": ["acme.notifications.service"]
  },
  "events": [
    { "name": "ui:navigate", "description": "Navigation", "data": ["route"] },
    { "name": "ui:error", "description": "UI error", "data": ["message"] }
  ],
  "config": {
    "theme": "dark",
    "language": "en"
  }
}
```

### ui/index.js
```javascript
export async function setup(context) {
  const router = context.services['acme.router.service'];
  const auth = context.services['acme.auth.service'];
  const notifications = context.services['acme.notifications.service'];
  
  // Core lifecycle
  context.events.subscribe('core:ready', () => {
    initApp();
  });
  
  // core:shutdown announces that shutdown is starting — it is a notification
  // to the rest of the system, not a cleanup hook. Final UI cleanup runs
  // exclusively in context.onShutdown below — do not run it here too.
  context.events.subscribe('core:shutdown', () => {
    // e.g. block further user input before onShutdown runs
  });
  
  // Auth events
  context.events.subscribe('auth:login', (event) => {
    showUser(event.data.user);
  });
  
  context.events.subscribe('auth:logout', () => {
    showLogin();
  });
  
  // Notifications
  if (notifications) {
    context.events.subscribe('notifications:new', (event) => {
      showNotification(event.data);
    });
  }
  
  // UI events
  function navigate(route) {
    context.events.publish('ui:navigate', { route });
    router.navigate(route);
  }
  
  function showError(message) {
    context.events.publish('ui:error', { message });
  }
  
  // Lifecycle
  context.onShutdown = () => {
    saveState();
    cleanup();
  };
  
  function initApp() {
    // Check auth state, load initial route
    auth.getCurrentUser().then(user => {
      if (user) showUser(user);
      else showLogin();
    });
  }
  
  function cleanup() {
    // Cancel timers, remove DOM listeners, etc.
  }
  
  function saveState() {
    // Persist scroll position, form data, etc.
  }
}
```

## Best Practices

1. **Handle missing optional services** — Check before use
2. **Subscribe to core:ready** — Don't initialize before
3. **Implement onShutdown** — Save state, cleanup resources
4. **No sensitive data in events** — Not even in error messages
5. **Use direct service calls** — No Core intermediary
6. **Subscribe to core:shutdown** — Announce shutdown to the rest of the system only; run cleanup exclusively in `onShutdown`