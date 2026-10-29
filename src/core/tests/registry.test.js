// Tests for Registry — verifies register, getForPlugin, remove, and deregisterByPlugin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/registry.js';
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

function createFakeEventBus() {
  const published = [];
  return {
    published,
    publish(event, source, manifest) {
      published.push({ event, source, manifest });
    },
  };
}

function createManifest({ provides = [], required = [], optional = [] } = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.5',
    description: 'test',
    type: 'product',
    dependencies: { required, optional },
    provides,
    events: [],
    config: {},
  };
}

test('register stores a declared service', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  const result = registry.register('acme.foo.service', { method: () => {} }, 'acme.foo', manifest);

  assert.equal(result.success, true);
  assert.equal(registry.has('acme.foo.service'), true);
});

test('register rejects an undeclared service with a security log', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({ provides: [] });

  const result = registry.register('acme.bar.service', {}, 'acme.foo', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'SERVICE_NOT_DECLARED_IN_MANIFEST');
  assert.equal(registry.has('acme.bar.service'), false);

  const securityLogs = logger.getEntries().filter((e) => e.level === 'security');
  assert.equal(securityLogs.length, 1);
  assert.equal(securityLogs[0].message, 'UNAUTHORIZED_REGISTER');
});

test('register rejects a duplicate service name', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  registry.register('acme.foo.service', {}, 'acme.first', manifest);
  const result = registry.register('acme.foo.service', {}, 'acme.second', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'DUPLICATE_SERVICE');
});

test('getForPlugin returns a declared required service', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const providerManifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });
  const consumerManifest = createManifest({ required: ['acme.foo.service'] });

  registry.register('acme.foo.service', { value: 42 }, 'acme.foo', providerManifest);
  const result = registry.getForPlugin('acme.foo.service', 'acme.bar', consumerManifest);

  assert.equal(result.available, true);
  assert.equal(result.service.value, 42);
});

test('getForPlugin returns a declared optional service when present', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const providerManifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });
  const consumerManifest = createManifest({ optional: ['acme.foo.service'] });

  registry.register('acme.foo.service', { value: 99 }, 'acme.foo', providerManifest);
  const result = registry.getForPlugin('acme.foo.service', 'acme.bar', consumerManifest);

  assert.equal(result.available, true);
  assert.equal(result.service.value, 99);
});

test('getForPlugin returns absent for an optional dependency that does not exist', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const consumerManifest = createManifest({ optional: ['acme.missing.service'] });

  const result = registry.getForPlugin('acme.missing.service', 'acme.bar', consumerManifest);

  assert.equal(result.available, false);
  assert.equal(result.service, undefined);
});

test('getForPlugin rejects access to an undeclared service with a security log', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const providerManifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });
  const consumerManifest = createManifest({ required: [] });

  registry.register('acme.foo.service', {}, 'acme.foo', providerManifest);
  const result = registry.getForPlugin('acme.foo.service', 'acme.bar', consumerManifest);

  assert.equal(result.available, false);
  assert.equal(result.error, 'SERVICE_NOT_DECLARED_IN_DEPENDENCIES');

  const securityLogs = logger.getEntries().filter((e) => e.level === 'security');
  assert.equal(securityLogs.length, 1);
  assert.equal(securityLogs[0].message, 'UNAUTHORIZED_ACCESS');
});

test('has returns false for an unregistered service', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);

  assert.equal(registry.has('acme.missing.service'), false);
});

test('remove silently deletes a service without publishing events', () => {
  const logger = createInternalLogger();
  const eventBus = createFakeEventBus();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  registry.register('acme.foo.service', {}, 'acme.foo', manifest);
  registry.remove('acme.foo.service');

  assert.equal(registry.has('acme.foo.service'), false);
  assert.equal(eventBus.published.length, 0);
});

test('remove does nothing for a service that does not exist', () => {
  const logger = createInternalLogger();
  const registry = createRegistry(logger, CORE_MANIFEST);

  assert.doesNotThrow(() => registry.remove('acme.missing.service'));
});

test('deregisterByPlugin removes all services from that plugin and publishes core:service-unavailable', () => {
  const logger = createInternalLogger();
  const eventBus = createFakeEventBus();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({
    provides: [{ name: 'acme.foo.service' }, { name: 'acme.bar.service' }],
  });

  registry.register('acme.foo.service', {}, 'acme.foo', manifest);
  registry.register('acme.bar.service', {}, 'acme.foo', manifest);

  const removed = registry.deregisterByPlugin('acme.foo', eventBus);

  assert.deepEqual(removed.sort(), ['acme.bar.service', 'acme.foo.service']);
  assert.equal(registry.has('acme.foo.service'), false);
  assert.equal(registry.has('acme.bar.service'), false);
  assert.equal(eventBus.published.length, 2);

  const types = eventBus.published.map((p) => p.event.type).sort();
  assert.deepEqual(types, ['core:service-unavailable', 'core:service-unavailable']);
});

test('deregisterByPlugin does not remove services from other plugins', () => {
  const logger = createInternalLogger();
  const eventBus = createFakeEventBus();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifestA = createManifest({ provides: [{ name: 'acme.a.service' }] });
  const manifestB = createManifest({ provides: [{ name: 'acme.b.service' }] });

  registry.register('acme.a.service', {}, 'acme.a', manifestA);
  registry.register('acme.b.service', {}, 'acme.b', manifestB);

  registry.deregisterByPlugin('acme.a', eventBus);

  assert.equal(registry.has('acme.a.service'), false);
  assert.equal(registry.has('acme.b.service'), true);
});

test('deregisterByPlugin returns empty array for a plugin with no services', () => {
  const logger = createInternalLogger();
  const eventBus = createFakeEventBus();
  const registry = createRegistry(logger, CORE_MANIFEST);

  const removed = registry.deregisterByPlugin('acme.empty', eventBus);

  assert.deepEqual(removed, []);
  assert.equal(eventBus.published.length, 0);
});

test('deregisterByPlugin event data includes serviceName and providerPlugin', () => {
  const logger = createInternalLogger();
  const eventBus = createFakeEventBus();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  registry.register('acme.foo.service', {}, 'acme.foo', manifest);
  registry.deregisterByPlugin('acme.foo', eventBus);

  const event = eventBus.published[0];
  assert.equal(event.event.data.serviceName, 'acme.foo.service');
  assert.equal(event.event.data.providerPlugin, 'acme.foo');
  assert.equal(event.source, 'core');
});
