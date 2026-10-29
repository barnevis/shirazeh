// Provides the Router adapter contract through the URL fragment (hash).

import { createRouterError, normalizeAdapterError } from '../lib/error.js';

const ADAPTER_SOURCE = 'pey.hash-history';
const ADAPTER_ERROR_CODES = Object.freeze({
  OPERATION_FAILED: 'ROUTER_ADAPTER_OPERATION_FAILED',
  UNAVAILABLE: 'ROUTER_ADAPTER_UNAVAILABLE',
});

function adapterUnavailableError() {
  return {
    ...createRouterError(
      ADAPTER_ERROR_CODES.UNAVAILABLE,
      'URL fragment navigation is unavailable',
      'startup',
    ),
    source: ADAPTER_SOURCE,
  };
}

function getDefaultHost() {
  if (typeof globalThis.window === 'undefined') {
    throw adapterUnavailableError();
  }

  return globalThis.window;
}

function validateHost(host) {
  if (host === null
    || typeof host !== 'object'
    || !host.location
    || typeof host.history?.pushState !== 'function'
    || typeof host.history?.replaceState !== 'function'
    || typeof host.history?.back !== 'function'
    || typeof host.history?.forward !== 'function'
    || typeof host.addEventListener !== 'function'
    || typeof host.removeEventListener !== 'function') {
    throw adapterUnavailableError();
  }
}

function resolveHost(config) {
  if (config?.location && config?.history) {
    return config;
  }

  return config?.host ?? getDefaultHost();
}

function readCurrentPath(host) {
  const fragment = host.location.hash;

  if (typeof fragment !== 'string' || fragment === '' || fragment === '#') {
    return '/';
  }

  return fragment.startsWith('#') ? fragment.slice(1) : fragment;
}

function normalizeOperationError(error) {
  const normalizedError = normalizeAdapterError(
    error,
    ADAPTER_ERROR_CODES.OPERATION_FAILED,
    'Hash history operation failed',
    'operational',
  );

  return {
    ...normalizedError,
    source: ADAPTER_SOURCE,
  };
}

function runHashOperation(operation) {
  try {
    operation();
  } catch (error) {
    throw normalizeOperationError(error);
  }
}

/**
 * Creates a URL fragment (hash) router adapter.
 *
 * Paths live in the fragment (`/#/docs/intro`), so the application works on
 * any static host without server-side rewrite rules. Entries are pushed
 * through the History API so `pushEntry` and `replaceEntry` fire no
 * `hashchange` event; only externally reached fragment changes do.
 *
 * @param {object} [config={}] Adapter config, optionally containing a browser-like `host`.
 * @returns {object} Router adapter implementing the project contract.
 * @throws {object} Standard startup error when fragment navigation is unavailable.
 */
export function createHashHistoryAdapter(config = {}) {
  const host = resolveHost(config);
  validateHost(host);

  return {
    getCurrentPath() {
      try {
        return readCurrentPath(host);
      } catch (error) {
        throw normalizeOperationError(error);
      }
    },

    pushEntry(rawPath) {
      runHashOperation(() => host.history.pushState(null, '', `#${rawPath}`));
    },

    replaceEntry(rawPath) {
      runHashOperation(() => host.history.replaceState(null, '', `#${rawPath}`));
    },

    goBack() {
      runHashOperation(() => host.history.back());
    },

    goForward() {
      runHashOperation(() => host.history.forward());
    },

    onExternalChange(callback) {
      if (typeof callback !== 'function') {
        throw normalizeOperationError(new TypeError('External change callback is required'));
      }

      const listener = () => callback(readCurrentPath(host));
      runHashOperation(() => host.addEventListener('hashchange', listener));

      return () => runHashOperation(() => host.removeEventListener('hashchange', listener));
    },
  };
}
