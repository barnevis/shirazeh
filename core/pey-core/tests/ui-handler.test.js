// Tests for UIHandler — verifies UI manifest validation, context building, and startup/shutdown.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUIHandler } from '../src/ui-handler.js';
import { createInternalLogger } from '../src/internal-logger.js';
import { createRegistry } from '../src/registry.js';
import { createEventBus } from '../src/event-bus.js';

const CORE_MANIFEST = {
  name: 'pey.core',
  version: '0.1.0',
  architecture: '0.5',
  description: 'Pey Core',
  type: 'infrastructure',
  dependencies: { required: [], optional: [] },
  provides: [],
  events: [
    { name: 'core:plugin-failed', description: '', data: [] },
    { name: 'core:plugin-crashed', description: '', data: [] },
    { name: 'core:startup-failed', description: '', data: [] },
    { name: 'core:service-unavailable', description: '', data: [] },
    { name: 'core:ready', description: '', data: [] },
    { name: 'core:shutdown', description: '', data: [] },
    { name: 'core:ui-failed', description: '', data: [] },
  ],
  config: {},
};

function createUIManifest(overrides = {}) {
  return {
    name: 'myapp.ui',
    version: '1.0.0',
    architecture: '0.5',
    description: 'test UI',
    dependencies: { required: [], optional: [] },
    events: [],
    config: {},
    ...overrides,
  };
}

function createConfig(overrides = {}) {
  return {
    architecture: '0.5',
    core: { name: 'pey.core', version: '0.1.0' },
    adapters: {},
    ui: { path: '/fake/ui' },
    plugins: [],
    config: {},
    app: { name: 'Test', version: '1.0.0' },
    ...overrides,
  };
}

/**
 * Creates a fake moduleLoader (two-step contract) that returns the given
 * manifest from loadManifest() and a module with the given setup function
 * from loadEntry().
 */
function createFakeModuleLoader(uiManifest, setupFn) {
  return {
    async loadManifest() { return uiManifest; },
    async loadEntry() { return { setup: setupFn }; },
  };
}

function setup(uiManifest, setupFn) {
  const logger = createInternalLogger();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const handler = createUIHandler({
    logger,
    registry,
    eventBus,
    coreManifest: CORE_MANIFEST,
    moduleLoader: createFakeModuleLoader(uiManifest, setupFn ?? (() => {})),
  });
  return { logger, eventBus, registry, handler };
}

// --- startUI: validation ---

test('startUI fails with INVALID_UI_MANIFEST when manifest has type', async () => {
  const uiManifest = createUIManifest({ type: 'product' });
  const { handler } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_UI_MANIFEST');
});

test('startUI fails with INVALID_UI_MANIFEST when manifest has provides', async () => {
  const uiManifest = createUIManifest({ provides: [{ name: 'acme.service' }] });
  const { handler } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_UI_MANIFEST');
});

test('startUI fails with INVALID_UI_MANIFEST when manifest has adapterType', async () => {
  const uiManifest = createUIManifest({ adapterType: 'storage' });
  const { handler } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_UI_MANIFEST');
});

test('startUI fails with INVALID_UI_MANIFEST when manifest reader throws', async () => {
  const logger = createInternalLogger();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const handler = createUIHandler({
    logger,
    registry,
    eventBus,
    coreManifest: CORE_MANIFEST,
    moduleLoader: {
      loadManifest: async () => { throw new Error('file not found'); },
      loadEntry: async () => { throw new Error('should not be called'); },
    },
  });

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_UI_MANIFEST');
});

test('startUI never calls loadEntry() when manifest validation fails', async () => {
  // Manifest with forbidden `type` → validation fails → loadEntry must never be called.
  const uiManifest = createUIManifest({ type: 'product' });
  let loadEntryCalled = false;
  const logger = createInternalLogger();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const handler = createUIHandler({
    logger,
    registry,
    eventBus,
    coreManifest: CORE_MANIFEST,
    moduleLoader: {
      async loadManifest() { return uiManifest; },
      async loadEntry() { loadEntryCalled = true; return { setup: () => {} }; },
    },
  });

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(loadEntryCalled, false, 'loadEntry() must not be called when validation fails');
});

// --- startUI: success ---

test('startUI succeeds and returns uiContext', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, true);
  assert.ok(result.uiContext);
  assert.ok(typeof result.uiContext.services === 'object');
  assert.ok(typeof result.uiContext.events === 'object');
  assert.ok(typeof result.uiContext.events.publish === 'function');
  assert.ok(typeof result.uiContext.events.subscribe === 'function');
  assert.equal(result.uiContext.onShutdown, null);
});

test('startUI includes required dependencies in services', async () => {
  const uiManifest = createUIManifest({
    name: 'myapp.ui',
    dependencies: { required: ['acme.foo.service'], optional: [] },
  });
  const { handler, registry } = setup(uiManifest, () => {});

  const providerManifest = createUIManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.foo.service' }],
  });
  registry.register('acme.foo.service', { value: 42 }, 'acme.provider', providerManifest);

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, true);
  assert.ok('acme.foo.service' in result.uiContext.services);
  assert.equal(result.uiContext.services['acme.foo.service'].value, 42);
});

