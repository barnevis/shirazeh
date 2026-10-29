// Verifies router service behavior through its public service contract.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_CODES, NAVIGATION_FAILURE_REASONS } from '../../lib/constants.js';
import { createRouterService } from '../../lib/router-service.js';
import { createInMemoryRouterAdapter } from '../fakes/in-memory-router-adapter.js';

function createService(initialPath = '/') {
  const criticalErrors = [];
  const events = [];
  const adapter = createInMemoryRouterAdapter(initialPath);
  const router = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: (error) => criticalErrors.push(error),
  });

  events.length = 0;
  return { adapter, criticalErrors, events, ...router };
}

test('should_expose_only_manifest_methods_when_service_is_created', () => {
  const { service } = createService();

  assert.deepEqual(Object.keys(service), [
    'registerRoutes',
    'navigate',
    'replace',
    'back',
    'forward',
    'getCurrentRoute',
    'matchRoute',
  ]);
});

test('should_register_routes_when_patterns_are_valid', async () => {
  const { service } = createService();

  await service.registerRoutes(['/accounts', '/accounts/:id']);

  assert.equal(service.getCurrentRoute().isNotFound, true);
});

test('should_accumulate_routes_when_register_routes_is_called_multiple_times', async () => {
  const { adapter, service } = createService('/accounts/42');

  await service.registerRoutes(['/accounts']);
  await service.registerRoutes(['/accounts/:id']);

  assert.deepEqual(service.getCurrentRoute(), {
    path: '/accounts/42',
    pattern: '/accounts/:id',
    params: { id: '42' },
    query: {},
    isNotFound: false,
  });
  assert.equal(adapter.getCurrentPath(), '/accounts/42');
});

test('should_ignore_duplicate_pattern_when_route_is_registered_multiple_times', async () => {
  const { events, service } = createService();

  await service.registerRoutes(['/accounts', '/accounts']);
  events.length = 0;
  await service.navigate('/accounts');

  assert.deepEqual(events, [{ type: 'router:changed', data: { path: '/accounts' } }]);
});

test('should_reject_malformed_patterns_without_partial_registration', async () => {
  const { adapter, service } = createService('/accounts');

  await assert.rejects(service.registerRoutes(['/valid', '/invalid/']), {
    code: 'ROUTER_MALFORMED_PATTERN',
  });
  await service.navigate('/valid');

  assert.equal(adapter.getCurrentPath(), '/not-found');
  assert.equal(service.getCurrentRoute().isNotFound, true);
});

test('should_reject_promise_when_register_routes_receives_malformed_pattern', async () => {
  const { adapter, events, service } = createService('/valid');

  const registration = service.registerRoutes(['/valid', '/invalid/']);

  assert.equal(registration instanceof Promise, true);
  await assert.rejects(registration, { code: 'ROUTER_MALFORMED_PATTERN' });
  events.length = 0;
  await service.navigate('/valid');

  assert.equal(adapter.getCurrentPath(), '/not-found');
  assert.equal(service.getCurrentRoute().isNotFound, true);
  assert.deepEqual(events, [
    {
      type: 'router:navigation-failed',
      data: { path: '/valid', reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND },
    },
    { type: 'router:changed', data: { path: '/not-found' } },
  ]);
});

test('should_publish_changed_when_registration_resolves_not_found_route', async () => {
  const { events, service } = createService('/accounts/42');

  await service.registerRoutes(['/accounts/:id']);

  assert.deepEqual(events, [{ type: 'router:changed', data: { path: '/accounts/42' } }]);
});

test('should_navigate_and_publish_matched_route_when_path_matches', async () => {
  const { adapter, events, service } = createService();
  await service.registerRoutes(['/accounts/:id']);
  events.length = 0;

  const result = await service.navigate('/accounts/42', { query: { tab: 'details', page: 2 } });

  assert.equal(result, undefined);
  assert.equal(adapter.getCurrentPath(), '/accounts/42?tab=details&page=2');
  assert.deepEqual(service.getCurrentRoute(), {
    path: '/accounts/42',
    pattern: '/accounts/:id',
    params: { id: '42' },
    query: { tab: 'details', page: '2' },
    isNotFound: false,
  });
  assert.deepEqual(events, [{ type: 'router:changed', data: { path: '/accounts/42' } }]);
});

