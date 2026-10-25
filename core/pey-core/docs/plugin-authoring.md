# Pey Core Plugin Authoring Guide

## Overview

A Pey plugin is a self-contained module that provides services, publishes events, and consumes other plugins' services through the Core's Registry and Event Bus.

## Plugin Structure

```
my-plugin/
├── manifest.json      # Required: plugin metadata
├── index.js           # Required: entry point (exports prepare + activate functions)
├── package.json       # Optional: npm dependencies
└── src/               # Optional: source files
```

## Manifest (manifest.json)

Required fields:

```json
{
  "name": "acme.myplugin",
  "version": "1.0.0",
  "architecture": "0.11",
  "description": "My awesome plugin",
  "type": "product",
  "dependencies": {
    "required": ["acme.logger"],
    "optional": ["acme.metrics"]
  },
  "provides": [
    { "name": "acme.myplugin.service", "description": "Does something", "methods": ["doThing"] }
  ],
  "events": [
    { "name": "myplugin:done", "description": "Fired when done", "data": [{ "name": "result", "type": "any" }] }
  ],
  "config": {
    "timeout": 5000
  }
}
```

### Field Details

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | `vendor.name` format, globally unique |
| `version` | Yes | Semantic version |
| `architecture` | Yes | Core architecture version (MAJOR.MINOR) |
| `description` | Yes | Human-readable |
| `type` | Yes | `infrastructure`, `platform`, `product`, `feature`, or `transport` |
| `dependencies` | Yes | `required` and `optional` service arrays |
| `provides` | Yes | Services this plugin registers |
| `events` | Yes | Events this plugin publishes |
| `config` | No | Default configuration values |
| `adapterType` | No | Only for `type: "infrastructure"` |

## Entry Point (index.js)

The entry point file name `index.js` is architectural. The Core loads it via `moduleLoader.loadEntry()` after successful manifest validation. In architecture 0.11, the entry point must export two functions: `prepare(prepareContext)` and `activate(services)`.

### Phase 1: prepare()

During the preparation phase, the plugin has access to configuration and events but **no services** from other plugins. The plugin prepares its declared services and returns them to the Core.

```javascript
// index.js — prepare phase
export function prepare(prepareContext) {
  // 1. Access merged configuration
  const timeout = prepareContext.config.timeout || 5000;
  
  // 2. Use scoped event bus
  prepareContext.events.subscribe('storage:changed', (event) => {
    console.log('Storage changed', event.data);
  });
  
  // 3. Publish events (source auto-set from manifest)
  prepareContext.events.publish('myplugin:preparing', { timestamp: Date.now() });
  
  // 4. Implement lifecycle hooks
  prepareContext.onShutdown = async () => {
    console.log('Shutting down...');
    await cleanup();
  };
  
  prepareContext.onDeactivated = () => {
    console.warn('Plugin deactivated');
    isActive = false;
  };
  
  // 5. Report critical errors
  function handleCriticalError(err) {
    prepareContext.reportCriticalError({
      code: 'INTERNAL_ERROR',
      message: err.message,
      type: 'critical',
      source: 'acme.myplugin'
    });
  }
  
  // 6. Build and return provided services
  // IMPORTANT: Do NOT call another plugin's service during prepare()
  const service = {
    async doThing(input) {
      // ... implementation
      prepareContext.events.publish('myplugin:done', { result: 'ok' });
      return { success: true };
    }
  };
  
  return [{ name: 'acme.myplugin.service', object: service }];
}
```

### Phase 2: activate()

After the group has prepared its services and settled required dependencies, the Core calls `activate(services)` with bound dependencies. Services are resolved from the private StartupRegistry (for same-group plugins) and the public Registry (for previously committed groups).

```javascript
// index.js — activate phase
export function activate(services) {
  // 1. Access bound dependencies
  const logger = services['acme.logger'];
  const storage = services['acme.storage.service'];
  
  // 2. Store references for use in service methods
  this.logger = logger;
  this.storage = storage;
  
  // 3. Perform local activation
  // (e.g., connect to external systems using other services)
  logger.info('Plugin activated');
}
```

> **Important:** During preparation, binding, and local activation, a plugin must NOT call another application plugin's service. Only after the group barrier may application plugins call each other's services.

## Context Objects

### PrepareContext (Phase 1 — Preparation)

```javascript
{
  config: { /* merged config */ },
  events: {
    publish(type, data) => { success, error? },
    subscribe(type, listener) => unsubscribeFn
  },
  onShutdown: null,        // Assign: prepareContext.onShutdown = () => {}
  onDeactivated: null,     // Assign: prepareContext.onDeactivated = () => {}
  reportCriticalError: (error) => void
  // NOTE: NO services field — services are bound in phase 2
}
```

### Services Map (Phase 2 — Activation)

```javascript
{
  // serviceName -> serviceObject
  // Resolved from StartupRegistry (same group) + public Registry (previous groups)
  'acme.logger': loggerService,
  'acme.storage.service': storageService,
  // ... only services declared in manifest.dependencies (required + optional)
}
```

