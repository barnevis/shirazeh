// Verifies the page-loader registry contract and the default connection envelope.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPageLoaderRegistry, defaultConnect } from '../../routing/page-loader.js';

function validEntry(overrides = {}) {
  return {
    pattern: '/accounts/:id',
    load: () => {},
    element: 'test-page-account',
    ...overrides,
  };
}

test('should_resolve_entries_by_exact_pattern', () => {
  const registry = createPageLoaderRegistry({
    routes: [validEntry(), validEntry({ pattern: '/', element: 'test-page-home' })],
  });
  assert.equal(registry.getEntry('/accounts/:id').element, 'test-page-account');
  assert.equal(registry.getEntry('/').element, 'test-page-home');
});

test('should_return_null_for_unknown_patterns', () => {
  const registry = createPageLoaderRegistry({ routes: [validEntry()] });
  assert.equal(registry.getEntry('/missing'), null);
});

test('should_expose_not_found_slot_and_default_to_null', () => {
  const withSlot = createPageLoaderRegistry({
    routes: [validEntry()],
    notFound: { load: () => {}, element: 'test-page-not-found' },
  });
  assert.equal(withSlot.notFoundEntry.element, 'test-page-not-found');
  const withoutSlot = createPageLoaderRegistry({ routes: [validEntry()] });
  assert.equal(withoutSlot.notFoundEntry, null);
});

test('should_reject_non_array_routes_catalog', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: {} }),
    (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
  );
});

test('should_reject_entries_with_missing_empty_or_whitespace_patterns', () => {
  for (const pattern of [undefined, '', '   ']) {
    assert.throws(
      () => createPageLoaderRegistry({ routes: [validEntry({ pattern })] }),
      (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
    );
  }
});

test('should_reject_entries_when_load_is_not_a_function', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: [validEntry({ load: 'not-a-function' })] }),
    (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
  );
});

test('should_reject_entries_when_element_is_missing', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: [validEntry({ element: undefined })] }),
    (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
  );
});

test('should_reject_invalid_custom_element_names', () => {
  for (const element of ['', '  page-home  ', 'pagehome', 'Page-Home', 'page--home', 'page-home-', '-page-home', 'pey.app-shell', 'pey_app-shell']) {
    assert.throws(
      () => createPageLoaderRegistry({ routes: [validEntry({ element })] }),
      (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
      `element must be rejected: ${JSON.stringify(element)}`,
    );
  }
  for (const element of ['page-home', 'a-b', 'x1-y2', 'pey-app-shell']) {
    const registry = createPageLoaderRegistry({ routes: [validEntry({ element })] });
    assert.equal(registry.getEntry('/accounts/:id').element, element, `element must be accepted: ${element}`);
  }
});

test('should_use_startup_error_type_for_loader_errors', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: [validEntry({ element: 'nohyphen' })] }),
    (error) => error.type === 'startup',
  );
});

test('should_reject_duplicate_patterns', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: [validEntry(), validEntry()] }),
    (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
  );
});

test('should_reject_non_function_connect_override', () => {
  assert.throws(
    () => createPageLoaderRegistry({ routes: [validEntry({ connect: 'nope' })] }),
    (error) => error.code === 'PEY_PAGE_LOADER_INVALID',
  );
});

test('should_return_frozen_entries', () => {
  const registry = createPageLoaderRegistry({ routes: [validEntry()] });
  assert.equal(Object.isFrozen(registry.getEntry('/accounts/:id')), true);
  assert.equal(Object.isFrozen(registry), true);
});

test('should_pass_route_params_and_query_as_explicit_refs', () => {
  const probe = document.createElement('div');
  probe.connect = (envelope) => {
    probe.envelope = envelope;
  };
  const result = defaultConnect(
    probe,
    { events: {} },
    { services: {} },
    { params: { id: '7' }, query: { tab: 'profile' } },
  );
  assert.equal(result, probe);
  assert.equal(probe.envelope.refs.routeParams.id, '7');
  assert.equal(probe.envelope.refs.routeQuery.tab, 'profile');
  assert.deepEqual(probe.envelope.refs.services, {});
});

test('should_default_empty_route_params_and_query', () => {
  const probe = document.createElement('div');
  probe.connect = (envelope) => {
    probe.envelope = envelope;
  };
  defaultConnect(probe, { events: {} }, {}, undefined);
  assert.deepEqual(probe.envelope.refs.routeParams, {});
  assert.deepEqual(probe.envelope.refs.routeQuery, {});
});