test('should_replace_history_entry_when_replace_is_called', async () => {
  const { adapter, service } = createService('/first');
  await service.registerRoutes(['/first', '/second']);

  await service.replace('/second');

  assert.equal(adapter.getCurrentPath(), '/second');
});

test('should_resolve_undefined_when_register_routes_succeeds', async () => {
  const { service } = createService('/one');

  assert.equal(await service.registerRoutes(['/one']), undefined);
});

test('should_resolve_undefined_when_navigate_succeeds', async () => {
  const { service } = createService('/one');
  await service.registerRoutes(['/one', '/two']);

  assert.equal(await service.navigate('/two'), undefined);
});

test('should_resolve_undefined_when_replace_succeeds', async () => {
  const { service } = createService('/one');
  await service.registerRoutes(['/one', '/two']);

  assert.equal(await service.replace('/two'), undefined);
});

test('should_resolve_undefined_when_back_succeeds', async () => {
  const { service } = createService('/one');
  await service.registerRoutes(['/one', '/two']);
  await service.navigate('/two');

  assert.equal(await service.back(), undefined);
});

test('should_resolve_undefined_when_forward_succeeds', async () => {
  const { service } = createService('/one');
  await service.registerRoutes(['/one', '/two']);
  await service.navigate('/two');
  await service.back();

  assert.equal(await service.forward(), undefined);
});

test('should_fallback_and_publish_events_when_navigation_is_unmatched', async () => {
  const { adapter, events, service } = createService();
  await service.registerRoutes(['/accounts']);
  events.length = 0;

  await service.navigate('/missing', { query: { secret: 'value' } });

  assert.equal(adapter.getCurrentPath(), '/not-found');
  assert.deepEqual(service.getCurrentRoute(), {
    path: '/not-found',
    pattern: '/not-found',
    params: {},
    query: {},
    isNotFound: true,
  });
  assert.deepEqual(events, [
    {
      type: 'router:navigation-failed',
      data: { path: '/missing', reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND },
    },
    { type: 'router:changed', data: { path: '/not-found' } },
  ]);
});

test('should_not_rematch_not_found_sentinel_when_sentinel_is_registered', async () => {
  const { events, service } = createService();
  await service.registerRoutes(['/not-found']);
  events.length = 0;

  await service.navigate('/missing');

  assert.equal(service.getCurrentRoute().isNotFound, true);
  assert.deepEqual(events.map((event) => event.type), [
    'router:navigation-failed',
    'router:changed',
  ]);
});

test('should_resolve_back_and_forward_from_external_change_signal', async () => {
  const { adapter, events, service } = createService('/one');
  await service.registerRoutes(['/one', '/two']);
  await service.navigate('/two');
  events.length = 0;

  await service.back();
  assert.equal(service.getCurrentRoute().path, '/one');
  await service.forward();
  assert.equal(service.getCurrentRoute().path, '/two');
  assert.deepEqual(events.map((event) => event.data.path), ['/one', '/two']);
});

test('should_fallback_when_back_reaches_unmatched_entry', async () => {
  const { adapter, events, service } = createService('/missing');
  await service.registerRoutes(['/known']);
  await service.navigate('/known');
  events.length = 0;

  await service.back();

  assert.equal(adapter.getCurrentPath(), '/not-found');
  assert.deepEqual(events, [
    {
      type: 'router:navigation-failed',
      data: { path: '/missing', reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND },
    },
    { type: 'router:changed', data: { path: '/not-found' } },
  ]);
});

test('should_fallback_when_forward_reaches_unmatched_entry', async () => {
  const events = [];
  const adapter = createInMemoryRouterAdapter('/known');
  adapter.pushEntry('/missing');
  adapter.goBack();
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: () => {},
  });
  await service.registerRoutes(['/known']);
  events.length = 0;

  await service.forward();

  assert.equal(adapter.getCurrentPath(), '/not-found');
  assert.deepEqual(events, [
    {
      type: 'router:navigation-failed',
      data: { path: '/missing', reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND },
    },
    { type: 'router:changed', data: { path: '/not-found' } },
  ]);
});

