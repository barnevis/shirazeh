// Tests for InternalState — verifies plugin records, status, and startup order.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInternalState, PLUGIN_STATUS } from '../src/internal-state.js';

function createFakeManifest(name) {
  return {
    name,
    version: '1.0.0',
    architecture: '0.5',
    description: 'fake plugin',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
  };
}

test('registerPlugin stores a record with INACTIVE status', () => {
  const state = createInternalState();
  const record = state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  assert.equal(record.name, 'acme.foo');
  assert.equal(record.status, PLUGIN_STATUS.INACTIVE);
  assert.equal(record.startupIndex, 0);
  assert.deepEqual(record.providedServices, []);
});

test('getPlugin returns the stored record', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  const record = state.getPlugin('acme.foo');
  assert.equal(record.name, 'acme.foo');
});

test('getPlugin returns undefined for an unregistered plugin', () => {
  const state = createInternalState();
  assert.equal(state.getPlugin('acme.missing'), undefined);
});

test('hasPlugin returns true for registered and false for unregistered', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  assert.equal(state.hasPlugin('acme.foo'), true);
  assert.equal(state.hasPlugin('acme.bar'), false);
});

test('setPluginStatus changes the status to ACTIVE', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  state.setPluginStatus('acme.foo', PLUGIN_STATUS.ACTIVE);
  assert.equal(state.getPlugin('acme.foo').status, PLUGIN_STATUS.ACTIVE);
});

test('setPluginStatus changes the status back to INACTIVE', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });
  state.setPluginStatus('acme.foo', PLUGIN_STATUS.ACTIVE);
  state.setPluginStatus('acme.foo', PLUGIN_STATUS.INACTIVE);

  assert.equal(state.getPlugin('acme.foo').status, PLUGIN_STATUS.INACTIVE);
});

test('setPluginStatus on an unregistered plugin does not throw', () => {
  const state = createInternalState();
  assert.doesNotThrow(() => {
    state.setPluginStatus('acme.missing', PLUGIN_STATUS.ACTIVE);
  });
});

test('addProvidedService appends to the provided services list', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  state.addProvidedService('acme.foo', 'acme.foo.service');
  assert.deepEqual(state.getPlugin('acme.foo').providedServices, ['acme.foo.service']);
});

test('clearProvidedServices empties the provided services list', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });
  state.addProvidedService('acme.foo', 'acme.foo.service');
  state.clearProvidedServices('acme.foo');

  assert.deepEqual(state.getPlugin('acme.foo').providedServices, []);
});

test('getStartupOrder returns plugin names in registration order', () => {
  const state = createInternalState();
  state.registerPlugin({ name: 'acme.first', version: '1.0.0', manifest: createFakeManifest('acme.first'), context: {} });
  state.registerPlugin({ name: 'acme.second', version: '1.0.0', manifest: createFakeManifest('acme.second'), context: {} });
  state.registerPlugin({ name: 'acme.third', version: '1.0.0', manifest: createFakeManifest('acme.third'), context: {} });

  assert.deepEqual(state.getStartupOrder(), ['acme.first', 'acme.second', 'acme.third']);
});

test('getStartupOrder returns a copy, not the internal array', () => {
  const state = createInternalState();
  state.registerPlugin({ name: 'acme.foo', version: '1.0.0', manifest: createFakeManifest('acme.foo'), context: {} });

  const first = state.getStartupOrder();
  const second = state.getStartupOrder();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
});

test('startupIndex reflects the position in startup order', () => {
  const state = createInternalState();
  const r1 = state.registerPlugin({ name: 'acme.first', version: '1.0.0', manifest: createFakeManifest('acme.first'), context: {} });
  const r2 = state.registerPlugin({ name: 'acme.second', version: '1.0.0', manifest: createFakeManifest('acme.second'), context: {} });

  assert.equal(r1.startupIndex, 0);
  assert.equal(r2.startupIndex, 1);
});

test('setUiContext and getUiContext store and return the UI context', () => {
  const state = createInternalState();
  assert.equal(state.getUiContext(), null);

  const uiContext = { services: {}, events: {}, config: {} };
  state.setUiContext(uiContext);
  assert.equal(state.getUiContext(), uiContext);
});

test('multiple state instances are independent', () => {
  const stateA = createInternalState();
  const stateB = createInternalState();

  stateA.registerPlugin({ name: 'acme.foo', version: '1.0.0', manifest: createFakeManifest('acme.foo'), context: {} });

  assert.equal(stateA.hasPlugin('acme.foo'), true);
  assert.equal(stateB.hasPlugin('acme.foo'), false);
});

// --- group, prepared, committed fields ---

test('registerPlugin stores the group field when provided', () => {
  const state = createInternalState();
  const record = state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
    group: 'infrastructure',
  });

  assert.equal(record.group, 'infrastructure');
});

test('registerPlugin defaults group to null when not provided', () => {
  const state = createInternalState();
  const record = state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  assert.equal(record.group, null);
});

test('registerPlugin initializes prepared and committed to false', () => {
  const state = createInternalState();
  const record = state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  assert.equal(record.prepared, false);
  assert.equal(record.committed, false);
});

test('markPrepared sets the prepared flag', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  state.markPrepared('acme.foo', true);
  assert.equal(state.getPlugin('acme.foo').prepared, true);

  state.markPrepared('acme.foo', false);
  assert.equal(state.getPlugin('acme.foo').prepared, false);
});

test('markCommitted sets the committed flag', () => {
  const state = createInternalState();
  state.registerPlugin({
    name: 'acme.foo',
    version: '1.0.0',
    manifest: createFakeManifest('acme.foo'),
    context: {},
  });

  state.markCommitted('acme.foo', true);
  assert.equal(state.getPlugin('acme.foo').committed, true);

  state.markCommitted('acme.foo', false);
  assert.equal(state.getPlugin('acme.foo').committed, false);
});

test('markPrepared and markCommitted do nothing for an unknown plugin', () => {
  const state = createInternalState();

  state.markPrepared('acme.unknown', true);
  state.markCommitted('acme.unknown', true);

  assert.equal(state.getPlugin('acme.unknown'), undefined);
});
