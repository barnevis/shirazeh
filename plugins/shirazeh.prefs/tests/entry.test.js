// Verifies the entry-point lifecycle wiring and the manifest contract.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { activate, prepare } from '../index.js';

const MANIFEST_PATH = new URL('../manifest.json', import.meta.url);
const PACKAGE_PATH = new URL('../package.json', import.meta.url);

function createPrepareContext() {
  const published = [];
  const listeners = {};
  return {
    config: {},
    events: {
      publish: (type, data) => published.push({ type, data }),
      subscribe: (type, listener) => {
        listeners[type] = listeners[type] ?? [];
        listeners[type].push(listener);
        return () => {};
      },
    },
    onShutdown: null,
    onDeactivated: null,
    reportCriticalError: (error) => published.push({ type: 'critical', data: error }),
    published,
    listeners,
  };
}

test('should_register_service_when_prepare_is_called', async () => {
  const context = createPrepareContext();

  const registrations = await prepare(context);

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].name, 'shirazeh.prefs.service');
  assert.equal(typeof registrations[0].object.get, 'function');
  assert.equal(typeof registrations[0].object.set, 'function');
});

test('should_assign_lifecycle_hooks_when_prepare_is_called', async () => {
  const context = createPrepareContext();

  await prepare(context);

  assert.equal(typeof context.onShutdown, 'function');
  assert.equal(typeof context.onDeactivated, 'function');
});

test('should_bind_storage_when_activate_is_called', async () => {
  const context = createPrepareContext();
  const registrations = await prepare(context);

  const storage = {
    read: async () => ({ key: 'theme', value: 'dark' }),
    write: async () => {},
  };
  await activate({ 'pey.storage.service': storage });

  const prefsService = registrations[0].object;
  assert.equal(await prefsService.get('theme'), 'dark');
  assert.equal(await prefsService.set('theme', 'light'), true);
});

test('should_report_critical_error_when_storage_dependency_is_lost', async () => {
  const context = createPrepareContext();
  await prepare(context);

  context.listeners['core:service-unavailable'][0]({
    type: 'core:service-unavailable',
    data: { serviceName: 'pey.storage.service' },
  });

  const criticalReport = context.published.find((entry) => entry.type === 'critical');
  assert.equal(criticalReport.data.code, 'REQUIRED_DEPENDENCY_LOST');
  assert.equal(criticalReport.data.source, 'shirazeh.prefs');
});

test('should_not_report_critical_error_when_unrelated_service_is_lost', async () => {
  const context = createPrepareContext();
  await prepare(context);

  context.listeners['core:service-unavailable'][0]({
    type: 'core:service-unavailable',
    data: { serviceName: 'some.other.service' },
  });

  assert.equal(context.published.find((entry) => entry.type === 'critical'), undefined);
});

test('should_match_manifest_contract_when_loaded', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const pkg = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));

  assert.equal(manifest.name, 'shirazeh.prefs');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.type, 'feature');
  assert.equal(manifest.adapterType, undefined);
  assert.deepEqual(manifest.dependencies.required, ['pey.storage.service']);
  assert.deepEqual(manifest.dependencies.optional, []);
  assert.equal(manifest.provides.length, 1);
  assert.equal(manifest.provides[0].name, 'shirazeh.prefs.service');
  const methodNames = manifest.provides[0].methods.map((method) => method.name);
  assert.deepEqual(methodNames, ['get', 'set']);
  assert.deepEqual(manifest.events, []);
});
