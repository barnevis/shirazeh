// Verifies the page host: route-to-page mounting, fallbacks, retry, and disposal.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { PeyElement } from '../../base/pey-element.js';
import { KIT_TRANSLATIONS } from '../../i18n/create-i18n.js';
import { createPageLoaderRegistry } from '../../routing/page-loader.js';
import { createPageHost } from '../../routing/page-host.js';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createEvents() {
  const listeners = new Map();
  return {
    subscribe(type, listener) {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
    publish() {
      return { success: true };
    },
    emit(type, event) {
      listeners.get(type)?.(event);
    },
    subscriptionCount() {
      return listeners.size;
    },
  };
}

function createRouter(route) {
  return {
    getCurrentRoute: () => route,
    back: async () => {},
    replace: async () => {},
  };
}

class ProbePage extends PeyElement {
  onConnect(refs) {
    this.refsSnapshot = refs;
    return this;
  }

  render() {
    return '<p>probe</p>';
  }
}

customElements.define('host-page-home', class extends ProbePage {});
customElements.define('host-page-account', class extends ProbePage {});
customElements.define('host-page-not-found', class extends ProbePage {});

function createHost({
  routes = [
    { pattern: '/', load: async () => {}, element: 'host-page-home' },
    { pattern: '/accounts/:id', load: async () => {}, element: 'host-page-account' },
  ],
  notFound = null,
  currentRoute = { pattern: '/', params: {}, query: {}, isNotFound: false },
  refs = { services: {} },
  config = { fallbackPath: '/home' },
} = {}) {
  const events = createEvents();
  const router = createRouter(currentRoute);
  const registry = createPageLoaderRegistry({ routes, notFound });
  const shell = document.createElement('div');
  document.body.append(shell);
  const host = createPageHost({
    hostElement: shell,
    events,
    router,
    registry,
    infrastructure: { events },
    refs,
    config,
  });
  return { host, events, router, shell };
}

test('should_mount_resolved_page_element_into_page_slot', async () => {
  const { host, shell } = createHost();
  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-HOME');
  assert.equal(shell.firstElementChild?.slot, 'page');
});

test('should_pass_route_params_and_query_through_default_connect', async () => {
  const { host, shell } = createHost();
  await host.mountForRoute({ pattern: '/accounts/:id', params: { id: '7' }, query: { tab: 'profile' }, isNotFound: false });
  const element = shell.firstElementChild;
  assert.equal(element.tagName, 'HOST-PAGE-ACCOUNT');
  assert.equal(element.refsSnapshot.routeParams.id, '7');
  assert.equal(element.refsSnapshot.routeQuery.tab, 'profile');
  assert.deepEqual(element.refsSnapshot.services, {});
});

test('should_use_entry_connect_override_when_provided', async () => {
  let connectEnvelope = null;
  const routes = [
    {
      pattern: '/',
      load: async () => {},
      element: 'host-page-home',
      connect: (element, infrastructure, refs, route) => {
        element.connect({ infrastructure, refs: { ...refs, custom: route.pattern } });
        connectEnvelope = { infrastructure, refs, route };
      },
    },
  ];
  const { host, shell } = createHost({ routes });
  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(connectEnvelope.route.pattern, '/');
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-HOME');
});

test('should_mount_not_found_slot_page_for_unresolved_routes', async () => {
  const notFound = { load: async () => {}, element: 'host-page-not-found' };
  const { host, shell } = createHost({ notFound });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-NOT-FOUND');
});

test('should_render_not_found_fallback_when_no_not_found_slot_exists', async () => {
  const { host, shell } = createHost();
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  assert.equal(shell.firstElementChild?.tagName, 'PEY-PAGE-FALLBACK');
  assert.equal(
    shell.firstElementChild.shadowRoot?.querySelector('button[data-action="retry"]'),
    null,
    'not-found fallback must not offer retry',
  );
});

test('should_keep_internal_not_found_fallback_when_not_found_slot_load_rejects', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => errorLogs.push(args);
  try {
    const notFound = {
      load: async () => {
        throw new Error('not-found load exploded');
      },
      element: 'host-page-not-found',
    };
    const { host, shell } = createHost({ notFound });
    await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
    const fallback = shell.firstElementChild;
    assert.equal(fallback?.tagName, 'PEY-PAGE-FALLBACK');
    assert.equal(
      fallback?.shadowRoot?.querySelector('[part="message"]')?.textContent,
      KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found'],
      'a failed notFound slot must render the not-found fallback, not page-load-failed',
    );
    assert.equal(
      fallback?.shadowRoot?.querySelector('button[data-action="retry"]'),
      null,
      'the not-found fallback must never offer retry',
    );
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_LOAD_FAILED'))),
      'the notFound slot load failure must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_keep_internal_not_found_fallback_when_not_found_slot_connect_fails', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => errorLogs.push(args);
  try {
    const notFound = {
      load: async () => {},
      element: 'host-page-not-found',
      connect: () => {
        throw new Error('not-found connect exploded');
      },
    };
    const { host, shell } = createHost({ notFound });
    await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
    const fallback = shell.firstElementChild;
    assert.equal(fallback?.tagName, 'PEY-PAGE-FALLBACK');
    assert.equal(
      fallback?.shadowRoot?.querySelector('[part="message"]')?.textContent,
      KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found'],
      'a failed notFound slot connect must render the not-found fallback, not page-load-failed',
    );
    assert.equal(
      fallback?.shadowRoot?.querySelector('button[data-action="retry"]'),
      null,
      'the not-found fallback must never offer retry',
    );
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_MOUNT_FAILED'))),
      'the notFound slot connect failure must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_render_load_failed_fallback_when_pattern_has_no_loader', async () => {
  const { host, shell } = createHost();
  await host.mountForRoute({ pattern: '/unregistered', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.firstElementChild?.tagName, 'PEY-PAGE-FALLBACK');
  assert.equal(
    shell.firstElementChild.shadowRoot?.querySelector('button[data-action="retry"]'),
    null,
    'a missing loader is a config error and must not offer retry',
  );
});

test('should_render_load_failed_fallback_with_retry_when_load_rejects', async () => {
  let loadCalls = 0;
  const routes = [
    {
      pattern: '/',
      load: async () => {
        loadCalls += 1;
        if (loadCalls === 1) throw new Error('first load failed');
        customElements.define('host-page-lazy', class extends ProbePage {});
      },
      element: 'host-page-lazy',
    },
  ];
  const { host, shell } = createHost({ routes });

  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(loadCalls, 1);
  assert.equal(shell.firstElementChild?.tagName, 'PEY-PAGE-FALLBACK');
  const retryButton = shell.firstElementChild.shadowRoot?.querySelector('button[data-action="retry"]');
  assert.ok(retryButton, 'load failure must offer retry');

  retryButton.click();
  await flush();
  assert.equal(loadCalls, 2);
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-LAZY');
});

test('should_render_load_failed_fallback_when_load_leaves_element_undefined', async () => {
  const routes = [{ pattern: '/', load: async () => {}, element: 'host-page-never-defined' }];
  const { host, shell } = createHost({ routes });
  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.firstElementChild?.tagName, 'PEY-PAGE-FALLBACK');
});

test('should_render_load_failed_fallback_when_connect_throws', async () => {
  const routes = [
    {
      pattern: '/',
      load: async () => {},
      element: 'host-page-home',
      connect: () => {
        throw new Error('connect exploded');
      },
    },
  ];
  const { host, shell } = createHost({ routes });
  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.firstElementChild?.tagName, 'PEY-PAGE-FALLBACK');
});

test('should_ignore_stale_mount_after_newer_route_is_requested', async () => {
  let resolveSlow;
  const slow = () => new Promise((resolve) => {
    resolveSlow = resolve;
  });
  const routes = [
    { pattern: '/slow', load: slow, element: 'host-page-home' },
    { pattern: '/fast', load: async () => {}, element: 'host-page-account' },
  ];
  const { host, shell } = createHost({ routes });

  const slowPromise = host.mountForRoute({ pattern: '/slow', params: {}, query: {}, isNotFound: false });
  await host.mountForRoute({ pattern: '/fast', params: {}, query: {}, isNotFound: false });
  resolveSlow();
  await slowPromise;
  await flush();
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-ACCOUNT');
  assert.equal(shell.childElementCount, 1);
});

test('should_react_to_router_changed_with_current_route', async () => {
  const { host, events, router, shell } = createHost();
  router.getCurrentRoute = () => ({ pattern: '/accounts/:id', params: { id: '9' }, query: {}, isNotFound: false });
  events.emit('router:changed', {});
  await flush();
  assert.equal(shell.firstElementChild?.tagName, 'HOST-PAGE-ACCOUNT');
});

test('should_unsubscribe_and_unmount_current_page_on_dispose', async () => {
  const { host, events, shell } = createHost();
  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.childElementCount, 1);
  const subscriptionsBefore = events.subscriptionCount();

  host.dispose();

  assert.equal(events.subscriptionCount(), subscriptionsBefore - 1);
  assert.equal(shell.childElementCount, 0);
});

test('should_invalidate_in_flight_load_on_dispose', async () => {
  let resolveSlow;
  const slow = () => new Promise((resolve) => {
    resolveSlow = resolve;
  });
  const routes = [{ pattern: '/', load: slow, element: 'host-page-home' }];
  const { host, shell } = createHost({ routes });

  const mounting = host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  host.dispose();
  resolveSlow();
  await mounting;
  await flush();
  assert.equal(shell.childElementCount, 0, 'a stale load must not mount after dispose');
});

test('should_make_mount_for_route_and_retry_no_ops_after_dispose', async () => {
  let resolveSlow;
  const slow = () => new Promise((resolve) => {
    resolveSlow = resolve;
  });
  const routes = [
    {
      pattern: '/',
      load: slow,
      element: 'host-page-home',
    },
  ];
  const { host, shell } = createHost({ routes });

  const mounting = host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  await flush();
  assert.equal(shell.childElementCount, 0, 'slow load is still pending');
  host.dispose();
  resolveSlow();
  await mounting;
  await flush();
  assert.equal(shell.childElementCount, 0, 'dispose must leave the shell empty');

  await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
  assert.equal(shell.childElementCount, 0, 'mountForRoute must be a no-op after dispose');
});

test('should_reject_router_subscription_when_it_returns_no_unsubscribe_function', () => {
  const { events, router, registry } = (() => {
    const events = {
      subscribe: () => undefined,
      publish: () => ({ success: true }),
    };
    const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
    const registry = createPageLoaderRegistry({ routes: [] });
    return { events, router, registry };
  })();
  assert.throws(
    () => createPageHost({ hostElement: document.createElement('div'), events, router, registry, infrastructure: { events } }),
    (error) => error.code === 'PEY_PAGE_HOST_SUBSCRIBE_INVALID',
  );
});

test('should_convert_throwing_router_subscription_into_stable_error', () => {
  const events = {
    subscribe: () => {
      throw new Error('bus exploded');
    },
    publish: () => ({ success: true }),
  };
  const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
  const registry = createPageLoaderRegistry({ routes: [] });
  assert.throws(
    () => createPageHost({ hostElement: document.createElement('div'), events, router, registry, infrastructure: { events } }),
    (error) => error.code === 'PEY_PAGE_HOST_SUBSCRIBE_INVALID',
  );
});

test('should_contain_throwing_unsubscribe_and_still_unmount_on_dispose', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const events = {
      subscribe: () => () => {
        throw new Error('unsubscribe exploded');
      },
      publish: () => ({ success: true }),
    };
    const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
    const registry = createPageLoaderRegistry({
      routes: [{ pattern: '/', load: async () => {}, element: 'host-page-home' }],
    });
    const shell = document.createElement('div');
    document.body.append(shell);
    const host = createPageHost({ hostElement: shell, events, router, registry, infrastructure: { events } });

    await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
    assert.equal(shell.childElementCount, 1);

    assert.doesNotThrow(() => host.dispose(), 'dispose must contain the unsubscribe failure');
    assert.equal(shell.childElementCount, 0, 'dispose must unmount even when unsubscribe fails');
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_UNSUBSCRIBE_FAILED'))),
      'the unsubscribe failure must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_contain_router_changed_callback_failure_with_stable_log', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const { host, events, router } = createHost();
    router.getCurrentRoute = () => {
      throw new Error('route read exploded');
    };
    assert.doesNotThrow(() => events.emit('router:changed', {}));
    await flush();
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_ROUTE_READ_FAILED'))),
      'a failing route read must be logged with the read code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_distinguish_unexpected_mount_rejection_from_route_read_failure', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const events = createEvents();
    const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
    const registry = createPageLoaderRegistry({
      routes: [{ pattern: '/', load: async () => {}, element: 'host-page-home' }],
    });
    const shell = document.createElement('div');
    shell.append = () => {
      throw new Error('append exploded');
    };
    document.body.append(shell);
    const host = createPageHost({ hostElement: shell, events, router, registry, infrastructure: { events } });

    events.emit('router:changed', {});
    await flush();
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_ROUTE_MOUNT_FAILED'))),
      'an unexpected mount rejection must be logged with the mount code',
    );
    assert.equal(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_ROUTE_READ_FAILED'))),
      false,
      'a successful route read must not be logged as a read failure',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_contain_fallback_mount_failure_instead_of_leaving_rejected_mount', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const events = createEvents();
    const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
    const registry = createPageLoaderRegistry({
      routes: [
        {
          pattern: '/',
          load: async () => {
            throw new Error('load exploded');
          },
          element: 'host-page-home',
        },
      ],
    });
    const shell = document.createElement('div');
    shell.append = () => {
      throw new Error('append exploded');
    };
    document.body.append(shell);
    const host = createPageHost({ hostElement: shell, events, router, registry, infrastructure: { events } });

    await host.mountForRoute({ pattern: '/', params: {}, query: {}, isNotFound: false });
    assert.equal(shell.childElementCount, 0);
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_FALLBACK_MOUNT_FAILED'))),
      'a fallback mount failure must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_render_kit_translations_when_no_t_ref_is_provided', async () => {
  const { host, shell } = createHost({
    currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
  });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  const message = shell.firstElementChild?.shadowRoot?.querySelector('[part="message"]')?.textContent;
  assert.ok(message, 'fallback must render a message');
  assert.equal(
    message.includes('pey.webui.errors'),
    false,
    'fallback must render translated text, not the raw key',
  );
  assert.ok(message.includes('could not be found'), 'fallback must render the kit not-found translation');
});

test('should_prefer_injected_t_ref_over_kit_catalog', async () => {
  const { host, shell } = createHost({
    currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
    refs: { t: (key) => `translated:${key}` },
  });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  const message = shell.firstElementChild?.shadowRoot?.querySelector('[part="message"]')?.textContent;
  assert.equal(message, 'translated:pey.webui.errors.page-not-found');
});

function createSharedStateFacade(initialLanguage) {
  const listeners = new Map();
  return {
    get: (key) => (key === 'language' ? initialLanguage : undefined),
    set() {},
    subscribe(key, listener) {
      listeners.set(key, listener);
      return () => listeners.delete(key);
    },
    emit(key, value) {
      listeners.get(key)?.(value);
    },
    listenerCount(key) {
      return listeners.get(key)?.size ?? 0;
    },
  };
}

test('should_rebuild_kit_fallback_translations_when_shared_state_language_changes', async () => {
  const sharedState = createSharedStateFacade('en');
  const { host, shell } = createHost({
    currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
    refs: { services: {}, sharedState },
  });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  const before = shell.firstElementChild;
  assert.ok(before, 'fallback must render');
  sharedState.emit('language', 'en');
  await flush();
  const after = shell.firstElementChild;
  assert.notEqual(after, before, 'a language change must re-render an active fallback');
  const message = after?.shadowRoot?.querySelector('[part="message"]')?.textContent;
  assert.equal(message, KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found']);
});

test('should_keep_injected_t_ref_authoritative_over_shared_state_language', async () => {
  const sharedState = createSharedStateFacade('en');
  const { host, shell } = createHost({
    currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
    refs: { services: {}, sharedState, t: (key) => `translated:${key}` },
  });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  const before = shell.firstElementChild;
  assert.ok(before, 'fallback must render');
  sharedState.emit('language', 'de');
  assert.equal(shell.firstElementChild, before, 'injected t must not re-render on language change');
});

test('should_preserve_current_fallback_when_shared_state_reports_invalid_language', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => errorLogs.push(args);
  try {
    const sharedState = createSharedStateFacade('en');
    const { host, shell } = createHost({
      currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
      refs: { services: {}, sharedState },
    });
    await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
    const before = shell.firstElementChild;
    assert.ok(before, 'fallback must render');
    sharedState.emit('language', 'en_GB');
    await flush();
    assert.equal(
      shell.firstElementChild,
      before,
      'an invalid language must keep the existing fallback in place',
    );
    const message = before?.shadowRoot?.querySelector('[part="message"]')?.textContent;
    assert.equal(message, KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found']);
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_HOST_SHARED_STATE_LANGUAGE_INVALID'))),
      'an invalid shared-state language must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_ignore_invalid_shared_state_facade_for_language_reactivity', async () => {
  const { host, shell } = createHost({
    currentRoute: { pattern: '/missing', params: {}, query: {}, isNotFound: true },
    refs: { services: {}, sharedState: { get: () => 'de' } },
  });
  await host.mountForRoute({ pattern: '/missing', params: {}, query: {}, isNotFound: true });
  const message = shell.firstElementChild?.shadowRoot?.querySelector('[part="message"]')?.textContent;
  assert.equal(message, KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found']);
});

test('should_reject_invalid_dependencies', () => {
  const events = createEvents();
  const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
  const registry = createPageLoaderRegistry({ routes: [] });
  assert.throws(
    () => createPageHost({ hostElement: null, events, router, registry, infrastructure: { events } }),
    (error) => error.code === 'PEY_PAGE_HOST_INVALID',
  );
  assert.throws(
    () => createPageHost({ hostElement: document.createElement('div'), events, router, registry: {}, infrastructure: { events } }),
    (error) => error.code === 'PEY_PAGE_HOST_INVALID',
  );
});