test('should_fallback_when_external_path_is_outside_base_path', async () => {
  const events = [];
  const adapter = createInMemoryRouterAdapter('/app/accounts');
  const { service } = createRouterService({
    adapter,
    basePath: '/app',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: () => {},
  });
  events.length = 0;
  await service.registerRoutes(['/accounts']);

  adapter.simulateExternalChange('/other/page?tab=x');

  assert.equal(service.getCurrentRoute().isNotFound, true);
  assert.deepEqual(events.slice(-2), [
    {
      type: 'router:navigation-failed',
      data: { path: '/other/page', reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND },
    },
    { type: 'router:changed', data: { path: '/not-found' } },
  ]);
});

test('should_log_and_contain_failure_when_external_fallback_replace_fails', async () => {
  const criticalErrors = [];
  const events = [];
  const adapter = createInMemoryRouterAdapter('/accounts');
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: (error) => criticalErrors.push(error),
  });
  await service.registerRoutes(['/accounts']);
  events.length = 0;
  adapter.replaceEntry = () => {
    throw new Error('replace failed');
  };

  const loggedMessages = [];
  const originalError = console.error;
  console.error = (message) => loggedMessages.push(message);
  try {
    assert.doesNotThrow(() => adapter.simulateExternalChange('/missing'));
  } finally {
    console.error = originalError;
  }

  assert.equal(service.getCurrentRoute().path, '/accounts');
  assert.deepEqual(events, []);
  assert.deepEqual(criticalErrors, []);
  assert.equal(loggedMessages.length, 1);
});

test('should_report_critical_error_without_operational_log_when_external_change_indicates_fatal_adapter_failure', async () => {
  const criticalErrors = [];
  const events = [];
  const adapter = createInMemoryRouterAdapter('/accounts');
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: (error) => criticalErrors.push(error),
  });
  await service.registerRoutes(['/accounts']);
  events.length = 0;
  adapter.replaceEntry = () => {
    throw {
      code: 'ROUTER_ADAPTER_OPERATION_FAILED',
      message: 'browser context destroyed',
      source: 'pey.browser-history',
      type: 'operational',
      timestamp: new Date().toISOString(),
      detail: { fatal: true },
    };
  };

  const loggedMessages = [];
  const originalError = console.error;
  console.error = (message) => loggedMessages.push(message);
  try {
    assert.doesNotThrow(() => adapter.simulateExternalChange('/missing'));
  } finally {
    console.error = originalError;
  }

  assert.equal(service.getCurrentRoute().path, '/accounts');
  assert.deepEqual(events, []);
  assert.deepEqual(loggedMessages, []);
  assert.deepEqual(criticalErrors.map(({ code, source, type }) => ({ code, source, type })), [{
    code: ERROR_CODES.EXTERNAL_CHANGE_FAILED,
    source: 'pey.router',
    type: 'critical',
  }]);
});

test('should_reject_startup_error_without_critical_when_initial_external_subscription_fails', () => {
  const criticalErrors = [];
  const adapter = createInMemoryRouterAdapter();
  adapter.onExternalChange = () => {
    throw {
      code: 'ROUTER_ADAPTER_UNAVAILABLE',
      message: 'no observation channel',
      source: 'pey.browser-history',
      type: 'startup',
      timestamp: new Date().toISOString(),
    };
  };

  assert.throws(() => createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: () => {},
    reportCriticalError: (error) => criticalErrors.push(error),
  }), {
    code: 'ROUTER_ADAPTER_UNAVAILABLE',
  });
  assert.deepEqual(criticalErrors, []);
});

test('should_return_null_when_public_match_route_does_not_match', () => {
  const { service } = createService();

  assert.equal(service.matchRoute('/accounts/:id', '/users/42'), null);
});

