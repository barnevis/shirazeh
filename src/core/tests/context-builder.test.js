// Tests for ContextBuilder — verifies PrepareContext (0.11 two-phase) and
// group service-map resolution from both registries.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrepareContext, buildServiceMapForGroup } from '../src/context-builder.js';
import { createRegistry } from '../src/registry.js';
import { createStartupRegistry } from '../src/startup-registry.js';
import { createEventBus } from '../src/event-bus.js';
import { createInternalLogger } from '../src/internal-logger.js';

const CORE_MANIFEST = {
  name: 'pey.core',
  version: '0.1.0',
  architecture: '0.5',
  description: 'Pey Core',
  type: 'infrastructure',
  dependencies: { required: [], optional: [] },
  provides: [],
  events: [],
  config: {},
};

function createManifest({
  name = 'acme.consumer',
  required = [],
  optional = [],
  provides = [],
  events = [],
} = {}) {
  return {
    name,
    version: '1.0.0',
    architecture: '0.5',
    description: 'test',
    type: 'product',
    dependencies: { required, optional },
    provides,
    events,
    config: {},
  };
}

function setup() {
  const logger = createInternalLogger();
  const eventBus = createEventBus(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  return { logger, eventBus, registry };
}

// --- buildPrepareContext (0.11 two-phase) ---

test('buildPrepareContext returns an object with config, events, and hooks but NO services', () => {
  const { eventBus } = setup();
  const manifest = createManifest();
  const reportCriticalError = () => {};

  const context = buildPrepareContext({
    manifest,
    eventBus,
    config: { timeout: 5000 },
    reportCriticalError,
  });

  assert.equal(context.config.timeout, 5000);
  assert.equal(typeof context.events.publish, 'function');
  assert.equal(typeof context.events.subscribe, 'function');
  assert.equal(context.onShutdown, null);
  assert.equal(context.onDeactivated, null);
  assert.equal(context.reportCriticalError, reportCriticalError);
  // The services field must be absent in the prepare context.
  assert.equal('services' in context, false);
});

test('buildPrepareContext scoped events.publish injects source from manifest name', () => {
  const { logger, eventBus } = setup();
  const manifest = createManifest({ name: 'acme.consumer', events: [{ name: 'consumer:done' }] });
  const context = buildPrepareContext({
    manifest,
    eventBus,
    config: {},
    reportCriticalError: () => {},
  });

  context.events.publish('consumer:done', { id: 1 });

  const entries = logger.getEntries();
  // The event bus logs nothing on publish; verify via a subscriber instead.
  const received = [];
  eventBus.subscribe('consumer:done', (event) => received.push(event));
  context.events.publish('consumer:done', { id: 2 });

  assert.equal(received.length, 1);
  assert.equal(received[0].source, 'acme.consumer');
  assert.equal(received[0].data.id, 2);
});

test('buildPrepareContext onShutdown and onDeactivated can be assigned by the plugin', () => {
  const { eventBus } = setup();
  const manifest = createManifest();
  const context = buildPrepareContext({
    manifest,
    eventBus,
    config: {},
    reportCriticalError: () => {},
  });

  const shutdownHook = () => {};
  const deactivatedHook = () => {};
  context.onShutdown = shutdownHook;
  context.onDeactivated = deactivatedHook;

  assert.equal(context.onShutdown, shutdownHook);
  assert.equal(context.onDeactivated, deactivatedHook);
});

// --- buildServiceMapForGroup (0.11 two-phase binding) ---

test('buildServiceMapForGroup resolves a required dependency from the startup registry', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.foo.service' }],
  });
  const serviceObject = { method: () => {} };
  startupRegistry.add('acme.foo.service', serviceObject, 'acme.provider', providerManifest);

  const consumerManifest = createManifest({
    name: 'acme.consumer',
    required: ['acme.foo.service'],
  });

  const services = buildServiceMapForGroup(consumerManifest, startupRegistry, registry);

  assert.equal(services['acme.foo.service'], serviceObject);
});

test('buildServiceMapForGroup resolves a required dependency from the public registry', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.bar.service' }],
  });
  const serviceObject = { method: () => {} };
  registry.register('acme.bar.service', serviceObject, 'acme.provider', providerManifest);

  const consumerManifest = createManifest({
    name: 'acme.consumer',
    required: ['acme.bar.service'],
  });

  const services = buildServiceMapForGroup(consumerManifest, startupRegistry, registry);

  assert.equal(services['acme.bar.service'], serviceObject);
});

test('buildServiceMapForGroup prefers the startup registry over the public registry', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.shared.service' }],
  });
  const startupService = { from: 'startup' };
  const publicService = { from: 'public' };
  startupRegistry.add('acme.shared.service', startupService, 'acme.provider', providerManifest);
  registry.register('acme.shared.service', publicService, 'acme.provider', providerManifest);

  const consumerManifest = createManifest({
    name: 'acme.consumer',
    required: ['acme.shared.service'],
  });

  const services = buildServiceMapForGroup(consumerManifest, startupRegistry, registry);

  assert.equal(services['acme.shared.service'], startupService);
});

test('buildServiceMapForGroup includes optional dependencies only when available', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.optional.service' }],
  });
  startupRegistry.add('acme.optional.service', {}, 'acme.provider', providerManifest);

  const consumerManifest = createManifest({
    name: 'acme.consumer',
    optional: ['acme.optional.service', 'acme.missing.service'],
  });

  const services = buildServiceMapForGroup(consumerManifest, startupRegistry, registry);

  assert.ok('acme.optional.service' in services);
  assert.ok(!('acme.missing.service' in services));
});

test('buildServiceMapForGroup does not include undeclared services', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.foo.service' }],
  });
  startupRegistry.add('acme.foo.service', {}, 'acme.provider', providerManifest);

  const consumerManifest = createManifest({
    name: 'acme.consumer',
    required: [],
    optional: [],
  });

  const services = buildServiceMapForGroup(consumerManifest, startupRegistry, registry);

  assert.ok(!('acme.foo.service' in services));
});

test('buildServiceMapForGroup throws an invariant error when a required dependency is missing', () => {
  const { logger, registry } = setup();
  const startupRegistry = createStartupRegistry(logger);
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    required: ['acme.missing.service'],
  });

  assert.throws(
    () => buildServiceMapForGroup(consumerManifest, startupRegistry, registry),
    (err) => err.code === 'REQUIRED_DEPENDENCY_MISSING'
      && err.pluginName === 'acme.consumer'
      && err.serviceName === 'acme.missing.service',
  );
});
