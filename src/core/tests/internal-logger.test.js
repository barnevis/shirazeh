// Tests for InternalLogger — verifies Core logging operations and privacy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInternalLogger, LOG_LEVEL } from '../src/internal-logger.js';

test('logs an info message with level, timestamp, and message', () => {
  const logger = createInternalLogger();
  logger.info('plugin started', { pluginName: 'acme.foo' });

  const entries = logger.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, LOG_LEVEL.INFO);
  assert.equal(entries[0].message, 'plugin started');
  assert.deepEqual(entries[0].context, { pluginName: 'acme.foo' });
  assert.ok(typeof entries[0].timestamp === 'string');
  assert.ok(entries[0].timestamp.length > 0);
});

test('logs a warn message with the correct level', () => {
  const logger = createInternalLogger();
  logger.warn('optional dependency missing');

  const entries = logger.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, LOG_LEVEL.WARN);
});

test('logs an error message with the correct level', () => {
  const logger = createInternalLogger();
  logger.error('plugin failed to start', { code: 'INVALID_MANIFEST' });

  const entries = logger.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, LOG_LEVEL.ERROR);
  assert.deepEqual(entries[0].context, { code: 'INVALID_MANIFEST' });
});

test('logs a security event with the correct level', () => {
  const logger = createInternalLogger();
  logger.security('unauthorized service access', {
    pluginName: 'acme.foo',
    serviceName: 'acme.bar.service',
  });

  const entries = logger.getEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].level, LOG_LEVEL.SECURITY);
});

test('context defaults to null when not provided', () => {
  const logger = createInternalLogger();
  logger.info('core ready');

  const entries = logger.getEntries();
  assert.equal(entries[0].context, null);
});

test('preserves the order of log entries', () => {
  const logger = createInternalLogger();
  logger.info('first');
  logger.warn('second');
  logger.error('third');

  const entries = logger.getEntries();
  assert.equal(entries.length, 3);
  assert.equal(entries[0].message, 'first');
  assert.equal(entries[1].message, 'second');
  assert.equal(entries[2].message, 'third');
});

test('getEntries returns a copy, not the internal array', () => {
  const logger = createInternalLogger();
  logger.info('message');

  const first = logger.getEntries();
  const second = logger.getEntries();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
});

test('timestamp is a valid ISO 8601 string', () => {
  const logger = createInternalLogger();
  logger.info('test');

  const entries = logger.getEntries();
  const parsed = new Date(entries[0].timestamp);
  assert.ok(!Number.isNaN(parsed.getTime()));
});

test('multiple loggers are independent instances', () => {
  const loggerA = createInternalLogger();
  const loggerB = createInternalLogger();

  loggerA.info('in A');
  loggerB.info('in B');

  assert.equal(loggerA.getEntries().length, 1);
  assert.equal(loggerB.getEntries().length, 1);
  assert.equal(loggerA.getEntries()[0].message, 'in A');
  assert.equal(loggerB.getEntries()[0].message, 'in B');
});
