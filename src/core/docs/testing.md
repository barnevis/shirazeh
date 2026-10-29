# Pey Core Testing Guide

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test tests/event-bus.test.js
```

## Mocking Runtime Host Sources

The Core is platform-neutral. In tests, the three Runtime Host sources (ConfigSource, EnvSource, ModuleLoader) are replaced with simple in-memory fakes.

### Fake ModuleLoader (two-step contract)

```javascript
function createFakeModuleLoader(manifest, setupFn) {
  return {
    async loadManifest() { return manifest; },
    async loadEntry() { return { setup: setupFn }; },
  };
}
```

### Fake ConfigSource

```javascript
function createFakeConfigSource(config) {
  return {
    async getConfig() { return config; },
  };
}
```

### Fake EnvSource

```javascript
function createFakeEnvSource(vars = {}) {
  return {
    get(varName) { return vars[varName]; },
  };
}
```

### Verifying the two-step loading order

Tests should verify that `loadEntry()` is never called when manifest validation fails:

```javascript
let loadEntryCalled = false;
const moduleLoader = {
  async loadManifest() { return manifest; },
  async loadEntry() { loadEntryCalled = true; return { setup: () => [] }; },
};

const result = await lifecycle.startPlugin(pluginEntry, '0.5', config);

assert.equal(result.success, false);
assert.equal(loadEntryCalled, false, 'loadEntry() must not be called when validation fails');
```

## Test Structure

Each Core module has a dedicated test file in `tests/`:

| Module | Test File |
|--------|-----------|
| ConfigLoader | `config-loader.test.js` |
| ConfigMerger | `config-merger.test.js` |
| EnvSubstitutor | `env-substitutor.test.js` |
| InternalLogger | `internal-logger.test.js` |
| InternalState | `internal-state.test.js` |
| ErrorManager | `error-manager.test.js` |
| Registry | `registry.test.js` |
| EventBus | `event-bus.test.js` |
| StartupValidator | `startup-validator.test.js` |
| Security | `security.test.js` |
| ContextBuilder | `context-builder.test.js` |
| PluginLifecycle | `plugin-lifecycle.test.js` |
| AdapterHandler | `adapter-handler.test.js` |
| UIHandler | `ui-handler.test.js` |
| SystemLifecycle | `system-lifecycle.test.js` |
| Integration | `integration.test.js` |

## Test Patterns

### Unit Tests
- Test one module in isolation
- Use injectable dependencies (fake loaders, readers)
- No file system I/O in unit tests

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/event-bus.js';
import { createInternalLogger } from '../src/internal-logger.js';

test('publish enriches event with id, source, timestamp', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = { name: 'acme.test', events: [{ name: 'test:event', description: '', data: [] }] };

  let received = null;
  bus.subscribe('test:event', (e) => { received = e; }, 'acme.listener');
  bus.publish({ type: 'test:event', data: { id: 1 } }, 'acme.test', manifest);

  assert.ok(received.id);
  assert.equal(received.source, 'acme.test');
  assert.ok(received.timestamp);
});
```

### Integration Tests
- Use real file system for manifests and entry points
- Test end-to-end flows via `PeyCore` class
- Clean up temp directories in `finally` blocks

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PeyCore } from '../index.js';

