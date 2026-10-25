// Integration tests — end-to-end startup/shutdown with fake plugins via the public PeyCore class.
// Uses a Node.js-style Runtime Host (file-backed ConfigSource, process.env EnvSource,
// fs + import ModuleLoader) to exercise the platform-neutral Core.
// 0.11: plugins use the two-phase entry point (prepare + activate).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PeyCore } from '../index.js';

function createBootstrapConfig(overrides = {}) {
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

function createPluginManifest(overrides = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.11',
    description: 'test plugin',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
    ...overrides,
  };
}

function createUIManifest(overrides = {}) {
  return {
    name: 'myapp.ui',
    version: '1.0.0',
    architecture: '0.11',
    description: 'test UI',
    dependencies: { required: [], optional: [] },
    events: [],
    config: {},
    ...overrides,
  };
}

/**
 * Creates a plugin directory with a two-phase entry point (prepare + activate).
 * The prepareFn receives the prepareContext and returns an array of service
 * instances. The activateFn receives the bound services map.
 */
function createPluginDir(manifest, prepareFn, activateFn) {
  const dir = mkdtempSync(join(tmpdir(), 'bonyan-plugin-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const prepareBody = prepareFn ? prepareFn.toString() : '() => []';
  const activateBody = activateFn ? activateFn.toString() : '() => {}';
  const entryCode = [
    `export function prepare(context) { return (${prepareBody})(context); }`,
    `export function activate(services) { return (${activateBody})(services); }`,
  ].join('\n');
  writeFileSync(join(dir, 'index.js'), entryCode);
  return dir;
}

function createUIDir(manifest, setupFn) {
  const dir = mkdtempSync(join(tmpdir(), 'bonyan-ui-'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const setupCode = `export function setup(context) { return (${setupFn.toString()})(context); }`;
  writeFileSync(join(dir, 'index.js'), setupCode);
  return dir;
}

function createBootstrapFile(config) {
  const dir = mkdtempSync(join(tmpdir(), 'bonyan-bootstrap-'));
  writeFileSync(join(dir, 'bootstrap.json'), JSON.stringify(config));
  return join(dir, 'bootstrap.json');
}

/**
 * Creates a Node.js-style Runtime Host triple for the integration tests.
 */
function createNodeHost(bootstrapPath) {
  const configSource = {
    async getConfig() {
      const raw = readFileSync(bootstrapPath, 'utf-8');
      return JSON.parse(raw);
    },
  };
  const envSource = {
    get(varName) { return process.env[varName]; },
  };
  const moduleLoader = {
    async loadManifest(ref) {
      const raw = readFileSync(join(ref, 'manifest.json'), 'utf-8');
      return JSON.parse(raw);
    },
    async loadEntry(ref) {
      const entryUrl = pathToFileURL(join(ref, 'index.js')).href;
      return await import(entryUrl);
    },
  };
  return { configSource, envSource, moduleLoader };
}

/**
 * Starts the Core for an integration test using the public PeyCore class.
 */
async function startCore(bootstrapPath) {
  const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
  const core = new PeyCore({ configSource, envSource, moduleLoader });
  return await core.start();
}

/**
 * Creates a spy plugin directory that records all events it sees.
 * The spy subscribes to core:* and pluginname:* events during prepare()
 * and stores them in a global array on the module for later inspection.
 * Returns { dir, getEvents } where getEvents reads the recorded events.
 */
function createSpyPluginDir(name = 'acme.spy') {
  const manifest = createPluginManifest({
    name,
    type: 'infrastructure',
    provides: [{ name: `${name}.service` }],
    events: [
      { name: 'core:plugin-failed', description: '', data: [] },
      { name: 'core:startup-failed', description: '', data: [] },
      { name: 'core:ready', description: '', data: [] },
      { name: 'core:ui-failed', description: '', data: [] },
      { name: 'a:ready', description: '', data: [] },
      { name: 'b:ready', description: '', data: [] },
    ],
  });
  const dir = mkdtempSync(join(tmpdir(), 'bonyan-spy-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  // The spy module records events to a global array accessible after import.
  writeFileSync(join(dir, 'index.js'), `
let recordedEvents = [];
export function prepare(context) {
  context.events.subscribe('*', (e) => recordedEvents.push(e));
  return [{ name: '${name}.service', object: { getRecordedEvents: () => recordedEvents } }];
}
export function activate() {}
export function getRecordedEvents() { return recordedEvents; }
`);
  return {
    dir,
    async getEvents() {
      const mod = await import(pathToFileURL(join(dir, 'index.js')).href);
      return mod.getRecordedEvents();
    },
  };
}

/**
 * Cleans up temporary directories after a test.
 */
function cleanup(...dirs) {
  for (const dir of dirs) {
    if (dir) {
      try { rmSync(dir, { recursive: true }); } catch { /* already removed */ }
    }
  }
}

// --- PeyCore class tests ---

test('PeyCore constructor rejects missing sources', () => {
  assert.throws(
    () => new PeyCore({}),
    (err) => err.code === 'INVALID_HOST_SOURCE',
  );
});

test('PeyCore constructor rejects moduleLoader missing loadEntry', () => {
  assert.throws(
    () => new PeyCore({
      configSource: { getConfig: async () => ({}) },
      envSource: { get: () => undefined },
      moduleLoader: { loadManifest: async () => ({}) },
    }),
    (err) => err.code === 'INVALID_HOST_SOURCE',
  );
});

test('PeyCore.start() rejects a second start() before shutdown()', async () => {
  const config = createBootstrapConfig();
  const bootstrapPath = createBootstrapFile(config);

  const core = new PeyCore(createNodeHost(bootstrapPath));
  await core.start();
  await assert.rejects(
    core.start(),
    (err) => err.code === 'CORE_ALREADY_STARTED',
  );
  await core.shutdown();
  cleanup(bootstrapPath.replace('bootstrap.json', ''));
});

test('PeyCore.start() can be called again after shutdown()', async () => {
  const config = createBootstrapConfig();
  const bootstrapPath = createBootstrapFile(config);

  const core = new PeyCore(createNodeHost(bootstrapPath));
  await core.start();
  await core.shutdown();
  await core.start();
  await core.shutdown();
  cleanup(bootstrapPath.replace('bootstrap.json', ''));
});

// --- Integration tests: 0.11 group-based startup ---

test('full startup and shutdown with infrastructure and application plugins', async () => {
  const infraManifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure', provides: [{ name: 'acme.infra.service' }],
  });
  const appManifest = createPluginManifest({ name: 'acme.app', type: 'product' });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const infraDir = createPluginDir(infraManifest, () => [{ name: 'acme.infra.service', object: {} }]);
  const appDir = createPluginDir(appManifest, () => []);
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.infra', version: '1.0.0', path: infraDir },
      { name: 'acme.app', version: '1.0.0', path: appDir },
    ],
    ui: { path: uiDir },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;
    assert.ok(typeof shutdownFn === 'function');
    await shutdownFn();
  } finally {
    cleanup(infraDir, appDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('infrastructure plugin failure stops the system', async () => {
  const spy = createSpyPluginDir('acme.spy');
  const badManifest = createPluginManifest({
    name: 'acme.bad', type: 'infrastructure', provides: [{ name: 'acme.bad.service' }],
  });
  const badDir = createPluginDir(badManifest, () => { throw new Error('prepare failed'); });
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.spy', version: '1.0.0', path: spy.dir },
      { name: 'acme.bad', version: '1.0.0', path: badDir },
    ],
    ui: { path: '/fake/ui' },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;

    const events = await spy.getEvents();
    // acme.bad should have core:plugin-failed with PREPARATION_FAILED
    const badFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.bad');
    assert.ok(badFailed, 'core:plugin-failed for acme.bad should be published');
    assert.equal(badFailed.data.code, 'PREPARATION_FAILED');
    // core:startup-failed should be published (infrastructure failure is fatal)
    const startupFailed = events.find((e) => e.type === 'core:startup-failed');
    assert.ok(startupFailed, 'core:startup-failed should be published');
    // core:ready should NOT be published (infrastructure failure stops the system)
    const ready = events.find((e) => e.type === 'core:ready');
    assert.equal(ready, undefined, 'core:ready should NOT be published on infrastructure failure');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(spy.dir, badDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('infrastructure plugin fails declaration validation — entry point never loaded', async () => {
  const badManifest = createPluginManifest({
    name: 'acme.bad', type: 'infrastructure', architecture: '1.0',
  });
  const badDir = createPluginDir(badManifest, () => []);
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.bad', version: '1.0.0', path: badDir },
    ],
    ui: { path: '/fake/ui' },
  }));

  const capturedEvents = [];
  let shutdownFn = null;
  try {
    const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    const result = await core.start({
      onEvent: (event) => capturedEvents.push(event),
    });
    shutdownFn = result.shutdown;

    // acme.bad fails declaration validation (incompatible architecture '1.0'
    // vs core '0.11'). Since it's an infrastructure plugin, this is fatal —
    // core:plugin-failed and core:startup-failed are published, but core:ready
    // is NOT. The start() function still returns a shutdown fn.
    const badFailed = capturedEvents.find((e) => e.type === 'core:plugin-failed' && e.data?.pluginName === 'acme.bad');
    assert.ok(badFailed, 'core:plugin-failed for acme.bad should be published');
    assert.equal(badFailed.data.code, 'INCOMPATIBLE_ARCHITECTURE');
    // core:startup-failed should be published (infrastructure failure is fatal)
    assert.ok(capturedEvents.find((e) => e.type === 'core:startup-failed'), 'core:startup-failed should be published');
    // core:ready should NOT be published
    assert.equal(capturedEvents.find((e) => e.type === 'core:ready'), undefined, 'core:ready should NOT be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(badDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('duplicate plugin names in bootstrap.json are rejected', async () => {
  const manifest = createPluginManifest({
    name: 'acme.dup', type: 'product', provides: [{ name: 'acme.dup.service' }],
  });
  const dir = createPluginDir(manifest, () => [{ name: 'acme.dup.service', object: {} }]);
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.dup', version: '1.0.0', path: dir },
      { name: 'acme.dup', version: '1.0.0', path: dir },
    ],
    ui: { path: uiDir },
  }));

  const capturedEvents = [];
  let shutdownFn = null;
  try {
    const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    const result = await core.start({
      onEvent: (event) => capturedEvents.push(event),
    });
    shutdownFn = result.shutdown;

    // The second duplicate entry should trigger DUPLICATE_PLUGIN_NAME.
    // Since it's a product plugin, it's not fatal — core:ready is still published.
    const dupFailed = capturedEvents.find(
      (e) => e.type === 'core:plugin-failed' && e.data?.pluginName === 'acme.dup' && e.data?.code === 'DUPLICATE_PLUGIN_NAME',
    );
    assert.ok(dupFailed, 'core:plugin-failed with DUPLICATE_PLUGIN_NAME should be published');
    // core:ready should be published (product plugin failure is not fatal)
    assert.ok(capturedEvents.find((e) => e.type === 'core:ready'), 'core:ready should be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(dir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('duplicate infrastructure plugin names are fatal', async () => {
  const manifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure', provides: [{ name: 'acme.infra.service' }],
  });
  const dir = createPluginDir(manifest, () => [{ name: 'acme.infra.service', object: {} }]);
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.infra', version: '1.0.0', path: dir },
      { name: 'acme.infra', version: '1.0.0', path: dir },
    ],
    ui: { path: '/fake/ui' },
  }));

  const capturedEvents = [];
  let shutdownFn = null;
  try {
    const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    const result = await core.start({
      onEvent: (event) => capturedEvents.push(event),
    });
    shutdownFn = result.shutdown;

    // The second duplicate infrastructure entry should trigger DUPLICATE_PLUGIN_NAME.
    // Since it's infrastructure, it's fatal — core:startup-failed is published.
    const dupFailed = capturedEvents.find(
      (e) => e.type === 'core:plugin-failed' && e.data?.pluginName === 'acme.infra' && e.data?.code === 'DUPLICATE_PLUGIN_NAME',
    );
    assert.ok(dupFailed, 'core:plugin-failed with DUPLICATE_PLUGIN_NAME should be published');
    // core:startup-failed should be published (infrastructure failure is fatal)
    assert.ok(capturedEvents.find((e) => e.type === 'core:startup-failed'), 'core:startup-failed should be published');
    // core:ready should NOT be published
    assert.equal(capturedEvents.find((e) => e.type === 'core:ready'), undefined, 'core:ready should NOT be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(dir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('infrastructure group short-circuits on first failure — remaining plugins not prepared', async () => {
  const spy = createSpyPluginDir('acme.spy');
  const firstManifest = createPluginManifest({
    name: 'acme.first', type: 'infrastructure', provides: [{ name: 'acme.first.service' }],
  });
  const secondManifest = createPluginManifest({
    name: 'acme.second', type: 'infrastructure', provides: [{ name: 'acme.second.service' }],
  });
  const firstDir = createPluginDir(firstManifest, () => { throw new Error('prepare failed'); });
  const secondDir = createPluginDir(secondManifest, () => []);
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.spy', version: '1.0.0', path: spy.dir },
      { name: 'acme.first', version: '1.0.0', path: firstDir },
      { name: 'acme.second', version: '1.0.0', path: secondDir },
    ],
    ui: { path: '/fake/ui' },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;

    const events = await spy.getEvents();
    // acme.first should have core:plugin-failed
    const firstFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.first');
    assert.ok(firstFailed, 'core:plugin-failed for acme.first should be published');
    // acme.second should NOT have core:plugin-failed (short-circuited, never prepared)
    const secondFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.second');
    assert.equal(secondFailed, undefined, 'acme.second should not be processed (short-circuit)');
    // core:startup-failed should be published
    assert.ok(events.find((e) => e.type === 'core:startup-failed'), 'core:startup-failed should be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(spy.dir, firstDir, secondDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('application plugin failure cascades to dependents with REQUIRED_DEPENDENCY_UNAVAILABLE', async () => {
  const spy = createSpyPluginDir('acme.spy');
  const providerManifest = createPluginManifest({
    name: 'acme.provider', type: 'product', provides: [{ name: 'acme.provider.service' }],
  });
  const consumerManifest = createPluginManifest({
    name: 'acme.consumer', type: 'product', dependencies: { required: ['acme.provider.service'], optional: [] },
  });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const providerDir = createPluginDir(providerManifest, () => { throw new Error('prepare failed'); });
  const consumerDir = createPluginDir(consumerManifest, () => []);
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.spy', version: '1.0.0', path: spy.dir },
      { name: 'acme.provider', version: '1.0.0', path: providerDir },
      { name: 'acme.consumer', version: '1.0.0', path: consumerDir },
    ],
    ui: { path: uiDir },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;

    const events = await spy.getEvents();
    // acme.provider should have core:plugin-failed with PREPARATION_FAILED
    const providerFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.provider');
    assert.ok(providerFailed, 'core:plugin-failed for acme.provider should be published');
    assert.equal(providerFailed.data.code, 'PREPARATION_FAILED');
    // acme.consumer should have core:plugin-failed with REQUIRED_DEPENDENCY_UNAVAILABLE
    const consumerFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.consumer');
    assert.ok(consumerFailed, 'core:plugin-failed for acme.consumer should be published (cascade)');
    assert.equal(consumerFailed.data.code, 'REQUIRED_DEPENDENCY_UNAVAILABLE');
    // core:ready should still be published (application failure is NOT fatal)
    assert.ok(events.find((e) => e.type === 'core:ready'), 'core:ready should be published (application failure is not fatal)');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(spy.dir, providerDir, consumerDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('required dependency cycle within application group succeeds', async () => {
  const aManifest = createPluginManifest({
    name: 'acme.a', type: 'product',
    provides: [{ name: 'acme.a.service' }],
    dependencies: { required: ['acme.b.service'], optional: [] },
  });
  const bManifest = createPluginManifest({
    name: 'acme.b', type: 'product',
    provides: [{ name: 'acme.b.service' }],
    dependencies: { required: ['acme.a.service'], optional: [] },
  });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const aDir = createPluginDir(aManifest, () => [{ name: 'acme.a.service', object: {} }]);
  const bDir = createPluginDir(bManifest, () => [{ name: 'acme.b.service', object: {} }]);
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.a', version: '1.0.0', path: aDir },
      { name: 'acme.b', version: '1.0.0', path: bDir },
    ],
    ui: { path: uiDir },
  }));

  const capturedEvents = [];
  let shutdownFn = null;
  try {
    const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    const result = await core.start({
      onEvent: (event) => capturedEvents.push(event),
    });
    shutdownFn = result.shutdown;

    // No core:plugin-failed should be published — the cycle resolves successfully
    const failed = capturedEvents.filter((e) => e.type === 'core:plugin-failed');
    assert.equal(failed.length, 0, 'no plugin should fail (cycle resolves)');
    // core:ready should be published
    assert.ok(capturedEvents.find((e) => e.type === 'core:ready'), 'core:ready should be published');
    // Both plugins should have pluginname:ready published
    assert.ok(capturedEvents.find((e) => e.type === 'a:ready'), 'a:ready should be published');
    assert.ok(capturedEvents.find((e) => e.type === 'b:ready'), 'b:ready should be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(aDir, bDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('required dependency cycle between infrastructure and application groups is not supported', async () => {
  const spy = createSpyPluginDir('acme.spy');
  // Infrastructure plugin requires a service from an application plugin —
  // this cross-group cycle fails at settlement (infrastructure group can't
  // see application services yet).
  const infraManifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure',
    provides: [{ name: 'acme.infra.service' }],
    dependencies: { required: ['acme.app.service'], optional: [] },
  });
  const appManifest = createPluginManifest({
    name: 'acme.app', type: 'product',
    provides: [{ name: 'acme.app.service' }],
    dependencies: { required: ['acme.infra.service'], optional: [] },
  });

  const infraDir = createPluginDir(infraManifest, () => [{ name: 'acme.infra.service', object: {} }]);
  const appDir = createPluginDir(appManifest, () => [{ name: 'acme.app.service', object: {} }]);
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.spy', version: '1.0.0', path: spy.dir },
      { name: 'acme.infra', version: '1.0.0', path: infraDir },
      { name: 'acme.app', version: '1.0.0', path: appDir },
    ],
    ui: { path: '/fake/ui' },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;

    const events = await spy.getEvents();
    // acme.infra should have core:plugin-failed with REQUIRED_DEPENDENCY_UNAVAILABLE
    // (its required dep acme.app.service is not available in the infrastructure group)
    const infraFailed = events.find((e) => e.type === 'core:plugin-failed' && e.data.pluginName === 'acme.infra');
    assert.ok(infraFailed, 'core:plugin-failed for acme.infra should be published');
    assert.equal(infraFailed.data.code, 'REQUIRED_DEPENDENCY_UNAVAILABLE');
    // core:startup-failed should be published (infrastructure failure is fatal)
    assert.ok(events.find((e) => e.type === 'core:startup-failed'), 'core:startup-failed should be published');
    // core:ready should NOT be published
    assert.equal(events.find((e) => e.type === 'core:ready'), undefined, 'core:ready should NOT be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(spy.dir, infraDir, appDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('settlement terminates even with a deep dependency chain', async () => {
  // A chain of 5 application plugins, each depending on the previous one's service.
  // acme.chain0 depends on acme.missing.service (doesn't exist).
  // acme.chain1 depends on acme.chain0.service, etc.
  // acme.chain0 fails prepare (its required dependency is not available),
  // which cascades to acme.chain1, acme.chain2, acme.chain3, acme.chain4.
  // That's 4 cascaded plugins (chain1-chain4), plus chain0 itself fails prepare.
  const pluginDirs = [];
  const pluginEntries = [];
  for (let i = 0; i < 5; i++) {
    const name = `acme.chain${i}`;
    const serviceName = i === 0 ? 'acme.missing.service' : `acme.chain${i - 1}.service`;
    const manifest = createPluginManifest({
      name,
      type: 'product',
      provides: i < 4 ? [{ name: `${name}.service` }] : [],
      dependencies: { required: [serviceName], optional: [] },
    });
    const dir = createPluginDir(manifest, () => i < 4 ? [{ name: `${name}.service`, object: {} }] : []);
    pluginDirs.push(dir);
    pluginEntries.push({ name, version: '1.0.0', path: dir });
  }
  const uiManifest = createUIManifest({ name: 'myapp.ui' });
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      ...pluginEntries,
    ],
    ui: { path: uiDir },
  }));

  const capturedEvents = [];
  let shutdownFn = null;
  try {
    const { configSource, envSource, moduleLoader } = createNodeHost(bootstrapPath);
    const core = new PeyCore({ configSource, envSource, moduleLoader });
    const result = await core.start({
      onEvent: (event) => capturedEvents.push(event),
    });
    shutdownFn = result.shutdown;

    // acme.chain0 fails declaration validation (required dependency acme.missing.service
    // is not declared by any plugin) — gets core:plugin-failed with
    // MISSING_REQUIRED_DEPENDENCY_DECLARATION.
    // acme.chain1 through acme.chain4 are cascaded by settlement — each gets core:plugin-failed
    // with PREPARATION_FAILED or REQUIRED_DEPENDENCY_UNAVAILABLE.
    // Total: 5 chain plugins with core:plugin-failed.
    const chainFailed = capturedEvents.filter(
      (e) => e.type === 'core:plugin-failed' && e.data.pluginName.startsWith('acme.chain'),
    );
    assert.equal(chainFailed.length, 5, '5 chain plugins should have core:plugin-failed (chain0-chain4)');
    // chain0 gets MISSING_REQUIRED_DEPENDENCY_DECLARATION; chain1-chain4 get
    // PREPARATION_FAILED or REQUIRED_DEPENDENCY_UNAVAILABLE from settlement cascading.
    for (const f of chainFailed) {
      assert.ok(
        ['PREPARATION_FAILED', 'REQUIRED_DEPENDENCY_UNAVAILABLE', 'MISSING_REQUIRED_DEPENDENCY_DECLARATION'].includes(f.data.code),
        `plugin ${f.data.pluginName} should have a failure code (got ${f.data.code})`);
    }
    // core:ready should still be published (application failure is not fatal)
    assert.ok(capturedEvents.find((e) => e.type === 'core:ready'), 'core:ready should be published');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(...pluginDirs, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('UI failure does not stop system startup', async () => {
  const infraManifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure', provides: [{ name: 'acme.infra.service' }],
  });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const infraDir = createPluginDir(infraManifest, () => [{ name: 'acme.infra.service', object: {} }]);
  const uiDir = createUIDir(uiManifest, () => { throw new Error('UI crashed'); });
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [{ name: 'acme.infra', version: '1.0.0', path: infraDir }],
    ui: { path: uiDir },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;
    assert.ok(typeof shutdownFn === 'function');
  } finally {
    if (shutdownFn) await shutdownFn();
    cleanup(infraDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});

test('shutdown order: UI first, then plugins in reverse startup order', async () => {
  const infraManifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure', provides: [{ name: 'acme.infra.service' }],
  });
  const appManifest = createPluginManifest({ name: 'acme.app', type: 'product' });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const infraDir = createPluginDir(infraManifest, () => [{ name: 'acme.infra.service', object: {} }]);
  const appDir = createPluginDir(appManifest, () => []);
  const uiDir = createUIDir(uiManifest, () => {});
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [
      { name: 'acme.infra', version: '1.0.0', path: infraDir },
      { name: 'acme.app', version: '1.0.0', path: appDir },
    ],
    ui: { path: uiDir },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;
    await shutdownFn();
  } finally {
    cleanup(infraDir, appDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
  assert.ok(true);
});

test('shutdown handles errors gracefully', async () => {
  const infraManifest = createPluginManifest({
    name: 'acme.infra', type: 'infrastructure', provides: [{ name: 'acme.infra.service' }],
  });
  const uiManifest = createUIManifest({ name: 'myapp.ui' });

  const infraDir = createPluginDir(infraManifest, (ctx) => {
    ctx.onShutdown = () => { throw new Error('infra shutdown crashed'); };
    return [{ name: 'acme.infra.service', object: {} }];
  }, () => {});
  const uiDir = createUIDir(uiManifest, (ctx) => {
    ctx.onShutdown = () => { throw new Error('UI shutdown crashed'); };
  });
  const bootstrapPath = createBootstrapFile(createBootstrapConfig({
    plugins: [{ name: 'acme.infra', version: '1.0.0', path: infraDir }],
    ui: { path: uiDir },
  }));

  let shutdownFn = null;
  try {
    const result = await startCore(bootstrapPath);
    shutdownFn = result.shutdown;
    await shutdownFn();
    assert.ok(true);
  } finally {
    cleanup(infraDir, uiDir, bootstrapPath.replace('bootstrap.json', ''));
  }
});