test('startUI includes optional dependencies only when available', async () => {
  const uiManifest = createUIManifest({
    name: 'myapp.ui',
    dependencies: { required: [], optional: ['acme.present.service', 'acme.absent.service'] },
  });
  const { handler, registry } = setup(uiManifest, () => {});

  const providerManifest = createUIManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.present.service' }],
  });
  registry.register('acme.present.service', { value: 99 }, 'acme.provider', providerManifest);

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, true);
  assert.ok('acme.present.service' in result.uiContext.services);
  assert.equal(result.uiContext.services['acme.present.service'].value, 99);
  assert.ok(!('acme.absent.service' in result.uiContext.services));
});

test('startUI does not include undeclared services', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler, registry } = setup(uiManifest, () => {});

  const providerManifest = createUIManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.secret.service' }],
  });
  registry.register('acme.secret.service', { value: 'hidden' }, 'acme.provider', providerManifest);

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, true);
  assert.ok(!('acme.secret.service' in result.uiContext.services));
});

test('startUI scoped events.publish injects source from UI manifest name', async () => {
  const uiManifest = createUIManifest({
    name: 'myapp.ui',
    events: [{ name: 'test:event', description: '', data: [] }],
  });
  const { handler, eventBus } = setup(uiManifest, () => {});

  let received = null;
  eventBus.subscribe('test:event', (event) => { received = event; }, 'acme.listener');

  const result = await handler.startUI(createConfig());
  result.uiContext.events.publish('test:event', { id: '123' });

  assert.ok(received !== null);
  assert.equal(received.source, 'myapp.ui');
  assert.deepEqual(received.data, { id: '123' });
});

test('startUI scoped events.subscribe delegates to the Event Bus', async () => {
  const uiManifest = createUIManifest({
    name: 'myapp.ui',
    events: [{ name: 'test:event', description: '', data: [] }],
  });
  const { handler, eventBus } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());

  let received = false;
  result.uiContext.events.subscribe('test:event', () => { received = true; });

  eventBus.publish({ type: 'test:event', data: {} }, 'acme.other', createUIManifest({
    name: 'acme.other',
    events: [{ name: 'test:event', description: '', data: [] }],
  }));

  assert.equal(received, true);
});

test('startUI uses config.config.ui as the UI config', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => {});

  const config = createConfig({ config: { ui: { theme: 'dark', lang: 'fa' } } });
  const result = await handler.startUI(config);

  assert.equal(result.success, true);
  assert.deepEqual(result.uiContext.config, { theme: 'dark', lang: 'fa' });
});

test('startUI uses empty config when config.config.ui is missing', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => {});

  const config = createConfig({ config: {} });
  const result = await handler.startUI(config);

  assert.equal(result.success, true);
  assert.deepEqual(result.uiContext.config, {});
});

// --- startUI: failure ---

test('startUI returns UI_STARTUP_FAILED when entry point throws', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => { throw new Error('UI crashed'); });

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, false);
  assert.equal(result.error, 'UI_STARTUP_FAILED');
  assert.equal(result.detail, 'UI crashed');
});

// --- stopUI ---

test('stopUI calls onShutdown when provided', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  let shutdownCalled = false;
  const { handler } = setup(uiManifest, (ctx) => {
    ctx.onShutdown = () => { shutdownCalled = true; };
  });

  const result = await handler.startUI(createConfig());
  handler.stopUI(result.uiContext);

  assert.equal(shutdownCalled, true);
});

test('stopUI does nothing when uiContext is null', () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => {});

  // Should not throw
  handler.stopUI(null);
});

test('stopUI does nothing when onShutdown is not set', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler } = setup(uiManifest, () => {});

  const result = await handler.startUI(createConfig());
  // Should not throw
  handler.stopUI(result.uiContext);
});

test('stopUI error during onShutdown does not block the process', async () => {
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const { handler, logger } = setup(uiManifest, (ctx) => {
    ctx.onShutdown = () => { throw new Error('shutdown crashed'); };
  });

  const result = await handler.startUI(createConfig());
  // Should not throw
  handler.stopUI(result.uiContext);
});

// --- 0.11: UI resolves services from the public Registry only ---

test('startUI resolves required dependencies from the public Registry only', async () => {
  const providerManifest = {
    name: 'acme.storage',
    version: '1.0.0',
    architecture: '0.11',
    description: 'storage',
    type: 'infrastructure',
    dependencies: { required: [], optional: [] },
    provides: [{ name: 'acme.storage.service' }],
    events: [],
    config: {},
  };
  const uiManifest = createUIManifest({
    name: 'myapp.ui',
    dependencies: { required: ['acme.storage.service'], optional: [] },
  });
  const { handler, registry } = setup(uiManifest, () => {});
  // Register the service in the public Registry (simulating post-commit state)
  registry.register('acme.storage.service', { read: () => {} }, 'acme.storage', providerManifest);

  const result = await handler.startUI(createConfig());

  assert.equal(result.success, true);
  assert.ok('acme.storage.service' in result.uiContext.services);
});