// Loads and validates the configured router adapter implementation.

import { ROUTER_ADAPTER_METHODS } from './constants.js';
import { createRouterError, normalizeAdapterError } from './error.js';

const ADAPTER_ERROR_CODES = Object.freeze({
  INITIALIZATION_FAILED: 'ROUTER_ADAPTER_INITIALIZATION_FAILED',
  INVALID: 'ROUTER_ADAPTER_INVALID',
  NOT_FOUND: 'ROUTER_ADAPTER_NOT_FOUND',
});

const DEFAULT_ADAPTER_LOADERS = Object.freeze({
  BrowserHistoryAdapter: async (adapterConfig) => {
    const { createBrowserHistoryAdapter } = await import('../adapters/browser-history-adapter.js');
    return createBrowserHistoryAdapter(adapterConfig);
  },
});

function startupError(code, message) {
  return createRouterError(code, message, 'startup');
}

function validateAdapter(adapter) {
  const isValid = adapter !== null
    && typeof adapter === 'object'
    && ROUTER_ADAPTER_METHODS.every((methodName) => typeof adapter[methodName] === 'function');

  if (!isValid) {
    throw startupError(
      ADAPTER_ERROR_CODES.INVALID,
      'Configured router adapter does not implement the required contract',
    );
  }
}

/**
 * Loads, creates, and validates a configured router adapter.
 *
 * @param {string} identifier Configured adapter implementation identifier.
 * @param {object} [adapterConfig={}] Adapter-specific configuration.
 * @param {Record<string, function>} [adapterLoaders=DEFAULT_ADAPTER_LOADERS] Adapter factories.
 * @returns {Promise<object>} Validated router adapter instance.
 * @throws {object} Standard Bonyan startup error for unknown, failed, or invalid adapters.
 */
export async function loadRouterAdapter(
  identifier,
  adapterConfig = {},
  adapterLoaders = DEFAULT_ADAPTER_LOADERS,
) {
  const adapterLoader = typeof identifier === 'string' ? adapterLoaders[identifier] : undefined;

  if (typeof adapterLoader !== 'function') {
    throw startupError(
      ADAPTER_ERROR_CODES.NOT_FOUND,
      'Configured router adapter is not supported',
    );
  }

  let adapter;

  try {
    adapter = await adapterLoader(adapterConfig);
  } catch (error) {
    throw normalizeAdapterError(
      error,
      ADAPTER_ERROR_CODES.INITIALIZATION_FAILED,
      'Configured router adapter could not be initialized',
      'startup',
    );
  }

  validateAdapter(adapter);
  return adapter;
}
