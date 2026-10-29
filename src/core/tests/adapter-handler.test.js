// Tests for AdapterHandler — verifies adapter injection based on adapterType.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectAdapterConfig, hasAdapterType, getAdapterType } from '../src/adapter-handler.js';

function createManifest(overrides = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.11',
    description: 'test',
    type: 'infrastructure',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
    ...overrides,
  };
}

function createConfig(adapters = {}) {
  return {
    architecture: '0.11',
    core: { name: 'pey.core', version: '0.2.0' },
    adapters,
    ui: { path: './ui' },
    plugins: [],
    config: {},
    app: { name: 'Test', version: '1.0.0' },
  };
}

// --- injectAdapterConfig ---

test('injectAdapterConfig injects the adapter name when adapterType is declared', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = { timeout: 5000 };

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal(result.finalConfig.adapter, 'IndexedDBAdapter');
  assert.equal(result.finalConfig.timeout, 5000);
});

test('injectAdapterConfig does nothing when adapterType is not declared', () => {
  const manifest = createManifest({});
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = { timeout: 5000 };

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal('adapter' in result.finalConfig, false);
  assert.equal(result.finalConfig.timeout, 5000);
});

test('injectAdapterConfig does nothing when adapterType is null', () => {
  const manifest = createManifest({ adapterType: null });
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal('adapter' in result.finalConfig, false);
});

test('injectAdapterConfig does not inject when adapter type is not in config', () => {
  const manifest = createManifest({ adapterType: 'auth' });
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal('adapter' in result.finalConfig, false);
});

test('injectAdapterConfig handles missing adapters section in config', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = { architecture: '0.11' };
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal('adapter' in result.finalConfig, false);
});

test('injectAdapterConfig injects for auth adapter type', () => {
  const manifest = createManifest({ adapterType: 'auth' });
  const config = createConfig({ auth: 'OAuthAdapter' });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal(result.finalConfig.adapter, 'OAuthAdapter');
});

test('injectAdapterConfig returns the same finalConfig object (mutated in place)', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.finalConfig, finalConfig);
});

// --- hasAdapterType ---

test('hasAdapterType returns true when adapterType is declared', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  assert.equal(hasAdapterType(manifest), true);
});

test('hasAdapterType returns false when adapterType is not declared', () => {
  const manifest = createManifest({});
  assert.equal(hasAdapterType(manifest), false);
});

test('hasAdapterType returns false when adapterType is null', () => {
  const manifest = createManifest({ adapterType: null });
  assert.equal(hasAdapterType(manifest), false);
});

// --- getAdapterType ---

test('getAdapterType returns the adapter type when declared', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  assert.equal(getAdapterType(manifest), 'storage');
});

test('getAdapterType returns null when not declared', () => {
  const manifest = createManifest({});
  assert.equal(getAdapterType(manifest), null);
});

test('getAdapterType returns null when adapterType is null', () => {
  const manifest = createManifest({ adapterType: null });
  assert.equal(getAdapterType(manifest), null);
});

// --- 0.11 verification: Core never instantiates adapter code ---

test('injectAdapterConfig injects only a string identifier, never an adapter object', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: 'IndexedDBAdapter' });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  // The injected value must be a string (the implementation identifier),
  // not an object — the Core never loads or instantiates adapter code.
  assert.equal(typeof result.finalConfig.adapter, 'string');
  assert.equal(result.finalConfig.adapter, 'IndexedDBAdapter');
});

test('injectAdapterConfig does not mutate the adapters section of config', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: 'IndexedDBAdapter', auth: 'OAuthAdapter' });
  const finalConfig = {};

  injectAdapterConfig(manifest, config, finalConfig);

  // The config's adapters section must remain unchanged — the Core only reads it.
  assert.deepEqual(config.adapters, { storage: 'IndexedDBAdapter', auth: 'OAuthAdapter' });
});

// --- 0.11: adapter selection with related configuration ---

test('injectAdapterConfig injects implementation and adapterConfig from an object selection', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({
    storage: { implementation: 'IndexedDBAdapter', dbName: 'my-app-db', version: 1 },
  });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal(result.finalConfig.adapter, 'IndexedDBAdapter');
  assert.deepEqual(result.finalConfig.adapterConfig, { dbName: 'my-app-db', version: 1 });
});

test('injectAdapterConfig injects only adapter when object selection has no extra config', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({
    storage: { implementation: 'IndexedDBAdapter' },
  });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, true);
  assert.equal(result.finalConfig.adapter, 'IndexedDBAdapter');
  assert.equal('adapterConfig' in result.finalConfig, false);
});

test('injectAdapterConfig does not mutate the object adapter selection in config', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const selection = { implementation: 'IndexedDBAdapter', dbName: 'my-app-db' };
  const config = createConfig({ storage: selection });
  const finalConfig = {};

  injectAdapterConfig(manifest, config, finalConfig);

  // The original selection object must remain unchanged — the Core only reads it.
  assert.deepEqual(config.adapters.storage, { implementation: 'IndexedDBAdapter', dbName: 'my-app-db' });
});

// --- 0.11: invalid adapter selection ---

test('injectAdapterConfig returns ADAPTER_SELECTION_INVALID for an object without implementation', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({
    storage: { dbName: 'my-app-db' },
  });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, false);
  assert.ok(result.error.startsWith('ADAPTER_SELECTION_INVALID'));
});

test('injectAdapterConfig returns ADAPTER_SELECTION_INVALID for a number selection', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: 42 });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, false);
  assert.ok(result.error.startsWith('ADAPTER_SELECTION_INVALID'));
});

test('injectAdapterConfig returns ADAPTER_SELECTION_INVALID for an array selection', () => {
  const manifest = createManifest({ adapterType: 'storage' });
  const config = createConfig({ storage: ['IndexedDBAdapter'] });
  const finalConfig = {};

  const result = injectAdapterConfig(manifest, config, finalConfig);

  assert.equal(result.success, false);
  assert.ok(result.error.startsWith('ADAPTER_SELECTION_INVALID'));
});
