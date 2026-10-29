// Tests for PluginLifecycle — verifies reportCriticalError, stopPlugin,
// two-phase entry point (invokePrepare/invokeActivate), and group-based
// startup (processGroup, handleGroupFailure, handleDeclarationFailure).
// Uses an injectable moduleLoader (two-step contract: loadManifest / loadEntry) — no file system I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPluginLifecycle,
  invokePrepare,
  invokeActivate,
  processGroup,
  handleGroupFailure,
  handleDeclarationFailure,
  PLUGIN_GROUP,
} from '../src/plugin-lifecycle.js';
import { createInternalLogger } from '../src/internal-logger.js';
import { createInternalState, PLUGIN_STATUS } from '../src/internal-state.js';
import { createRegistry } from '../src/registry.js';
import { createEventBus } from '../src/event-bus.js';
import { createStartupRegistry } from '../src/startup-registry.js';
import { STARTUP_FAILURE_REASON } from '../src/error-manager.js';

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

function createManifest(overrides = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.5',
    description: 'test plugin',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
    ...overrides,
  };
}

function setup() {
  const logger = createInternalLogger();
  const internalState = createInternalState();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const lifecycle = createPluginLifecycle({
    logger,
    internalState,
    registry,
    eventBus,
    coreManifest: CORE_MANIFEST,
    moduleLoader: { async loadManifest() {}, async loadEntry() {} },
  });
  return { logger, internalState, eventBus, registry, lifecycle };
}

/**
 * Registers a plugin directly as ACTIVE with the given context, simulating
 * the post-commit state of a plugin that has successfully started via processGroup.
 * Used to test reportCriticalError and stopPlugin without the full group flow.
 */
function setupActivePlugin(internalState, manifest, context = {}) {
  internalState.registerPlugin({
    name: manifest.name,
    version: manifest.version,
    manifest,
    context,
  });
  internalState.setPluginStatus(manifest.name, PLUGIN_STATUS.ACTIVE);
  return internalState.getPlugin(manifest.name);
}

// --- reportCriticalError ---

test('reportCriticalError deactivates plugin and publishes core:plugin-crashed', () => {
  const manifest = createManifest({ name: 'acme.crash' });
  const { lifecycle, internalState, eventBus } = setup();

  let crashed = null;
  eventBus.subscribe('core:plugin-crashed', (event) => { crashed = event; }, 'acme.listener');

  setupActivePlugin(internalState, manifest, {});
  lifecycle.reportCriticalError('acme.crash', { code: 'FATAL_ERROR', message: 'crashed' });

  assert.equal(internalState.getPlugin('acme.crash').status, PLUGIN_STATUS.INACTIVE);
  assert.ok(crashed !== null);
  assert.equal(crashed.data.pluginName, 'acme.crash');
  assert.equal(crashed.data.code, 'FATAL_ERROR');
});

test('reportCriticalError calls onDeactivated before removing services', () => {
  const manifest = createManifest({ name: 'acme.deact' });
  let deactivatedCalled = false;
  let statusAtDeactivation = null;
  const { lifecycle, internalState } = setup();

  const context = {
    onDeactivated: () => {
      deactivatedCalled = true;
      statusAtDeactivation = internalState.getPlugin('acme.deact').status;
    },
  };
  setupActivePlugin(internalState, manifest, context);
  lifecycle.reportCriticalError('acme.deact', { code: 'CRASH', message: 'failed' });

  assert.equal(deactivatedCalled, true);
  assert.equal(statusAtDeactivation, PLUGIN_STATUS.INACTIVE);
});

test('reportCriticalError does nothing for an already-inactive plugin', () => {
  const manifest = createManifest({ name: 'acme.idle' });
  const { lifecycle, internalState, eventBus } = setup();

  let crashed = false;
  eventBus.subscribe('core:plugin-crashed', () => { crashed = true; }, 'acme.listener');

  setupActivePlugin(internalState, manifest, {});
  lifecycle.reportCriticalError('acme.idle', { code: 'X', message: 'x' });
  crashed = false;
  lifecycle.reportCriticalError('acme.idle', { code: 'Y', message: 'y' });

  assert.equal(crashed, false);
});

// --- stopPlugin ---