test('full startup and shutdown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-'));
  // ... create manifest.json, index.js, bootstrap.json
  const bootstrapPath = join(dir, 'bootstrap.json');

  try {
    // Create host sources (platform-specific implementation)
    const configSource = { getConfig: async () => JSON.parse(await fs.readFile(bootstrapPath, 'utf8')) };
    const envSource = { get: (name) => process.env[name] };
    const moduleLoader = { loadManifest, loadEntry }; // platform-specific
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    await core.start();
    await core.shutdown();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
```

## Key Behaviors to Verify

### ConfigLoader
- Missing file → `CONFIG_FILE_MISSING`
- Invalid JSON → `CONFIG_FILE_INVALID`
- Env var `${VAR}` substitution
- Required env var missing → `ENV_VAR_REQUIRED_MISSING`
- Substituted values are strings
- Per-plugin config merge (project overrides manifest defaults)
- Resolved env vars never in logs/errors/events

### StartupValidator
- Architecture compatible/incompatible (MAJOR differs, MINOR > core)
- Duplicate plugin name rejected
- Missing required dependency rejected
- Optional dependency absence not an error
- Failed plugin is INACTIVE (no "failed" state)
- `adapterType` only for infrastructure
- Duplicate `adapterType` is system-fatal
- `adapterType` without adapter configured fails plugin
- Unused adapter in config ignored

### ManifestStructureValidator
- All required fields present (`name`, `version`, `architecture`, `description`, `type`, `dependencies`, `provides`, `events`)
- Missing required field → `INVALID_MANIFEST_STRUCTURE`
- `name` must be in `vendor.name` format (lowercase, single dot, no empty segments)
- `type` must be one of: `infrastructure`, `platform`, `product`, `feature`, `transport`
- Wrong type for any field → `INVALID_MANIFEST_STRUCTURE`
- `loadEntry()` never called when structure validation fails
- Infrastructure plugin with structure failure → fatal

### Registry
- Register declared service
- Reject undeclared service (security log)
- Reject duplicate service
- Get declared service
- Reject undeclared access (security log)
- Optional dep absent returns Absent
- Deregister by plugin removes services + publishes `core:service-unavailable`
- Registry never handed to plugin/UI

### EventBus
- Publish enriches with `id`/`source`/`timestamp`
- Source from manifest (cannot be forged)
- Reject undeclared event (security log)
- Subscriber receives event
- Listener error doesn't affect publisher/other listeners
- Wildcard `*` subscription receives all
- Subscribe requires no access declaration
- No ordering guarantee between listeners

### PluginLifecycle
- Two-phase startup: `prepare()` returns services → `activate()` receives bound dependencies
- Plugin ACTIVE only after group commit
- Two-step loading: `loadManifest()` → validate → `loadEntry()`
- `loadEntry()` never called when manifest validation fails
- Startup failure deactivates, publishes `core:plugin-failed`
- Infrastructure group failure stops startup
- Application group failure cascades to dependents with `REQUIRED_DEPENDENCY_UNAVAILABLE`
- Critical error: `onDeactivated` BEFORE removing services, then `core:plugin-crashed`
- Shutdown: `onShutdown` then `pluginname:stopped` in reverse group order
- Two-phase entry point contract: `prepare(prepareContext)` + `activate(services)`

### SystemLifecycle
- Group-based startup: Infrastructure group → Application group → UI → `core:ready`
- Each group: preparation → settlement → binding+activation → group commit
- `core:ready` = both groups committed and UI started (or failed)
- UI failure → `core:ui-failed` then `core:ready`
- Infrastructure group failure → `core:startup-failed` and stops
- Application group failure → cascading deactivation to dependents
- Shutdown: `core:shutdown` → UI first → plugins reverse group order

### PeyCore (public class)
- Constructor validates ConfigSource, EnvSource, ModuleLoader (`INVALID_HOST_SOURCE`)
- `start()` rejects double-start without shutdown (`CORE_ALREADY_STARTED`)
- `start()` can be called again after `shutdown()`
- Integration tests use a Node.js-style host (file-backed ConfigSource, process.env EnvSource, fs + import ModuleLoader)

### Security
- Access control at startup only
- Undeclared access rejected + logged
- Event source forging prevented
- Registry never exposed to plugins/UI
- Env var values not retained

### AdapterHandler
- Active adapter passed only to infrastructure plugin with matching `adapterType`
- Other plugins don't receive adapter name
- Non-infrastructure with `adapterType` fails

### UIHandler
- UI manifest with `type` or `provides` rejected
- UI receives declared services
- UI event source from UI manifest name
- UI failure returns Failure without stopping system

### ContextBuilder
- Context: services + scoped events + config + lifecycle hooks
- Scoped `events.publish` injects source from manifest
- Optional deps present only if available
- `reportCriticalError` available for plugin→Core

## Writing New Tests

1. Create `tests/new-module.test.js`
2. Follow existing patterns (injectable deps, no FS in unit tests)
3. Test both success and failure paths
4. Verify security logging where applicable
5. Run `node --test tests/new-module.test.js`

## Test Utilities

Common test helpers in test files:
- `createManifest(overrides)` — Creates plugin manifest
- `createUIManifest(overrides)` — Creates UI manifest
- `createConfig(overrides)` — Creates bootstrap config
- `createPluginDir(manifest, setupFn)` — Creates temp plugin dir
- `createUIDir(manifest, setupFn)` — Creates temp UI dir
- `createBootstrapFile(config)` — Creates temp bootstrap.json
- `createFakeModuleLoader(manifest, setupFn)` — Injectable two-step ModuleLoader (loadManifest / loadEntry)
- `createFsModuleLoader()` — File-system-backed ModuleLoader for integration tests
- `createNodeHost(bootstrapPath)` — Creates a Node.js-style Runtime Host triple (ConfigSource, EnvSource, ModuleLoader)