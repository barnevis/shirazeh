// Tests for Security — verifies access-control primitives, sensitive data checks, and scoped Event Bus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isServiceDeclared,
  isEventDeclared,
  isServiceProvided,
  isSensitive,
  hasNoSensitiveData,
  createScopedEventBus,
} from '../src/security.js';
import { createEventBus } from '../src/event-bus.js';
import { createInternalLogger } from '../src/internal-logger.js';

function createManifest({
  name = 'acme.test',
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

// --- isServiceDeclared ---

test('isServiceDeclared returns true for a required dependency', () => {
  const manifest = createManifest({ required: ['acme.foo.service'] });
  assert.equal(isServiceDeclared('acme.foo.service', manifest), true);
});

test('isServiceDeclared returns true for an optional dependency', () => {
  const manifest = createManifest({ optional: ['acme.bar.service'] });
  assert.equal(isServiceDeclared('acme.bar.service', manifest), true);
});

test('isServiceDeclared returns false for an undeclared service', () => {
  const manifest = createManifest({ required: [], optional: [] });
  assert.equal(isServiceDeclared('acme.secret.service', manifest), false);
});

test('isServiceDeclared returns false when dependencies is missing', () => {
  assert.equal(isServiceDeclared('acme.foo.service', { name: 'acme.test' }), false);
});

// --- isEventDeclared ---

test('isEventDeclared returns true for a declared event', () => {
  const manifest = createManifest({ events: [{ name: 'test:saved', description: '', data: [] }] });
  assert.equal(isEventDeclared('test:saved', manifest), true);
});

test('isEventDeclared returns false for an undeclared event', () => {
  const manifest = createManifest({ events: [] });
  assert.equal(isEventDeclared('test:undeclared', manifest), false);
});

test('isEventDeclared returns false when events is missing', () => {
  assert.equal(isEventDeclared('test:event', { name: 'acme.test' }), false);
});

// --- isServiceProvided ---

test('isServiceProvided returns true for a declared service in provides', () => {
  const manifest = createManifest({ provides: [{ name: 'acme.foo.service' }] });
  assert.equal(isServiceProvided('acme.foo.service', manifest), true);
});

test('isServiceProvided returns false for an undeclared service', () => {
  const manifest = createManifest({ provides: [] });
  assert.equal(isServiceProvided('acme.bar.service', manifest), false);
});

test('isServiceProvided returns false when provides is missing', () => {
  assert.equal(isServiceProvided('acme.foo.service', { name: 'acme.test' }), false);
});

// --- isSensitive ---

test('isSensitive returns true for "password"', () => {
  assert.equal(isSensitive('user password is wrong'), true);
});

test('isSensitive returns true for "token"', () => {
  assert.equal(isSensitive('auth token expired'), true);
});

test('isSensitive returns true for "secret"', () => {
  assert.equal(isSensitive('client secret missing'), true);
});

test('isSensitive returns true for "apikey"', () => {
  assert.equal(isSensitive('the apikey was rejected'), true);
});

test('isSensitive returns true for "api_key"', () => {
  assert.equal(isSensitive('api_key is invalid'), true);
});

test('isSensitive returns false for a clean string', () => {
  assert.equal(isSensitive('plugin started successfully'), false);
});

test('isSensitive returns false for a non-string value', () => {
  assert.equal(isSensitive(42), false);
  assert.equal(isSensitive(null), false);
  assert.equal(isSensitive({}), false);
});

// --- hasNoSensitiveData ---

test('hasNoSensitiveData returns true for a clean object', () => {
  assert.equal(hasNoSensitiveData({ message: 'plugin started', code: 'OK' }), true);
});

test('hasNoSensitiveData returns false when a string value contains "password"', () => {
  assert.equal(hasNoSensitiveData({ message: 'user password is wrong' }), false);
});

test('hasNoSensitiveData returns false when a nested object contains a token', () => {
  assert.equal(hasNoSensitiveData({ detail: { token: 'abc123' } }), false);
});

test('hasNoSensitiveData returns false when an array contains sensitive data', () => {
  assert.equal(hasNoSensitiveData(['clean', 'secret value']), false);
});

test('hasNoSensitiveData returns true for null and undefined', () => {
  assert.equal(hasNoSensitiveData(null), true);
  assert.equal(hasNoSensitiveData(undefined), true);
});

test('hasNoSensitiveData returns true for numbers and booleans', () => {
  assert.equal(hasNoSensitiveData(42), true);
  assert.equal(hasNoSensitiveData(true), true);
});

// --- createScopedEventBus ---

test('createScopedEventBus publish injects source from manifest name', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({
    name: 'acme.real',
    events: [{ name: 'test:event', description: '', data: [] }],
  });
  const scoped = createScopedEventBus(bus, manifest);

  let received = null;
  bus.subscribe('test:event', (event) => { received = event; }, 'acme.listener');

  scoped.publish('test:event', { id: '123' });

  assert.ok(received !== null);
  assert.equal(received.source, 'acme.real');
  assert.deepEqual(received.data, { id: '123' });
});

test('createScopedEventBus publish rejects undeclared events', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ name: 'acme.test', events: [] });
  const scoped = createScopedEventBus(bus, manifest);

  const result = scoped.publish('test:undeclared', {});

  assert.equal(result.success, false);
  assert.equal(result.error, 'EVENT_NOT_DECLARED_IN_MANIFEST');
});

test('createScopedEventBus subscribe delegates to the Event Bus', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({
    name: 'acme.test',
    events: [{ name: 'test:event', description: '', data: [] }],
  });
  const scoped = createScopedEventBus(bus, manifest);

  let received = false;
  scoped.subscribe('test:event', () => { received = true; });

  bus.publish({ type: 'test:event', data: {} }, 'acme.test', manifest);

  assert.equal(received, true);
});

test('createScopedEventBus subscribe returns an unsubscribe function', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ name: 'acme.test', events: [] });
  const scoped = createScopedEventBus(bus, manifest);

  let received = false;
  const unsubscribe = scoped.subscribe('test:event', () => { received = true; });

  unsubscribe();
  bus.publish({ type: 'test:event', data: {} }, 'acme.other', createManifest({
    name: 'acme.other',
    events: [{ name: 'test:event', description: '', data: [] }],
  }));

  assert.equal(received, false);
});