test('stopPlugin sets INACTIVE and publishes pluginname:stopped', () => {
  const manifest = createManifest({ name: 'acme.stop' });
  const { lifecycle, internalState, eventBus } = setup();

  let stopped = null;
  eventBus.subscribe('stop:stopped', (event) => { stopped = event; }, 'acme.listener');

  setupActivePlugin(internalState, manifest, {});
  lifecycle.stopPlugin('acme.stop');

  assert.equal(internalState.getPlugin('acme.stop').status, PLUGIN_STATUS.INACTIVE);
  assert.ok(stopped !== null);
  assert.equal(stopped.type, 'stop:stopped');
});

test('stopPlugin calls onShutdown before setting INACTIVE', () => {
  const manifest = createManifest({ name: 'acme.shut' });
  let shutdownCalled = false;
  let statusAtShutdown = null;
  const { lifecycle, internalState } = setup();

  const context = {
    onShutdown: () => {
      shutdownCalled = true;
      statusAtShutdown = internalState.getPlugin('acme.shut').status;
    },
  };
  setupActivePlugin(internalState, manifest, context);
  lifecycle.stopPlugin('acme.shut');

  assert.equal(shutdownCalled, true);
  assert.equal(statusAtShutdown, PLUGIN_STATUS.ACTIVE);
});

test('stopPlugin does nothing for an already-inactive plugin', () => {
  const manifest = createManifest({ name: 'acme.nostop' });
  const { lifecycle, internalState, eventBus } = setup();

  let stopped = false;
  eventBus.subscribe('nostop:stopped', () => { stopped = true; }, 'acme.listener');

  setupActivePlugin(internalState, manifest, {});
  lifecycle.stopPlugin('acme.nostop');
  stopped = false;
  lifecycle.stopPlugin('acme.nostop');

  assert.equal(stopped, false);
});

test('stopPlugin error during onShutdown does not block the process', () => {
  const manifest = createManifest({ name: 'acme.errshut' });
  const { lifecycle, internalState } = setup();

  const context = {
    onShutdown: () => { throw new Error('shutdown crashed'); },
  };
  setupActivePlugin(internalState, manifest, context);
  lifecycle.stopPlugin('acme.errshut');

  assert.equal(internalState.getPlugin('acme.errshut').status, PLUGIN_STATUS.INACTIVE);
});

// --- Two-phase entry point (0.11 contract): invokePrepare / invokeActivate ---

test('invokePrepare returns the prepared service instances', async () => {
  const prepareContext = { config: {}, events: {}, reportCriticalError: () => {} };
  const entryModule = {
    async prepare(ctx) {
      assert.equal(ctx, prepareContext);
      return [{ name: 'acme.foo.service', object: { method: () => {} } }];
    },
    async activate() {},
  };

  const provided = await invokePrepare(entryModule, prepareContext);

  assert.equal(provided.length, 1);
  assert.equal(provided[0].name, 'acme.foo.service');
});

test('invokePrepare throws when prepare() does not return an array', async () => {
  const prepareContext = { config: {}, events: {}, reportCriticalError: () => {} };
  const entryModule = {
    async prepare() { return null; },
    async activate() {},
  };

  await assert.rejects(
    () => invokePrepare(entryModule, prepareContext),
    /prepare\(\) must return an array of service instances/,
  );
});

test('invokePrepare propagates errors thrown by prepare()', async () => {
  const prepareContext = { config: {}, events: {}, reportCriticalError: () => {} };
  const entryModule = {
    async prepare() { throw new Error('prepare failed'); },
    async activate() {},
  };

  await assert.rejects(
    () => invokePrepare(entryModule, prepareContext),
    /prepare failed/,
  );
});

test('invokeActivate calls activate() with the bound services', async () => {
  const services = { 'acme.foo.service': { method: () => {} } };
  let received;
  const entryModule = {
    async prepare() { return []; },
    async activate(svc) { received = svc; },
  };

  await invokeActivate(entryModule, services);

  assert.equal(received, services);
});

test('invokeActivate propagates errors thrown by activate()', async () => {
  const entryModule = {
    async prepare() { return []; },
    async activate() { throw new Error('activate failed'); },
  };

  await assert.rejects(
    () => invokeActivate(entryModule, {}),
    /activate failed/,
  );
});

// --- processGroup: group-based startup (0.11) ---

function createGroupManifest({
  name, type = 'product', provides = [], required = [], optional = [], events = [],
} = {}) {
  return {
    name,
    version: '1.0.0',
    architecture: '0.11',
    description: 'test',
    type,
    dependencies: { required, optional },
    provides,
    events,
    config: {},
  };
}