test('should_reject_adapter_failure_when_navigation_operation_fails', async () => {
  const events = [];
  const adapter = createInMemoryRouterAdapter();
  adapter.pushEntry = () => {
    throw new Error('history failed');
  };
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: () => {},
  });
  events.length = 0;
  await service.registerRoutes(['/accounts']);

  await assert.rejects(service.navigate('/accounts'), {
    code: 'ROUTER_NAVIGATION_FAILED',
  });
  assert.deepEqual(events, []);
});

test('should_reject_adapter_failure_without_events_when_replace_fails', async () => {
  const events = [];
  const adapter = createInMemoryRouterAdapter();
  adapter.replaceEntry = () => {
    throw new Error('history failed');
  };
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: (type, data) => events.push({ type, data }),
    reportCriticalError: () => {},
  });
  await service.registerRoutes(['/accounts']);
  events.length = 0;

  await assert.rejects(service.replace('/accounts'), {
    code: 'ROUTER_NAVIGATION_FAILED',
  });
  assert.deepEqual(events, []);
});

test('should_reject_adapter_failure_when_back_or_forward_fails', async () => {
  const adapter = createInMemoryRouterAdapter();
  adapter.goBack = () => {
    throw new Error('back failed');
  };
  adapter.goForward = () => {
    throw new Error('forward failed');
  };
  const { service } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: () => {},
    reportCriticalError: () => {},
  });

  await assert.rejects(service.back(), { code: 'ROUTER_NAVIGATION_FAILED' });
  await assert.rejects(service.forward(), { code: 'ROUTER_NAVIGATION_FAILED' });
});

test('should_reject_malformed_query_when_query_value_is_invalid', async () => {
  const { service } = createService();
  await service.registerRoutes(['/accounts']);

  await assert.rejects(
    service.navigate('/accounts', { query: { filter: null } }),
    { code: 'ROUTER_MALFORMED_QUERY' },
  );
});

test('should_reject_malformed_query_when_replace_receives_invalid_query', async () => {
  const { service } = createService();
  await service.registerRoutes(['/accounts']);

  await assert.rejects(
    service.replace('/accounts', { query: { filter: ['one'] } }),
    { code: 'ROUTER_MALFORMED_QUERY' },
  );
});

test('should_not_publish_events_when_query_validation_fails', async () => {
  const { events, service } = createService();
  await service.registerRoutes(['/accounts']);
  events.length = 0;

  await assert.rejects(
    service.navigate('/accounts', { query: { filter: { nested: true } } }),
    { code: 'ROUTER_MALFORMED_QUERY' },
  );

  assert.deepEqual(events, []);
});

test('should_return_route_copy_when_current_route_is_requested', async () => {
  const { service } = createService('/accounts/42?tab=details');
  await service.registerRoutes(['/accounts/:id']);
  const route = service.getCurrentRoute();

  route.params.id = 'changed';
  route.query.tab = 'changed';

  assert.deepEqual(service.getCurrentRoute().params, { id: '42' });
  assert.deepEqual(service.getCurrentRoute().query, { tab: 'details' });
});

test('should_reject_calls_when_service_is_deactivated', async () => {
  const { deactivate, service } = createService();
  deactivate();

  assert.throws(() => service.getCurrentRoute(), { code: 'SERVICE_UNAVAILABLE' });
  await assert.rejects(service.navigate('/accounts'), { code: 'SERVICE_UNAVAILABLE' });
});

test('should_remove_external_subscription_when_service_is_deactivated', () => {
  const adapter = createInMemoryRouterAdapter();
  const subscribe = adapter.onExternalChange.bind(adapter);
  let unsubscribeCount = 0;
  adapter.onExternalChange = (callback) => {
    const unsubscribe = subscribe(callback);
    return () => {
      unsubscribeCount += 1;
      unsubscribe();
    };
  };
  const { deactivate } = createRouterService({
    adapter,
    basePath: '/',
    notFoundPath: '/not-found',
    publish: () => {},
    reportCriticalError: () => {},
  });

  deactivate();

  assert.equal(unsubscribeCount, 1);
});
