// Verifies the Browser History API adapter contract with a browser-like fake.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserHistoryAdapter } from '../../adapters/browser-history-adapter.js';
import { defineRouterAdapterContract } from '../contracts/router-adapter-contract.js';

function createBrowserHost(initialPath = '/accounts?tab=summary') {
  const listeners = new Map();
  const calls = [];
  let entries = [initialPath];
  let currentIndex = 0;

  function updateLocation(rawPath) {
    const queryIndex = rawPath.indexOf('?');
    host.location.pathname = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex);
    host.location.search = queryIndex === -1 ? '' : rawPath.slice(queryIndex);
  }

  function emitPathChange() {
    updateLocation(entries[currentIndex]);
    listeners.get('popstate')?.();
  }

  const host = {
    location: { pathname: '', search: '' },
    history: {
      back: () => {
        calls.push(['back']);
        if (currentIndex > 0) {
          currentIndex -= 1;
          emitPathChange();
        }
      },
      forward: () => {
        calls.push(['forward']);
        if (currentIndex < entries.length - 1) {
          currentIndex += 1;
          emitPathChange();
        }
      },
      pushState: (...args) => {
        calls.push(['pushState', ...args]);
        entries = entries.slice(0, currentIndex + 1);
        entries.push(args[2]);
        currentIndex += 1;
        updateLocation(args[2]);
      },
      replaceState: (...args) => {
        calls.push(['replaceState', ...args]);
        entries[currentIndex] = args[2];
        updateLocation(args[2]);
      },
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    emit: (type) => listeners.get(type)?.(),
    calls,
    listenerCount: (type) => (listeners.has(type) ? 1 : 0),
  };

  updateLocation(initialPath);
  return host;
}

defineRouterAdapterContract(
  'browser_history_adapter',
  (initialPath) => createBrowserHistoryAdapter(createBrowserHost(initialPath)),
);

test('should_return_path_and_query_when_current_location_is_read', () => {
  const adapter = createBrowserHistoryAdapter(createBrowserHost());

  assert.equal(adapter.getCurrentPath(), '/accounts?tab=summary');
});

test('should_convert_location_failure_to_standard_error_when_current_path_is_read', () => {
  const host = createBrowserHost();
  Object.defineProperty(host.location, 'pathname', {
    get() {
      throw new Error('token=secret-value');
    },
  });
  const adapter = createBrowserHistoryAdapter(host);

  assert.throws(
    () => adapter.getCurrentPath(),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED')
      && error.message === 'Browser History operation failed'
      && JSON.stringify(error).includes('secret-value') === false
      && 'stack' in error === false,
  );
});

test('should_push_raw_path_when_push_entry_is_called', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);

  adapter.pushEntry('/accounts/42?tab=details');

  assert.deepEqual(host.calls, [['pushState', null, '', '/accounts/42?tab=details']]);
});

test('should_replace_raw_path_when_replace_entry_is_called', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);

  adapter.replaceEntry('/accounts/42');

  assert.deepEqual(host.calls, [['replaceState', null, '', '/accounts/42']]);
});

test('should_delegate_back_when_go_back_is_called', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);

  adapter.goBack();

  assert.deepEqual(host.calls, [['back']]);
});

test('should_delegate_forward_when_go_forward_is_called', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);

  adapter.goForward();

  assert.deepEqual(host.calls, [['forward']]);
});

test('should_notify_once_with_current_path_when_popstate_is_emitted', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);
  const paths = [];
  adapter.onExternalChange((path) => paths.push(path));

  host.location.pathname = '/accounts/42';
  host.location.search = '?tab=details';
  host.emit('popstate');

  assert.deepEqual(paths, ['/accounts/42?tab=details']);
});

test('should_remove_popstate_listener_when_subscription_is_unsubscribed', () => {
  const host = createBrowserHost();
  const adapter = createBrowserHistoryAdapter(host);
  const unsubscribe = adapter.onExternalChange(() => {});

  unsubscribe();

  assert.equal(host.listenerCount('popstate'), 0);
});

test('should_convert_subscription_failure_to_standard_error', () => {
  const host = createBrowserHost();
  host.addEventListener = () => {
    throw new Error('listener setup failed');
  };
  const adapter = createBrowserHistoryAdapter(host);

  assert.throws(
    () => adapter.onExternalChange(() => {}),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_convert_unsubscribe_failure_to_standard_error', () => {
  const host = createBrowserHost();
  host.removeEventListener = () => {
    throw new Error('listener cleanup failed');
  };
  const adapter = createBrowserHistoryAdapter(host);
  const unsubscribe = adapter.onExternalChange(() => {});

  assert.throws(
    () => unsubscribe(),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_reject_invalid_callback_when_external_change_is_subscribed', () => {
  const adapter = createBrowserHistoryAdapter(createBrowserHost());

  assert.throws(
    () => adapter.onExternalChange(null),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_reject_startup_error_when_browser_host_is_unavailable', () => {
  assert.throws(
    () => createBrowserHistoryAdapter({}),
    (error) => error.code === 'ROUTER_ADAPTER_UNAVAILABLE'
      && error.source === 'pey.browser-history'
      && error.type === 'startup',
  );
});

test('should_convert_history_failure_to_standard_error', () => {
  const host = createBrowserHost();
  host.history.pushState = () => {
    throw new Error('token=secret-value');
  };
  const adapter = createBrowserHistoryAdapter(host);

  assert.throws(
    () => adapter.pushEntry('/accounts/42'),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED')
      && JSON.stringify(error).includes('secret-value') === false,
  );
});

function isAdapterOperationalError(error, code) {
  return error.code === code
    && error.source === 'pey.browser-history'
    && error.type === 'operational'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}