function createGroupConfig(overrides = {}) {
  return {
    architecture: '0.11',
    core: { name: 'pey.core', version: '0.2.0' },
    adapters: {},
    ui: { path: './ui' },
    plugins: [],
    config: {},
    app: { name: 'Test', version: '1.0.0' },
    ...overrides,
  };
}

function createTwoPhaseModule({ prepareFn, activateFn } = {}) {
  return {
    async prepare(ctx) { return prepareFn ? prepareFn(ctx) : []; },
    async activate(svc) { if (activateFn) activateFn(svc); },
  };
}

function setupGroup() {
  const logger = createInternalLogger();
  const internalState = createInternalState();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const startupRegistry = createStartupRegistry(logger);
  const config = createGroupConfig();
  const published = [];
  const originalPublish = eventBus.publish.bind(eventBus);
  eventBus.publish = (event, source, manifest) => {
    published.push({ event, source, manifest });
    originalPublish(event, source, manifest);
  };
  return { logger, internalState, eventBus, registry, startupRegistry, config, published };
}

test('processGroup succeeds for a single application plugin', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config, published } = setupGroup();
  const manifest = createGroupManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });
  const manifests = new Map([['acme.foo', manifest]]);
  const moduleLoader = {
    async loadEntry() {
      return createTwoPhaseModule({
        prepareFn: () => [{ name: 'acme.foo.service', object: { method: () => {} } }],
      });
    },
  };

  const result = await processGroup({
    pluginEntries: [{ name: 'acme.foo', path: './foo' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.APPLICATION,
  });

  assert.equal(result.failed, false);
  assert.equal(internalState.getPlugin('acme.foo').status, PLUGIN_STATUS.ACTIVE);
  assert.equal(internalState.getPlugin('acme.foo').committed, true);
  assert.equal(registry.has('acme.foo.service'), true);
  // pluginname:ready published after commit
  assert.ok(published.some((p) => p.event.type === 'foo:ready'));
});

test('processGroup publishes pluginname:ready in configuration order', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config, published } = setupGroup();
  const manifests = new Map([
    ['acme.first', createGroupManifest({ name: 'acme.first', provides: [{ name: 'acme.first.service' }] })],
    ['acme.second', createGroupManifest({ name: 'acme.second', provides: [{ name: 'acme.second.service' }] })],
  ]);
  const moduleLoader = {
    async loadEntry() {
      return createTwoPhaseModule({ prepareFn: () => [] });
    },
  };

  await processGroup({
    pluginEntries: [{ name: 'acme.first', path: './first' }, { name: 'acme.second', path: './second' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.APPLICATION,
  });

  const readyEvents = published.filter((p) => p.event.type.endsWith(':ready')).map((p) => p.event.type);
  assert.deepEqual(readyEvents, ['first:ready', 'second:ready']);
});

test('processGroup supports a required dependency cycle within the application group', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config } = setupGroup();
  // A requires B's service; B requires A's service — a cycle within the group.
  const manifests = new Map([
    ['acme.a', createGroupManifest({
      name: 'acme.a', provides: [{ name: 'acme.a.service' }], required: ['acme.b.service'],
    })],
    ['acme.b', createGroupManifest({
      name: 'acme.b', provides: [{ name: 'acme.b.service' }], required: ['acme.a.service'],
    })],
  ]);
  const moduleLoader = {
    async loadEntry(ref) {
      // Return a module that prepares the correct service for each plugin.
      if (ref === './a') {
        return createTwoPhaseModule({ prepareFn: () => [{ name: 'acme.a.service', object: {} }] });
      }
      return createTwoPhaseModule({ prepareFn: () => [{ name: 'acme.b.service', object: {} }] });
    },
  };

  const result = await processGroup({
    pluginEntries: [{ name: 'acme.a', path: './a' }, { name: 'acme.b', path: './b' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.APPLICATION,
  });

  assert.equal(result.failed, false);
  assert.equal(internalState.getPlugin('acme.a').status, PLUGIN_STATUS.ACTIVE);
  assert.equal(internalState.getPlugin('acme.b').status, PLUGIN_STATUS.ACTIVE);
});

