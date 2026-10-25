// Verifies safe standard errors at the router plugin boundary.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_CODES, PLUGIN_NAME } from '../../lib/constants.js';
import { createRouterError, normalizeAdapterError } from '../../lib/error.js';

const PLUGIN_ERROR_CODES = [
  ERROR_CODES.MALFORMED_PATH,
  ERROR_CODES.MALFORMED_PATTERN,
  ERROR_CODES.MALFORMED_QUERY,
  ERROR_CODES.NAVIGATION_FAILED,
];

for (const errorCode of PLUGIN_ERROR_CODES) {
  test(`should_create_standard_error_when_code_is_${errorCode.toLowerCase()}`, () => {
    const error = createRouterError(errorCode, 'Safe router error');

    assert.deepEqual(Object.keys(error), ['code', 'message', 'source', 'type', 'timestamp']);
    assert.equal(error.code, errorCode);
    assert.equal(error.message, 'Safe router error');
    assert.equal(error.source, PLUGIN_NAME);
    assert.equal(error.type, 'operational');
    assert.equal(Number.isNaN(Date.parse(error.timestamp)), false);
  });
}

test('should_preserve_requested_type_when_router_error_is_created', () => {
  const error = createRouterError('ROUTER_STARTUP_FAILED', 'Router startup failed', 'startup');

  assert.equal(error.type, 'startup');
});

test('should_keep_malformed_path_and_query_distinct_when_errors_are_created', () => {
  const pathError = createRouterError(ERROR_CODES.MALFORMED_PATH, 'Path is not valid');
  const queryError = createRouterError(ERROR_CODES.MALFORMED_QUERY, 'Query value is not valid');

  assert.equal(pathError.code, ERROR_CODES.MALFORMED_PATH);
  assert.equal(queryError.code, ERROR_CODES.MALFORMED_QUERY);
  assert.notEqual(pathError.code, queryError.code);
});

test('should_reject_unsupported_type_when_router_error_is_created', () => {
  assert.throws(
    () => createRouterError(ERROR_CODES.NAVIGATION_FAILED, 'Router failed', 'unknown'),
    TypeError,
  );
});

test('should_normalize_structured_error_when_adapter_operation_fails', () => {
  const adapterError = {
    code: 'BROWSER_HISTORY_FAILED',
    message: 'Browser history failed',
    source: 'pey.browser-history',
    type: 'operational',
    timestamp: new Date().toISOString(),
  };

  const error = normalizeAdapterError(adapterError);

  assert.equal(error.code, ERROR_CODES.NAVIGATION_FAILED);
  assert.equal(error.message, 'Router adapter operation failed');
  assert.equal(error.source, PLUGIN_NAME);
  assert.equal(error.type, 'operational');
  assert.deepEqual(error.detail, {
    adapterCode: adapterError.code,
    adapterSource: adapterError.source,
  });
});

test('should_preserve_fatal_flag_when_structured_adapter_error_is_normalized', () => {
  const adapterError = {
    code: 'BROWSER_HISTORY_DESTROYED',
    message: 'Browser history context destroyed',
    source: 'pey.browser-history',
    type: 'operational',
    timestamp: new Date().toISOString(),
    detail: { fatal: true },
  };

  const error = normalizeAdapterError(adapterError);

  assert.equal(error.code, ERROR_CODES.NAVIGATION_FAILED);
  assert.deepEqual(error.detail, {
    adapterCode: adapterError.code,
    adapterSource: adapterError.source,
    fatal: true,
  });
});

test('should_remove_sensitive_data_when_raw_adapter_error_is_normalized', () => {
  const sensitiveValue = 'token=secret-value';
  const adapterError = new Error(`Navigation failed at /account?${sensitiveValue}`);

  const error = normalizeAdapterError(adapterError);
  const serializedError = JSON.stringify(error);

  assert.equal(serializedError.includes(sensitiveValue), false);
  assert.equal('detail' in error, false);
  assert.equal('stack' in error, false);
});

test('should_remove_untrusted_metadata_when_adapter_error_is_not_structured', () => {
  const adapterError = {
    code: 'invalid code with token=secret-value',
    message: 'Navigation failed at /account?token=secret-value',
    source: 'invalid source',
    type: 'operational',
    timestamp: new Date().toISOString(),
  };

  const error = normalizeAdapterError(adapterError);
  const serializedError = JSON.stringify(error);

  assert.equal(serializedError.includes('secret-value'), false);
  assert.equal('detail' in error, false);
});

test('should_use_requested_contract_when_adapter_error_is_normalized', () => {
  const error = normalizeAdapterError(
    new Error('Unknown adapter'),
    'ROUTER_ADAPTER_NOT_FOUND',
    'Configured router adapter is not supported',
    'startup',
  );

  assert.equal(error.code, 'ROUTER_ADAPTER_NOT_FOUND');
  assert.equal(error.message, 'Configured router adapter is not supported');
  assert.equal(error.type, 'startup');
});
