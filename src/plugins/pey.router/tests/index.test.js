// Verifies Bonyan entry-point preparation, activation, and lifecycle wiring.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { SERVICE_NAME } from '../lib/constants.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
let moduleSequence = 0;

function createBrowserHost(initialPath = '/') {
  const listeners = new Map();
  const queryIndex = initialPath.indexOf('?');
  const location = {
    pathname: queryIndex === -1 ? initialPath : initialPath.slice(0, queryIndex),
    search: queryIndex === -1 ? '' : initialPath.slice(queryIndex),
  };

  return {
    location,
    history: {
      back() {},
      forward() {},
      pushState(state, title, rawPath) {
        setLocation(location, rawPath);
      },
      replaceState(state, title, rawPath) {
        setLocation(location, rawPath);
      },
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    emit: (type) => listeners.get(type)?.(),
    listenerCount: (type) => (listeners.has(type) ? 1 : 0),
  };
}

function setLocation(location, rawPath) {
  const queryIndex = rawPath.indexOf('?');
  location.pathname = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
  location.search = queryIndex === -1 ? '' : rawPath.slice(queryIndex);
}

function createPrepareContext(host, overrides = {}) {
  const criticalErrors = [];
  const events = [];

  return {
    context: {
      config: {
        adapter: 'BrowserHistoryAdapter',
        adapterConfig: { host },
        basePath: '/',
        notFoundPath: '/not-found',
        ...overrides,
      },
      events: {
        publish: (type, data) => events.push({ type, data }),
        subscribe: () => () => {},
      },
      onDeactivated: null,
      onShutdown: null,
      reportCriticalError: (error) => criticalErrors.push(error),
    },
    criticalErrors,
    events,
  };
}

async function loadEntry() {
  moduleSequence += 1;
  return import(`../index.js?test=${moduleSequence}`);
}

test('should_return_declared_service_when_prepare_succeeds', async () => {
  const entry = await loadEntry();
  const { context } = createPrepareContext(createBrowserHost());

  const registrations = await entry.prepare(context);

  assert.equal(Array.isArray(registrations), true);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].name, SERVICE_NAME);
  assert.equal(typeof registrations[0].object.navigate, 'function');
});

test('should_assign_lifecycle_hooks_during_prepare', async () => {
  const entry = await loadEntry();
  const { context } = createPrepareContext(createBrowserHost());

  const preparation = entry.prepare(context);

  assert.equal(typeof context.onDeactivated, 'function');
  assert.equal(typeof context.onShutdown, 'function');
  await preparation;
});

test('should_activate_with_empty_services_when_plugin_has_no_dependencies', async () => {
  const entry = await loadEntry();

  const result = await entry.activate({});

  assert.equal(result, undefined);
});

test('should_match_manifest_methods_when_service_is_prepared', async () => {
  const entry = await loadEntry();
  const { context } = createPrepareContext(createBrowserHost());
  const [{ object: service }] = await entry.prepare(context);
  const declaredMethods = manifest.provides
    .find(({ name }) => name === SERVICE_NAME)
    .methods
    .map(({ name }) => name);

  assert.deepEqual(Object.keys(service), declaredMethods);
});

test('should_publish_declared_events_when_prepared_service_navigates', async () => {
  const entry = await loadEntry();
  const { context, events } = createPrepareContext(createBrowserHost());
  const [{ object: service }] = await entry.prepare(context);
  await service.registerRoutes(['/accounts']);
  events.length = 0;

  await service.navigate('/accounts');

  assert.deepEqual(events, [{ type: 'router:changed', data: { path: '/accounts' } }]);
});

test('should_reject_structured_startup_error_when_adapter_is_unknown', async () => {
  const entry = await loadEntry();
  const { context } = createPrepareContext(createBrowserHost(), { adapter: 'UnknownAdapter' });

  await assert.rejects(entry.prepare(context), {
    code: 'ROUTER_ADAPTER_NOT_FOUND',
    source: 'pey.router',
    type: 'startup',
  });
  assert.equal(typeof context.onDeactivated, 'function');
  assert.equal(typeof context.onShutdown, 'function');

  assert.doesNotThrow(() => context.onDeactivated());
  assert.doesNotThrow(() => context.onDeactivated());
  await assert.doesNotReject(context.onShutdown());
  await assert.doesNotReject(context.onShutdown());
});

test('should_reject_structured_error_when_router_config_is_invalid', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost();
  const { context } = createPrepareContext(host, { basePath: '' });

  await assert.rejects(entry.prepare(context), {
    code: 'ROUTER_MALFORMED_PATH',
    source: 'pey.router',
  });
  assert.equal(host.listenerCount('popstate'), 0);
  assert.doesNotThrow(() => context.onDeactivated());
  await assert.doesNotReject(context.onShutdown());
});

test('should_remove_external_listener_when_deactivated_before_activation', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost();
  const { context } = createPrepareContext(host);
  await entry.prepare(context);

  context.onDeactivated();

  assert.equal(host.listenerCount('popstate'), 0);
});

test('should_remove_external_listener_when_shutdown_is_called', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost();
  const { context } = createPrepareContext(host);
  await entry.prepare(context);

  await context.onShutdown();
  await context.onShutdown();

  assert.equal(host.listenerCount('popstate'), 0);
});

test('should_reject_stale_service_calls_when_plugin_is_deactivated', async () => {
  const entry = await loadEntry();
  const { context } = createPrepareContext(createBrowserHost());
  const [{ object: service }] = await entry.prepare(context);

  context.onDeactivated();

  assert.throws(() => service.getCurrentRoute(), { code: 'SERVICE_UNAVAILABLE' });
});

test('should_log_and_contain_failure_when_external_fallback_fails', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost('/accounts');
  const { context, criticalErrors } = createPrepareContext(host);
  const [{ object: service }] = await entry.prepare(context);
  await service.registerRoutes(['/accounts']);
  host.history.replaceState = () => {
    throw new Error('replace failed');
  };

  setLocation(host.location, '/missing');
  assert.doesNotThrow(() => host.emit('popstate'));

  assert.deepEqual(criticalErrors, []);
  assert.equal(service.getCurrentRoute().path, '/accounts');
  assert.equal(host.listenerCount('popstate'), 1);
});

test('should_reject_structured_startup_error_without_critical_when_subscription_fails_during_prepare', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost();
  host.addEventListener = () => {
    throw new Error('no listener support');
  };
  const { context, criticalErrors } = createPrepareContext(host);

  await assert.rejects(entry.prepare(context), {
    code: 'ROUTER_ADAPTER_OPERATION_FAILED',
    source: 'pey.browser-history',
  });
  assert.deepEqual(criticalErrors, []);
  assert.doesNotThrow(() => context.onDeactivated());
  await assert.doesNotReject(context.onShutdown());
});

test('should_cleanup_subscription_when_initial_route_read_fails', async () => {
  const entry = await loadEntry();
  const host = createBrowserHost();
  Object.defineProperty(host.location, 'pathname', {
    get() {
      throw new Error('location unavailable');
    },
  });
  const { context } = createPrepareContext(host);

  await assert.rejects(entry.prepare(context), {
    code: 'ROUTER_ADAPTER_OPERATION_FAILED',
  });
  assert.equal(host.listenerCount('popstate'), 0);

  assert.doesNotThrow(() => context.onDeactivated());
  await assert.doesNotReject(context.onShutdown());
  assert.equal(host.listenerCount('popstate'), 0);
});
