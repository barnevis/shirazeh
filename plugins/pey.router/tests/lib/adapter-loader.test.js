// Verifies router adapter selection, creation, and contract validation.

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRouterAdapter } from '../../lib/adapter-loader.js';
import { PLUGIN_NAME, ROUTER_ADAPTER_METHODS } from '../../lib/constants.js';

function createAdapter(overrides = {}) {
  return {
    getCurrentPath() {},
    pushEntry() {},
    replaceEntry() {},
    goBack() {},
    goForward() {},
    onExternalChange() {},
    ...overrides,
  };
}

test('should_return_adapter_when_identifier_is_supported', async () => {
  const adapter = createAdapter();
  const adapterLoaders = { TestAdapter: async () => adapter };

  const loadedAdapter = await loadRouterAdapter('TestAdapter', {}, adapterLoaders);

  assert.equal(loadedAdapter, adapter);
});

test('should_pass_adapter_config_when_supported_adapter_is_loaded', async () => {
  const adapterConfig = { mode: 'memory' };
  let receivedConfig;
  const adapterLoaders = {
    TestAdapter: async (config) => {
      receivedConfig = config;
      return createAdapter();
    },
  };

  await loadRouterAdapter('TestAdapter', adapterConfig, adapterLoaders);

  assert.equal(receivedConfig, adapterConfig);
});

test('should_reject_startup_error_when_identifier_is_unknown', async () => {
  await assert.rejects(
    loadRouterAdapter('UnknownAdapter', {}, {}),
    (error) => isStartupError(error, 'ROUTER_ADAPTER_NOT_FOUND'),
  );
});

test('should_reject_startup_error_when_identifier_is_not_string', async () => {
  await assert.rejects(
    loadRouterAdapter(null, {}, {}),
    (error) => isStartupError(error, 'ROUTER_ADAPTER_NOT_FOUND'),
  );
});

for (const methodName of ROUTER_ADAPTER_METHODS) {
  test(`should_reject_startup_error_when_adapter_omits_${methodName.toLowerCase()}`, async () => {
    const adapter = createAdapter({ [methodName]: undefined });
    const adapterLoaders = { IncompleteAdapter: async () => adapter };

    await assert.rejects(
      loadRouterAdapter('IncompleteAdapter', {}, adapterLoaders),
      (error) => isStartupError(error, 'ROUTER_ADAPTER_INVALID'),
    );
  });
}

test('should_normalize_raw_error_when_adapter_initialization_fails', async () => {
  const adapterLoaders = {
    BrokenAdapter: async () => {
      throw new Error('token=secret-value');
    },
  };

  await assert.rejects(
    loadRouterAdapter('BrokenAdapter', {}, adapterLoaders),
    (error) => isStartupError(error, 'ROUTER_ADAPTER_INITIALIZATION_FAILED')
      && JSON.stringify(error).includes('secret-value') === false
      && 'detail' in error === false,
  );
});

test('should_preserve_safe_metadata_when_structured_adapter_error_is_normalized', async () => {
  const adapterError = {
    code: 'BROWSER_HISTORY_UNAVAILABLE',
    message: 'Browser history is unavailable',
    source: 'pey.browser-history',
    type: 'startup',
    timestamp: new Date().toISOString(),
  };
  const adapterLoaders = {
    BrokenAdapter: async () => {
      throw adapterError;
    },
  };

  await assert.rejects(
    loadRouterAdapter('BrokenAdapter', {}, adapterLoaders),
    (error) => isStartupError(error, 'ROUTER_ADAPTER_INITIALIZATION_FAILED')
      && error.detail?.adapterCode === adapterError.code
      && error.detail?.adapterSource === adapterError.source,
  );
});

function isStartupError(error, code) {
  return error.code === code
    && error.source === PLUGIN_NAME
    && error.type === 'startup'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}