test('processGroup cascades deactivation when a required provider fails to prepare', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config, published } = setupGroup();
  // provider fails prepare; consumer depends on provider's service.
  const manifests = new Map([
    ['acme.provider', createGroupManifest({
      name: 'acme.provider', provides: [{ name: 'acme.base.service' }],
    })],
    ['acme.consumer', createGroupManifest({
      name: 'acme.consumer', required: ['acme.base.service'],
    })],
  ]);
  let callCount = 0;
  const moduleLoader = {
    async loadEntry() {
      callCount += 1;
      // First call (provider) throws; second (consumer) succeeds but will be cascaded.
      if (callCount === 1) {
        return createTwoPhaseModule({ prepareFn: () => { throw new Error('prepare failed'); } });
      }
      return createTwoPhaseModule({ prepareFn: () => [] });
    },
  };

  const result = await processGroup({
    pluginEntries: [{ name: 'acme.provider', path: './provider' }, { name: 'acme.consumer', path: './consumer' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.APPLICATION,
  });

  assert.equal(result.failed, false); // application group: not fatal
  assert.equal(internalState.getPlugin('acme.provider').status, PLUGIN_STATUS.INACTIVE);
  assert.equal(internalState.getPlugin('acme.consumer').status, PLUGIN_STATUS.INACTIVE);
  // Both should have core:plugin-failed published
  const failedEvents = published.filter((p) => p.event.type === 'core:plugin-failed');
  assert.equal(failedEvents.length, 2);
  // Consumer should have REQUIRED_DEPENDENCY_UNAVAILABLE reason
  const consumerFailed = failedEvents.find((p) => p.event.data.pluginName === 'acme.consumer');
  assert.equal(consumerFailed.event.data.code, STARTUP_FAILURE_REASON.REQUIRED_DEPENDENCY_UNAVAILABLE);
});

test('processGroup short-circuits on infrastructure preparation failure', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config } = setupGroup();
  const manifests = new Map([
    ['acme.first', createGroupManifest({
      name: 'acme.first', type: 'infrastructure', provides: [{ name: 'acme.first.service' }],
    })],
    ['acme.second', createGroupManifest({
      name: 'acme.second', type: 'infrastructure', provides: [{ name: 'acme.second.service' }],
    })],
  ]);
  let callCount = 0;
  const moduleLoader = {
    async loadEntry() {
      callCount += 1;
      if (callCount === 1) {
        return createTwoPhaseModule({ prepareFn: () => { throw new Error('prepare failed'); } });
      }
      return createTwoPhaseModule({ prepareFn: () => [] });
    },
  };

  const result = await processGroup({
    pluginEntries: [{ name: 'acme.first', path: './first' }, { name: 'acme.second', path: './second' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.INFRASTRUCTURE,
  });

  assert.equal(result.failed, true);
  assert.equal(result.reason, 'INFRASTRUCTURE_PLUGIN_FAILED');
  // Second plugin should NOT have been prepared (short-circuit)
  assert.equal(internalState.hasPlugin('acme.second'), false);
});

test('processGroup marks plugins ACTIVE only after group commit', async () => {
  const { logger, internalState, eventBus, registry, startupRegistry, config } = setupGroup();
  const manifest = createGroupManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });
  const manifests = new Map([['acme.foo', manifest]]);
  let statusDuringPrepare;
  const moduleLoader = {
    async loadEntry() {
      return createTwoPhaseModule({
        prepareFn: () => {
          statusDuringPrepare = internalState.getPlugin('acme.foo').status;
          return [{ name: 'acme.foo.service', object: {} }];
        },
      });
    },
  };

  await processGroup({
    pluginEntries: [{ name: 'acme.foo', path: './foo' }],
    manifests, config, startupRegistry, registry,
    internalState, eventBus, coreManifest: CORE_MANIFEST, moduleLoader, logger,
    group: PLUGIN_GROUP.APPLICATION,
  });

  // During prepare, the plugin must be INACTIVE, not ACTIVE.
  assert.equal(statusDuringPrepare, PLUGIN_STATUS.INACTIVE);
  assert.equal(internalState.getPlugin('acme.foo').status, PLUGIN_STATUS.ACTIVE);
});

test('handleGroupFailure publishes core:plugin-failed and marks plugin inactive', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  internalState.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createGroupManifest({ name: 'acme.foo' }),
    context: {},
  });

  handleGroupFailure(
    { name: 'acme.foo' }, createGroupManifest({ name: 'acme.foo' }),
    'PREPARATION_FAILED', 'detail', internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(internalState.getPlugin('acme.foo').status, PLUGIN_STATUS.INACTIVE);
  assert.ok(published.some((p) => p.event.type === 'core:plugin-failed' && p.event.data.pluginName === 'acme.foo'));
});