## Service Implementation

Services are plain objects with methods. They receive direct calls from consumers — **no Core intermediary**.

```javascript
const service = {
  async get(key) {
    // Direct implementation
    return this.store.get(key);
  },
  
  async set(key, value) {
    // Validate, then store
    if (!key) throw new Error('Key required');
    this.store.set(key, value);
    // Publish event
    this.context.events.publish('storage:changed', { key, operation: 'set' });
  }
};
```

**Important:** Services must know when their plugin is deactivated and return standard Pey errors. Implement this via an internal flag set in `onDeactivated`.

```javascript
let isActive = true;

context.onDeactivated = () => { isActive = false; };

const service = {
  async get(key) {
    if (!isActive) {
      return { error: { code: 'SERVICE_UNAVAILABLE', message: 'Plugin deactivated' } };
    }
    return this.store.get(key);
  }
};
```

## Configuration

### Manifest Defaults
```json
"config": { "timeout": 5000, "retries": 3 }
```

### Project Overrides (bootstrap.json)
```json
"config": {
  "acme.myplugin": { "timeout": 10000 }
}
```

### Access in Plugin
```javascript
const timeout = context.config.timeout; // 10000 (merged)
```

## Event Publishing

```javascript
// Publish declared event
const result = context.events.publish('myplugin:done', { 
  result: 'success',
  duration: 123 
});

if (!result.success) {
  // Handle: INVALID_EVENT, INVALID_EVENT_TYPE, EVENT_NOT_DECLARED_IN_MANIFEST
}
```

**Rules:**
- Only events in `manifest.events` can be published
- Source is auto-set from `manifest.name` (cannot be forged)
- Data must not contain sensitive information

## Event Subscription

```javascript
// Subscribe to specific event
const unsubscribe = context.events.subscribe('storage:changed', (event) => {
  console.log(event.data.key, event.data.operation);
});

// Subscribe to all events
const unsubscribeAll = context.events.subscribe('*', (event) => {
  logger.debug(event.type, event.source);
});

// Unsubscribe when done
unsubscribe();
```

**Rules:**
- Can subscribe to any event (no access declaration needed)
- Wildcard `"*"` receives all events
- Listener errors don't affect publisher or other listeners

## Lifecycle Hooks

Lifecycle hooks **must** be assigned during the `prepare(prepareContext)` phase, **not** during `activate(services)`. The `activate()` function is only called for plugins that survive settlement and group commit — a plugin that fails during settlement, fails during activation, or is skipped by an infrastructure group short-circuit will never have its `activate()` called. If hooks are registered in `activate()`, they will be lost and cleanup will not run.

### `onShutdown`
Called during system shutdown. Use for cleanup.

```javascript
prepareContext.onShutdown = async () => {
  await db.close();
  await connections.release();
};
```

### `onDeactivated`
Called when a plugin is deactivated — whether at runtime (critical error, dependency loss) or during startup (cascading deactivation at settlement, activation failure, or infrastructure group short-circuit). Called **before** the plugin is marked INACTIVE, giving the plugin a chance to release resources acquired during `prepare()`.

```javascript
prepareContext.onDeactivated = () => {
  isActive = false;  // Services should check this flag
  releaseResources(); // e.g. close database connection opened in prepare()
};
```

> **Important:** `onDeactivated` is called even if `activate()` was never reached. Always register it in `prepare()` so resources acquired during preparation are not leaked.

## Critical Error Reporting

```javascript
try {
  await riskyOperation();
} catch (err) {
  context.reportCriticalError({
    code: 'OPERATION_FAILED',
    message: err.message,
    type: 'critical',
    source: 'acme.myplugin',
    detail: { operation: 'riskyOperation' }
  });
}
```

**Effect:** Core deactivates plugin, calls `onDeactivated`, removes services, publishes `core:plugin-crashed`.

## Plugin Types

| Type | Startup Group | Failure Effect | Use Case |
|------|---------------|----------------|----------|
| `infrastructure` | Infrastructure group | Fatal (stops entire system) | Adapters, core services |
| `platform` | Application group | Non-fatal (cascading deactivation) | Router, auth, etc. |
| `product` | Application group | Non-fatal (cascading deactivation) | Application features |
| `feature` | Application group | Non-fatal (cascading deactivation) | Feature-level plugins |
| `transport` | Application group | Non-fatal (cascading deactivation) | Transport-layer plugins |

> **Note:** In architecture 0.11, the Core separates plugins into two groups based on `type`. The infrastructure group processes first, then the application group. Within each group, plugins start in the order they appear in the `plugins` list of `bootstrap.json`. Required dependency cycles are supported within a group but not between groups.

## Best Practices

