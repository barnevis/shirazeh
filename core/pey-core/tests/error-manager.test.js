// Tests for ErrorManager — verifies PeyError structure, error types, and core error events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_TYPE,
  CORE_ERROR_EVENTS,
  createPeyError,
  hasStandardStructure,
  hasNoSensitiveData,
  createCoreErrorEvent,
} from '../src/error-manager.js';

test('createPeyError creates an error with all required fields', () => {
  const error = createPeyError({
    code: 'PLUGIN_LOAD_FAILED',
    message: 'Plugin failed to load',
    source: 'core',
    type: ERROR_TYPE.STARTUP,
  });

  assert.equal(error.code, 'PLUGIN_LOAD_FAILED');
  assert.equal(error.message, 'Plugin failed to load');
  assert.equal(error.source, 'core');
  assert.equal(error.type, ERROR_TYPE.STARTUP);
  assert.ok(typeof error.timestamp === 'string');
  assert.equal(error.detail, null);
});

test('createPeyError includes optional detail when provided', () => {
  const error = createPeyError({
    code: 'VALIDATION_FAILED',
    message: 'Manifest invalid',
    source: 'core',
    type: ERROR_TYPE.STARTUP,
    detail: { field: 'name', reason: 'missing' },
  });

  assert.deepEqual(error.detail, { field: 'name', reason: 'missing' });
});

test('createPeyError throws if code is missing', () => {
  assert.throws(
    () => createPeyError({ message: 'msg', source: 'core', type: ERROR_TYPE.STARTUP }),
    { message: /code/ },
  );
});

test('createPeyError throws if message is missing', () => {
  assert.throws(
    () => createPeyError({ code: 'CODE', source: 'core', type: ERROR_TYPE.STARTUP }),
    { message: /message/ },
  );
});

test('createPeyError throws if source is missing', () => {
  assert.throws(
    () => createPeyError({ code: 'CODE', message: 'msg', type: ERROR_TYPE.STARTUP }),
    { message: /source/ },
  );
});

test('createPeyError throws if type is missing', () => {
  assert.throws(
    () => createPeyError({ code: 'CODE', message: 'msg', source: 'core' }),
    { message: /type/ },
  );
});

test('createPeyError throws if type is not a valid ERROR_TYPE', () => {
  assert.throws(
    () => createPeyError({ code: 'CODE', message: 'msg', source: 'core', type: 'invalid' }),
    { message: /type/ },
  );
});

test('createPeyError accepts all three error types', () => {
  for (const type of Object.values(ERROR_TYPE)) {
    const error = createPeyError({
      code: 'CODE',
      message: 'msg',
      source: 'core',
      type,
    });
    assert.equal(error.type, type);
  }
});

test('hasStandardStructure returns true for a valid error', () => {
  const error = createPeyError({
    code: 'CODE',
    message: 'msg',
    source: 'core',
    type: ERROR_TYPE.CRITICAL,
  });

  assert.equal(hasStandardStructure(error), true);
});

test('hasStandardStructure returns false for null', () => {
  assert.equal(hasStandardStructure(null), false);
});

test('hasStandardStructure returns false for a non-object', () => {
  assert.equal(hasStandardStructure('not an error'), false);
});

test('hasStandardStructure returns false when a required field is missing', () => {
  assert.equal(hasStandardStructure({ code: 'X', message: 'm', source: 's', type: 'startup' }), false);
});

test('hasStandardStructure returns false when type is invalid', () => {
  assert.equal(
    hasStandardStructure({
      code: 'X',
      message: 'm',
      source: 's',
      type: 'bogus',
      timestamp: '2026-01-01T00:00:00Z',
    }),
    false,
  );
});

test('hasStandardStructure returns false when a field is empty', () => {
  assert.equal(
    hasStandardStructure({
      code: '',
      message: 'm',
      source: 's',
      type: 'startup',
      timestamp: '2026-01-01T00:00:00Z',
    }),
    false,
  );
});

test('hasNoSensitiveData returns true for clean error', () => {
  const error = createPeyError({
    code: 'CODE',
    message: 'plugin failed to start',
    source: 'core',
    type: ERROR_TYPE.STARTUP,
  });

  assert.equal(hasNoSensitiveData(error), true);
});

test('hasNoSensitiveData returns false when message contains "password"', () => {
  assert.equal(
    hasNoSensitiveData({
      code: 'X',
      message: 'user password is wrong',
      source: 'core',
      type: 'startup',
      timestamp: '2026-01-01T00:00:00Z',
    }),
    false,
  );
});

test('hasNoSensitiveData returns false when detail contains a token', () => {
  assert.equal(
    hasNoSensitiveData({
      code: 'X',
      message: 'clean message',
      source: 'core',
      type: 'startup',
      timestamp: '2026-01-01T00:00:00Z',
      detail: { token: 'abc123' },
    }),
    false,
  );
});

test('hasNoSensitiveData returns false when detail contains an api key', () => {
  assert.equal(
    hasNoSensitiveData({
      code: 'X',
      message: 'clean message',
      source: 'core',
      type: 'startup',
      timestamp: '2026-01-01T00:00:00Z',
      detail: 'the apiKey was rejected',
    }),
    false,
  );
});

test('CORE_ERROR_EVENTS contains all five core error events', () => {
  assert.equal(CORE_ERROR_EVENTS.PLUGIN_FAILED, 'core:plugin-failed');
  assert.equal(CORE_ERROR_EVENTS.PLUGIN_CRASHED, 'core:plugin-crashed');
  assert.equal(CORE_ERROR_EVENTS.UI_FAILED, 'core:ui-failed');
  assert.equal(CORE_ERROR_EVENTS.STARTUP_FAILED, 'core:startup-failed');
  assert.equal(CORE_ERROR_EVENTS.SERVICE_UNAVAILABLE, 'core:service-unavailable');
});

test('createCoreErrorEvent builds the correct event payload', () => {
  const event = createCoreErrorEvent(CORE_ERROR_EVENTS.PLUGIN_FAILED, {
    pluginName: 'acme.foo',
    code: 'INVALID_MANIFEST',
  });

  assert.equal(event.type, 'core:plugin-failed');
  assert.deepEqual(event.data, { pluginName: 'acme.foo', code: 'INVALID_MANIFEST' });
});

test('timestamp is a valid ISO 8601 string', () => {
  const error = createPeyError({
    code: 'CODE',
    message: 'msg',
    source: 'core',
    type: ERROR_TYPE.OPERATIONAL,
  });

  const parsed = new Date(error.timestamp);
  assert.ok(!Number.isNaN(parsed.getTime()));
});
