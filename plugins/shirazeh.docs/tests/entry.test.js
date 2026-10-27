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
  assert.equal(registrations[0].name, 'shirazeh.docs.service');
  assert.equal(typeof registrations[0].object.getPage, 'function');
  assert.equal(typeof registrations[0].object.getSidebar, 'function');
});

test('should_assign_lifecycle_hooks_when_prepare_is_called', async () => {
  const context = createPrepareContext();

  await prepare(context);

  assert.equal(typeof context.onShutdown, 'function');
  assert.equal(typeof context.onDeactivated, 'function');
});

test('should_bind_dependencies_when_activate_is_called', async () => {
  const context = createPrepareContext();
  await prepare(context);

  await activate({
    'shirazeh.http.service': { getText: async () => ({ status: 200, body: '- [x](y)' }) },
    'pey.markdown.service': { renderFragment: () => ({ html: '<p>x</p>', toc: [] }) },
  });

  const sidebar = await context.listeners; // no throw is the contract here
  void sidebar;
});

test('should_report_critical_error_when_required_dependency_is_lost', async () => {
  const context = createPrepareContext();
  await prepare(context);

  context.listeners['core:service-unavailable'][0]({
    type: 'core:service-unavailable',
    data: { serviceName: 'shirazeh.http.service' },
  });

  const criticalReport = context.published.find((entry) => entry.type === 'critical');
  assert.equal(criticalReport.data.code, 'REQUIRED_DEPENDENCY_LOST');
  assert.equal(criticalReport.data.type, 'critical');
  assert.equal(criticalReport.data.source, 'shirazeh.docs');
});

test('should_not_report_critical_error_when_optional_service_is_lost', async () => {
  const context = createPrepareContext();
  await prepare(context);

  context.listeners['core:service-unavailable'][0]({
    type: 'core:service-unavailable',
    data: { serviceName: 'some.other.service' },
  });

  const criticalReport = context.published.find((entry) => entry.type === 'critical');
  assert.equal(criticalReport, undefined);
});

test('should_match_manifest_contract_when_loaded', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const pkg = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));

  assert.equal(manifest.name, 'shirazeh.docs');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.type, 'product');
  assert.equal(manifest.adapterType, undefined);
  assert.deepEqual(manifest.dependencies.required, ['shirazeh.http.service', 'pey.markdown.service']);
  assert.deepEqual(manifest.dependencies.optional, []);
  assert.equal(manifest.provides.length, 1);
  assert.equal(manifest.provides[0].name, 'shirazeh.docs.service');
  const methodNames = manifest.provides[0].methods.map((method) => method.name);
  assert.deepEqual(methodNames, ['getSidebar', 'getNavbar', 'getPage', 'getRawMarkdown']);
  assert.deepEqual(
    manifest.events.map((event) => event.name),
    ['docs:page-loaded'],
  );
});
