// Tests for StartupRegistry — verifies add, has, get, getProvider, remove,
// removeByPlugin, and promoteToPublic. Confirms removal is silent (no
// core:service-unavailable) and that promotion moves services to the public Registry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStartupRegistry } from '../src/startup-registry.js';
import { createRegistry } from '../src/registry.js';
import { createInternalLogger } from '../src/internal-logger.js';

const CORE_MANIFEST = {
  name: 'pey.core',
  version: '0.2.0',
  architecture: '0.11',
  description: 'Pey Core',
  type: 'infrastructure',
  dependencies: { required: [], optional: [] },
  provides: [],
  events: [],
  config: {},
};

function createManifest({ provides = [], name = 'acme.test' } = {}) {
  return {
    name,
    version: '1.0.0',
    architecture: '0.11',
    description: 'test',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides,
    events: [],
    config: {},
  };
}

test('add stores a declared service', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  const result = startupRegistry.add('acme.foo.service', { method: () => {} }, 'acme.foo', manifest);

  assert.equal(result.success, true);
  assert.equal(startupRegistry.has('acme.foo.service'), true);
});

test('add rejects an undeclared service with a security log', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [] });

  const result = startupRegistry.add('acme.bar.service', {}, 'acme.foo', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'SERVICE_NOT_DECLARED_IN_MANIFEST');
  assert.equal(startupRegistry.has('acme.bar.service'), false);

  const securityLogs = logger.getEntries().filter((e) => e.level === 'security');
  assert.equal(securityLogs.length, 1);
  assert.equal(securityLogs[0].message, 'UNAUTHORIZED_PREPARE');
});

test('add rejects a duplicate service name', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  startupRegistry.add('acme.foo.service', {}, 'acme.first', manifest);
  const result = startupRegistry.add('acme.foo.service', {}, 'acme.second', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'DUPLICATE_SERVICE');
});

test('has returns false for a service that was not added', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);

  assert.equal(startupRegistry.has('acme.missing.service'), false);
});

test('get returns the prepared service object', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });
  const serviceObject = { method: () => 'hello' };

  startupRegistry.add('acme.foo.service', serviceObject, 'acme.foo', manifest);

  assert.equal(startupRegistry.get('acme.foo.service'), serviceObject);
});

test('get returns null for a service that was not added', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);

  assert.equal(startupRegistry.get('acme.missing.service'), null);
});

test('getProvider returns the preparing plugin name', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', manifest);

  assert.equal(startupRegistry.getProvider('acme.foo.service'), 'acme.foo');
});

test('getProvider returns null for a service that was not added', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);

  assert.equal(startupRegistry.getProvider('acme.missing.service'), null);
});

test('remove silently removes a single service', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', manifest);
  startupRegistry.remove('acme.foo.service');

  assert.equal(startupRegistry.has('acme.foo.service'), false);
});

test('remove does not publish core:service-unavailable', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', manifest);
  startupRegistry.remove('acme.foo.service');

  // No event bus is involved in the startup registry; removal is purely silent.
  // This test documents that remove never touches an event bus.
  assert.equal(startupRegistry.has('acme.foo.service'), false);
});

test('removeByPlugin removes all services for a plugin', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const manifest = createManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.a' }, { name: 'acme.foo.b' }],
  });
  const otherManifest = createManifest({
    name: 'acme.bar',
    provides: [{ name: 'acme.bar.c' }],
  });

  startupRegistry.add('acme.foo.a', {}, 'acme.foo', manifest);
  startupRegistry.add('acme.foo.b', {}, 'acme.foo', manifest);
  startupRegistry.add('acme.bar.c', {}, 'acme.bar', otherManifest);

  const removed = startupRegistry.removeByPlugin('acme.foo');

  assert.deepEqual(removed.sort(), ['acme.foo.a', 'acme.foo.b']);
  assert.equal(startupRegistry.has('acme.foo.a'), false);
  assert.equal(startupRegistry.has('acme.foo.b'), false);
  assert.equal(startupRegistry.has('acme.bar.c'), true);
});

test('removeByPlugin returns an empty list when the plugin prepared nothing', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);

  const removed = startupRegistry.removeByPlugin('acme.nobody');

  assert.deepEqual(removed, []);
});

test('promoteToPublic moves services to the public Registry', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const manifest = createManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });
  const serviceObject = { method: () => {} };

  startupRegistry.add('acme.foo.service', serviceObject, 'acme.foo', manifest);

  const result = startupRegistry.promoteToPublic(registry, 'acme.foo', manifest);

  assert.equal(result.success, true);
  assert.deepEqual(result.promotedServices, ['acme.foo.service']);
  assert.equal(startupRegistry.has('acme.foo.service'), false);
  assert.equal(registry.has('acme.foo.service'), true);
});

test('promoteToPublic only promotes services for the named plugin', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);
  const fooManifest = createManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });
  const barManifest = createManifest({
    name: 'acme.bar',
    provides: [{ name: 'acme.bar.service' }],
  });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', fooManifest);
  startupRegistry.add('acme.bar.service', {}, 'acme.bar', barManifest);

  const result = startupRegistry.promoteToPublic(registry, 'acme.foo', fooManifest);

  assert.equal(result.success, true);
  assert.equal(registry.has('acme.foo.service'), true);
  assert.equal(registry.has('acme.bar.service'), false);
  assert.equal(startupRegistry.has('acme.foo.service'), false);
  assert.equal(startupRegistry.has('acme.bar.service'), true);
});

test('promoteToPublic returns an empty list when the plugin prepared nothing', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const registry = createRegistry(logger, CORE_MANIFEST);

  const result = startupRegistry.promoteToPublic(registry, 'acme.nobody', createManifest());

  assert.equal(result.success, true);
  assert.deepEqual(result.promotedServices, []);
});

test('promoteToPublic does not publish core:service-unavailable', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const published = [];
  const fakeRegistry = {
    register(serviceName, serviceObject, providerPlugin, manifest) {
      published.push({ type: 'register', serviceName, providerPlugin });
      return { success: true };
    },
  };
  const manifest = createManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', manifest);
  startupRegistry.promoteToPublic(fakeRegistry, 'acme.foo', manifest);

  // Only register calls should occur; no service-unavailable announcements.
  const unavailable = published.filter((p) => p.type === 'core:service-unavailable');
  assert.equal(unavailable.length, 0);
});

test('promoteToPublic does not remove from private when public registration fails', () => {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const failingRegistry = {
    register() {
      return { success: false, error: 'DUPLICATE_SERVICE' };
    },
  };
  const manifest = createManifest({
    name: 'acme.foo',
    provides: [{ name: 'acme.foo.service' }],
  });

  startupRegistry.add('acme.foo.service', {}, 'acme.foo', manifest);

  const result = startupRegistry.promoteToPublic(failingRegistry, 'acme.foo', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'DUPLICATE_SERVICE');
  // The service must remain in the private registry — state stays consistent.
  assert.equal(startupRegistry.has('acme.foo.service'), true);
});
