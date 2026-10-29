// Provides the Router adapter contract through the browser History API.

import { createRouterError, normalizeAdapterError } from '../lib/error.js';

const ADAPTER_SOURCE = 'pey.browser-history';
const ADAPTER_ERROR_CODES = Object.freeze({
  OPERATION_FAILED: 'ROUTER_ADAPTER_OPERATION_FAILED',
  UNAVAILABLE: 'ROUTER_ADAPTER_UNAVAILABLE',
});

function adapterUnavailableError() {
  return {
    ...createRouterError(
      ADAPTER_ERROR_CODES.UNAVAILABLE,
      'Browser History API is unavailable',
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
    || !host.history
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
  return `${host.location.pathname}${host.location.search}`;
}

function normalizeOperationError(error) {
  const normalizedError = normalizeAdapterError(
    error,
    ADAPTER_ERROR_CODES.OPERATION_FAILED,
    'Browser History operation failed',
    'operational',
  );

  return {
    ...normalizedError,
    source: ADAPTER_SOURCE,
  };
}

function runHistoryOperation(operation) {
  try {
    operation();
  } catch (error) {
    throw normalizeOperationError(error);
  }
}

/**
 * Creates a Browser History API router adapter.
 *
 * @param {object} [config={}] Adapter config, optionally containing a browser-like `host`.
 * @returns {object} Router adapter implementing the project contract.
 * @throws {object} Standard startup error when the History API is unavailable.
 */
export function createBrowserHistoryAdapter(config = {}) {
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
      runHistoryOperation(() => host.history.pushState(null, '', rawPath));
    },

    replaceEntry(rawPath) {
      runHistoryOperation(() => host.history.replaceState(null, '', rawPath));
    },

    goBack() {
      runHistoryOperation(() => host.history.back());
    },

    goForward() {
      runHistoryOperation(() => host.history.forward());
    },

    onExternalChange(callback) {
      if (typeof callback !== 'function') {
        throw normalizeOperationError(new TypeError('External change callback is required'));
      }

      const listener = () => callback(readCurrentPath(host));
      runHistoryOperation(() => host.addEventListener('popstate', listener));

      return () => runHistoryOperation(() => host.removeEventListener('popstate', listener));
    },
  };
}