1. **Declare everything** — All services, events, dependencies in manifest
2. **No sensitive data** — Not in events, errors, or config
3. **Handle deactivation** — Services must check `isActive` flag
4. **Clean up in onShutdown** — Close connections, release resources
5. **Report critical errors** — Don't hide failures
6. **Use direct calls** — Services are direct references, no proxy
7. **Validate input** — Services are called directly, validate early
8. **Keep setup synchronous-ish** — Return services promptly

## Example: Complete Plugin

### manifest.json
```json
{
  "name": "acme.todos",
  "version": "1.0.0",
  "architecture": "0.11",
  "description": "Todo management",
  "type": "product",
  "dependencies": {
    "required": ["acme.storage.service"],
    "optional": ["acme.notifications.service"]
  },
  "provides": [
    { "name": "acme.todos.service", "description": "Todo CRUD", "methods": ["create", "list", "complete"] }
  ],
  "events": [
    { "name": "todos:created", "description": "New todo", "data": [{ "name": "id", "type": "string" }, { "name": "title", "type": "string" }] },
    { "name": "todos:completed", "description": "Todo done", "data": [{ "name": "id", "type": "string" }] }
  ],
  "config": { "maxTodos": 1000 }
}
```

### index.js
```javascript
let isActive = true;
let todos = [];

export async function prepare(prepareContext) {
  const maxTodos = prepareContext.config.maxTodos;
  
  const service = {
    async create(title) {
      if (!isActive) throw { code: 'SERVICE_UNAVAILABLE', message: 'Plugin deactivated' };
      if (todos.length >= maxTodos) throw { code: 'LIMIT_EXCEEDED', message: 'Too many todos' };
      
      const todo = { id: crypto.randomUUID(), title, completed: false };
      await storageService.set(`todo:${todo.id}`, todo);
      todos.push(todo);
      
      prepareContext.events.publish('todos:created', { id: todo.id, title });
      return todo;
    },
    
    async list() {
      if (!isActive) throw { code: 'SERVICE_UNAVAILABLE', message: 'Plugin deactivated' };
      return todos;
    },
    
    async complete(id) {
      if (!isActive) throw { code: 'SERVICE_UNAVAILABLE', message: 'Plugin deactivated' };
      const todo = todos.find(t => t.id === id);
      if (!todo) throw { code: 'NOT_FOUND', message: 'Todo not found' };
      
      todo.completed = true;
      await storageService.set(`todo:${id}`, todo);
      prepareContext.events.publish('todos:completed', { id });
    }
  };
  
  return [{ name: 'acme.todos.service', object: service }];
}

// storageService is bound in activate() from the prepared service map
let storageService;

export async function activate(services) {
  storageService = services['acme.storage.service'];
  
  // Subscribe to core events if needed
  services.__internalBus?.subscribe?.('core:shutdown', () => {
    // Handle shutdown
  });
}

// Lifecycle hooks
export function onShutdown() {
  // Cleanup if needed
}

export function onDeactivated() {
  isActive = false;
}
```

## Testing Plugins

Use the Core's test utilities. In architecture 0.11, plugins are processed in groups via the standalone `processGroup` function:

```javascript
import { processGroup, PLUGIN_GROUP } from '@pey/core/src/plugin-lifecycle.js';
import { createInternalLogger } from '@pey/core/src/internal-logger.js';
import { createInternalState } from '@pey/core/src/internal-state.js';
import { createRegistry } from '@pey/core/src/registry.js';
import { createEventBus } from '@pey/core/src/event-bus.js';
import { createStartupRegistry } from '@pey/core/src/startup-registry.js';

const logger = createInternalLogger();
const state = createInternalState();
const eventBus = createEventBus(logger);
const registry = createRegistry(logger, coreManifest);
const startupRegistry = createStartupRegistry(logger);

// Test group-based processing (architecture 0.11)
const result = await processGroup({
  pluginEntries: [
    { name: 'acme.storage', path: './plugins/storage/index.js' },
  ],
  manifests: new Map([
    ['acme.storage', storageManifest]
  ]),
  config: bootstrapConfig,
  startupRegistry,
  registry,
  internalState: state,
  eventBus,
  coreManifest,
  moduleLoader: fakeModuleLoader,
  logger,
  group: PLUGIN_GROUP.INFRASTRUCTURE,
});
// result: { failed: boolean, reason?: string } or { success: true }
```

For unit testing a single plugin's `prepare` and `activate` functions in isolation:

```javascript
import { buildPrepareContext } from '@pey/core/src/context-builder.js';
import { buildServiceMapForGroup } from '@pey/core/src/context-builder.js';

// Test prepare()
const prepareContext = buildPrepareContext({
  manifest: pluginManifest,
  eventBus,
  config: mergedConfig,
  reportCriticalError: () => {}
});
const preparedServices = await pluginModule.prepare(prepareContext);

// Test activate() with a mock service map
const serviceMap = buildServiceMapForGroup(
  pluginManifest,
  startupRegistry,  // contains prepared services from same group
  registry          // contains services from previous groups
);
await pluginModule.activate(serviceMap);
```