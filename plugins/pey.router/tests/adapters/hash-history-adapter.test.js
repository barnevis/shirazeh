// Verifies the Hash History adapter contract with a browser-like fake.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHashHistoryAdapter } from '../../adapters/hash-history-adapter.js';
import { defineRouterAdapterContract } from '../contracts/router-adapter-contract.js';

function createHashHost(initialPath = '/accounts?tab=summary') {
  const listeners = new Map();
  const calls = [];
  let entries = [initialPath];
  let currentIndex = 0;

  function updateLocation(rawPath) {
    host.location.hash = rawPath === '/' ? '' : `#${rawPath}`;
  }

  function toRawPath(fragmentUrl) {
    return fragmentUrl.startsWith('#') ? fragmentUrl.slice(1) : fragmentUrl;
  }

  function emitPathChange() {
    updateLocation(entries[currentIndex]);
    listeners.get('hashchange')?.();
  }

  const host = {
    location: { hash: '' },
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
        entries.push(toRawPath(args[2]));
        currentIndex += 1;
        updateLocation(entries[currentIndex]);
      },
      replaceState: (...args) => {
        calls.push(['replaceState', ...args]);
        entries[currentIndex] = toRawPath(args[2]);
        updateLocation(entries[currentIndex]);
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
  'hash_history_adapter',
  (initialPath) => createHashHistoryAdapter(createHashHost(initialPath)),
);

test('should_return_root_path_when_fragment_is_empty', () => {
  const host = createHashHost();
  host.location.hash = '';
  const adapter = createHashHistoryAdapter(host);

  assert.equal(adapter.getCurrentPath(), '/');
});

test('should_return_root_path_when_fragment_is_bare_hash', () => {
  const host = createHashHost();
  host.location.hash = '#';
  const adapter = createHashHistoryAdapter(host);

  assert.equal(adapter.getCurrentPath(), '/');
});

test('should_return_path_and_query_when_current_fragment_is_read', () => {
  const host = createHashHost();
  host.location.hash = '#/accounts/42?tab=summary';
  const adapter = createHashHistoryAdapter(host);

  assert.equal(adapter.getCurrentPath(), '/accounts/42?tab=summary');
});

test('should_push_fragment_entry_when_push_entry_is_called', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);

  adapter.pushEntry('/accounts/42?tab=details');

  assert.deepEqual(host.calls, [['pushState', null, '', '#/accounts/42?tab=details']]);
});

test('should_replace_fragment_entry_when_replace_entry_is_called', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);

  adapter.replaceEntry('/accounts/42');

  assert.deepEqual(host.calls, [['replaceState', null, '', '#/accounts/42']]);
});

test('should_delegate_back_when_go_back_is_called', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);

  adapter.goBack();

  assert.deepEqual(host.calls, [['back']]);
});

test('should_delegate_forward_when_go_forward_is_called', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);

  adapter.goForward();

  assert.deepEqual(host.calls, [['forward']]);
});

test('should_notify_once_with_current_path_when_hashchange_is_emitted', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);
  const paths = [];
  adapter.onExternalChange((path) => paths.push(path));

  host.location.hash = '#/accounts/42';
  host.emit('hashchange');

  assert.deepEqual(paths, ['/accounts/42']);
});

test('should_notify_with_root_path_when_hashchange_clears_the_fragment', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);
  const paths = [];
  adapter.onExternalChange((path) => paths.push(path));

  host.location.hash = '';
  host.emit('hashchange');

  assert.deepEqual(paths, ['/']);
});

test('should_remove_hashchange_listener_when_subscription_is_unsubscribed', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter(host);
  const unsubscribe = adapter.onExternalChange(() => {});

  unsubscribe();

  assert.equal(host.listenerCount('hashchange'), 0);
});

test('should_convert_subscription_failure_to_standard_error', () => {
  const host = createHashHost();
  host.addEventListener = () => {
    throw new Error('listener setup failed');
  };
  const adapter = createHashHistoryAdapter(host);

  assert.throws(
    () => adapter.onExternalChange(() => {}),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_convert_unsubscribe_failure_to_standard_error', () => {
  const host = createHashHost();
  host.removeEventListener = () => {
    throw new Error('listener cleanup failed');
  };
  const adapter = createHashHistoryAdapter(host);
  const unsubscribe = adapter.onExternalChange(() => {});

  assert.throws(
    () => unsubscribe(),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_reject_invalid_callback_when_external_change_is_subscribed', () => {
  const adapter = createHashHistoryAdapter(createHashHost());

  assert.throws(
    () => adapter.onExternalChange(null),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED'),
  );
});

test('should_reject_startup_error_when_host_is_unavailable', () => {
  assert.throws(
    () => createHashHistoryAdapter({}),
    (error) => error.code === 'ROUTER_ADAPTER_UNAVAILABLE'
      && error.source === 'pey.hash-history'
      && error.type === 'startup',
  );
});

test('should_convert_history_failure_to_standard_error', () => {
  const host = createHashHost();
  host.history.pushState = () => {
    throw new Error('token=secret-value');
  };
  const adapter = createHashHistoryAdapter(host);

  assert.throws(
    () => adapter.pushEntry('/accounts/42'),
    (error) => isAdapterOperationalError(error, 'ROUTER_ADAPTER_OPERATION_FAILED')
      && JSON.stringify(error).includes('secret-value') === false,
  );
});

test('should_accept_explicit_host_config_when_window_is_absent', () => {
  const host = createHashHost();
  const adapter = createHashHistoryAdapter({ host });

  assert.equal(adapter.getCurrentPath(), '/accounts?tab=summary');
});

function isAdapterOperationalError(error, code) {
  return error.code === code
    && error.source === 'pey.hash-history'
    && error.type === 'operational'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}