test('handleGroupFailure calls onDeactivated for a prepared plugin before setting INACTIVE', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  let deactivatedCalled = false;
  let statusAtDeactivation = null;
  const context = {
    onDeactivated: () => {
      deactivatedCalled = true;
      statusAtDeactivation = internalState.getPlugin('acme.prepared').status;
    },
  };
  internalState.registerPlugin({
    name: 'acme.prepared',
    version: '1.0.0',
    manifest: createGroupManifest({ name: 'acme.prepared' }),
    context,
  });
  // Simulate a successful prepare — markPrepared sets prepared: true
  internalState.markPrepared('acme.prepared', true);

  handleGroupFailure(
    { name: 'acme.prepared' }, createGroupManifest({ name: 'acme.prepared' }),
    'REQUIRED_DEPENDENCY_UNAVAILABLE', 'detail', internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(deactivatedCalled, true, 'onDeactivated should be called for a prepared plugin');
  // Status should still be INACTIVE (not yet changed) when onDeactivated runs
  assert.equal(statusAtDeactivation, PLUGIN_STATUS.INACTIVE);
  assert.equal(internalState.getPlugin('acme.prepared').status, PLUGIN_STATUS.INACTIVE);
});

test('handleGroupFailure does not call onDeactivated for a plugin that was never prepared', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  let deactivatedCalled = false;
  const context = {
    onDeactivated: () => { deactivatedCalled = true; },
  };
  internalState.registerPlugin({
    name: 'acme.unprepared',
    version: '1.0.0',
    manifest: createGroupManifest({ name: 'acme.unprepared' }),
    context,
  });
  // Plugin was registered but prepare() was never called — prepared: false

  handleGroupFailure(
    { name: 'acme.unprepared' }, createGroupManifest({ name: 'acme.unprepared' }),
    'PREPARATION_FAILED', 'detail', internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(deactivatedCalled, false, 'onDeactivated should NOT be called for an unprepared plugin');
  assert.equal(internalState.getPlugin('acme.unprepared').status, PLUGIN_STATUS.INACTIVE);
});

test('handleGroupFailure catches errors from onDeactivated without blocking', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  const context = {
    onDeactivated: () => { throw new Error('deactivation crashed'); },
  };
  internalState.registerPlugin({
    name: 'acme.crashy',
    version: '1.0.0',
    manifest: createGroupManifest({ name: 'acme.crashy' }),
    context,
  });
  internalState.markPrepared('acme.crashy', true);

  // Should not throw — the error is caught and logged
  handleGroupFailure(
    { name: 'acme.crashy' }, createGroupManifest({ name: 'acme.crashy' }),
    'ACTIVATION_FAILED', 'detail', internalState, eventBus, CORE_MANIFEST, logger,
  );

  // Plugin is still marked INACTIVE and core:plugin-failed is still published
  assert.equal(internalState.getPlugin('acme.crashy').status, PLUGIN_STATUS.INACTIVE);
  assert.ok(published.some((p) => p.event.type === 'core:plugin-failed' && p.event.data.pluginName === 'acme.crashy'));
});

test('handleDeclarationFailure returns fatal for an infrastructure plugin', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  const manifest = createGroupManifest({ name: 'acme.storage', type: 'infrastructure' });

  const result = handleDeclarationFailure(
    { name: 'acme.storage' }, manifest, 'INCOMPATIBLE_ARCHITECTURE', 'detail',
    internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(result.fatal, true);
  assert.ok(published.some((p) => p.event.type === 'core:startup-failed'));
});

test('handleDeclarationFailure returns fatal when manifest is null (unreadable)', () => {
  const { logger, internalState, eventBus } = setupGroup();

  const result = handleDeclarationFailure(
    { name: 'acme.bad' }, null, 'INVALID_MANIFEST', 'could not read',
    internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(result.fatal, true);
});

test('handleDeclarationFailure returns non-fatal for an application plugin', () => {
  const { logger, internalState, eventBus, published } = setupGroup();
  const manifest = createGroupManifest({ name: 'acme.feature', type: 'feature' });

  const result = handleDeclarationFailure(
    { name: 'acme.feature' }, manifest, 'INCOMPATIBLE_ARCHITECTURE', 'detail',
    internalState, eventBus, CORE_MANIFEST, logger,
  );

  assert.equal(result.fatal, false);
  assert.ok(!published.some((p) => p.event.type === 'core:startup-failed'));
});
