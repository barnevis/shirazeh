// Tests for EventBus — verifies publish enrichment, source forging prevention,
// event declaration check, subscriber delivery, listener error isolation, and wildcard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/event-bus.js';
import { createInternalLogger } from '../src/internal-logger.js';

function createManifest({ events = [], name = 'acme.test' } = {}) {
  return {
    name,
    version: '1.0.0',
    architecture: '0.5',
    description: 'test',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events,
    config: {},
  };
}

test('publish enriches the event with id, source, and timestamp', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:saved', description: '', data: [] }] });

  let received = null;
  bus.subscribe('test:saved', (event) => { received = event; }, 'acme.listener');

  bus.publish({ type: 'test:saved', data: { id: '123' } }, 'acme.test', manifest);

  assert.ok(received.id.startsWith('evt-'));
  assert.equal(received.type, 'test:saved');
  assert.equal(received.source, 'acme.test');
  assert.deepEqual(received.data, { id: '123' });
  assert.ok(typeof received.timestamp === 'string');
});

test('publish source comes from the manifest name, not runtime — cannot be forged', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ name: 'acme.real', events: [{ name: 'test:event', description: '', data: [] }] });

  let received = null;
  bus.subscribe('test:event', (event) => { received = event; }, 'acme.listener');

  // The publisher passes 'acme.fake' as sourcePluginName, but the manifest name is 'acme.real'.
  // The source must be 'acme.real' (from manifest.name), NOT 'acme.fake' (from runtime arg).
  bus.publish({ type: 'test:event', data: {} }, 'acme.fake', manifest);

  assert.equal(received.source, 'acme.real');
  assert.notEqual(received.source, 'acme.fake');
});

test('publish rejects an undeclared event with a security log', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [] });

  const result = bus.publish({ type: 'test:undeclared', data: {} }, 'acme.test', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'EVENT_NOT_DECLARED_IN_MANIFEST');

  const securityLogs = logger.getEntries().filter((e) => e.level === 'security');
  assert.equal(securityLogs.length, 1);
  assert.equal(securityLogs[0].message, 'UNAUTHORIZED_EVENT');
});

test('subscriber receives the published event', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:created', description: '', data: [] }] });

  let received = null;
  bus.subscribe('test:created', (event) => { received = event; }, 'acme.listener');

  bus.publish({ type: 'test:created', data: { itemId: 'abc' } }, 'acme.test', manifest);

  assert.ok(received !== null);
  assert.equal(received.type, 'test:created');
  assert.deepEqual(received.data, { itemId: 'abc' });
});

test('listener error does not affect the publisher or other listeners', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:boom', description: '', data: [] }] });

  let secondReceived = false;
  bus.subscribe('test:boom', () => { throw new Error('listener crashed'); }, 'acme.first');
  bus.subscribe('test:boom', () => { secondReceived = true; }, 'acme.second');

  const result = bus.publish({ type: 'test:boom', data: {} }, 'acme.test', manifest);

  assert.equal(result.success, true);
  assert.equal(secondReceived, true);

  const errorLogs = logger.getEntries().filter((e) => e.level === 'error');
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].message, 'LISTENER_ERROR');
});

test('wildcard subscriber receives all events', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({
    events: [
      { name: 'test:first', description: '', data: [] },
      { name: 'test:second', description: '', data: [] },
    ],
  });

  const received = [];
  bus.subscribe('*', (event) => { received.push(event.type); }, 'acme.wildcard');

  bus.publish({ type: 'test:first', data: {} }, 'acme.test', manifest);
  bus.publish({ type: 'test:second', data: {} }, 'acme.test', manifest);

  assert.deepEqual(received, ['test:first', 'test:second']);
});

test('subscribe requires no access declaration', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:any', description: '', data: [] }] });

  let received = false;
  // No manifest needed for subscribing — any plugin can listen to any event.
  bus.subscribe('test:any', () => { received = true; }, 'acme.anyone');

  bus.publish({ type: 'test:any', data: {} }, 'acme.test', manifest);

  assert.equal(received, true);
});

test('unsubscribe removes the subscription', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:gone', description: '', data: [] }] });

  let received = false;
  const unsubscribe = bus.subscribe('test:gone', () => { received = true; }, 'acme.listener');

  unsubscribe();
  bus.publish({ type: 'test:gone', data: {} }, 'acme.test', manifest);

  assert.equal(received, false);
});

test('each published event gets a unique id', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:unique', description: '', data: [] }] });

  const ids = [];
  bus.subscribe('test:unique', (event) => { ids.push(event.id); }, 'acme.listener');

  bus.publish({ type: 'test:unique', data: {} }, 'acme.test', manifest);
  bus.publish({ type: 'test:unique', data: {} }, 'acme.test', manifest);

  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test('multiple subscribers all receive the same event', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:multi', description: '', data: [] }] });

  let firstReceived = false;
  let secondReceived = false;
  bus.subscribe('test:multi', () => { firstReceived = true; }, 'acme.first');
  bus.subscribe('test:multi', () => { secondReceived = true; }, 'acme.second');

  bus.publish({ type: 'test:multi', data: {} }, 'acme.test', manifest);

  assert.equal(firstReceived, true);
  assert.equal(secondReceived, true);
});

test('publishing an event with no subscribers succeeds silently', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [{ name: 'test:nobody', description: '', data: [] }] });

  const result = bus.publish({ type: 'test:nobody', data: {} }, 'acme.test', manifest);

  assert.equal(result.success, true);
});

test('publish returns INVALID_EVENT when pluginEvent is null', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [] });

  const result = bus.publish(null, 'acme.test', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_EVENT');
});

test('publish returns INVALID_EVENT when pluginEvent is a string', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [] });

  const result = bus.publish('not-an-object', 'acme.test', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_EVENT');
});

test('publish returns INVALID_EVENT_TYPE when type is missing', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [] });

  const result = bus.publish({ data: {} }, 'acme.test', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_EVENT_TYPE');
});

test('publish returns INVALID_EVENT_TYPE when type is an empty string', () => {
  const logger = createInternalLogger();
  const bus = createEventBus(logger);
  const manifest = createManifest({ events: [] });

  const result = bus.publish({ type: '', data: {} }, 'acme.test', manifest);

  assert.equal(result.success, false);
  assert.equal(result.error, 'INVALID_EVENT_TYPE');
});
