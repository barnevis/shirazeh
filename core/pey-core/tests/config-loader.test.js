// Tests for ConfigLoader — verifies config validation, envSource validation,
// env var substitution via envSource, and config merge.
// The Core is platform-neutral: no file reads, no process.env.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, substituteEnvVars, mergePluginConfig } from '../src/config-loader.js';

/**
 * Creates a fake env source that returns values from a plain object.
 *
 * @param {object} vars - The environment variables to expose.
 * @returns {object} An envSource with a get(varName) method.
 */
function createEnvSource(vars) {
  return {
    get(name) {
      return vars[name];
    },
  };
}

function createValidConfig() {
  return {
    architecture: '0.5',
    core: { name: 'pey.core', version: '0.1.0' },
    adapters: { storage: 'IndexedDBAdapter' },
    ui: { path: './ui' },
    plugins: [{ name: 'acme.foo', version: '1.0.0', path: './plugins/foo' }],
    config: { 'acme.foo': { timeout: 5000 } },
    app: { name: 'Test App', version: '1.0.0' },
  };
}

test('load returns a valid config when all sections are present', () => {
  const envSource = createEnvSource({});
  const config = load(createValidConfig(), envSource);

  assert.equal(config.architecture, '0.5');
  assert.equal(config.core.name, 'pey.core');
  assert.equal(config.plugins[0].name, 'acme.foo');
});

test('load throws CONFIG_FILE_MISSING when configContent is null', () => {
  assert.throws(
    () => load(null, createEnvSource({})),
    (error) => error.code === 'CONFIG_FILE_MISSING',
  );
});

test('load throws CONFIG_FILE_MISSING when configContent is undefined', () => {
  assert.throws(
    () => load(undefined, createEnvSource({})),
    (error) => error.code === 'CONFIG_FILE_MISSING',
  );
});

test('load throws CONFIG_FILE_MISSING when configContent is an array', () => {
  assert.throws(
    () => load([1, 2, 3], createEnvSource({})),
    (error) => error.code === 'CONFIG_FILE_MISSING',
  );
});

test('load throws CONFIG_FILE_INVALID when a required section is missing', () => {
  const incomplete = createValidConfig();
  delete incomplete.adapters;
  assert.throws(
    () => load(incomplete, createEnvSource({})),
    (error) => error.code === 'CONFIG_FILE_INVALID',
  );
});

test('load throws INVALID_ENV_SOURCE when envSource is null', () => {
  assert.throws(
    () => load(createValidConfig(), null),
    (error) => error.code === 'INVALID_ENV_SOURCE',
  );
});

test('load throws INVALID_ENV_SOURCE when envSource is undefined', () => {
  assert.throws(
    () => load(createValidConfig(), undefined),
    (error) => error.code === 'INVALID_ENV_SOURCE',
  );
});

test('load throws INVALID_ENV_SOURCE when envSource lacks a get method', () => {
  assert.throws(
    () => load(createValidConfig(), { values: {} }),
    (error) => error.code === 'INVALID_ENV_SOURCE',
  );
});

test('load throws INVALID_ENV_SOURCE when envSource is an array', () => {
  assert.throws(
    () => load(createValidConfig(), []),
    (error) => error.code === 'INVALID_ENV_SOURCE',
  );
});

test('substituteEnvVars replaces a ${VAR_NAME} string with the env value', () => {
  const envSource = createEnvSource({ TEST_CONFIG_KEY: 'secret-value' });
  const result = substituteEnvVars({ apiKey: '${TEST_CONFIG_KEY}' }, envSource);

  assert.equal(result.apiKey, 'secret-value');
});

test('substituteEnvVars throws ENV_VAR_MISSING when env var is not defined', () => {
  const envSource = createEnvSource({});
  assert.throws(
    () => substituteEnvVars({ key: '${UNDEFINED_TEST_VAR}' }, envSource),
    (error) => error.code === 'ENV_VAR_MISSING',
  );
});

test('substituteEnvVars returns non-placeholder strings unchanged', () => {
  const envSource = createEnvSource({});
  const result = substituteEnvVars({ name: 'plain-string' }, envSource);

  assert.equal(result.name, 'plain-string');
});

test('substituteEnvVars returns non-string values unchanged', () => {
  const envSource = createEnvSource({});
  const result = substituteEnvVars({ port: 8080, enabled: true, nothing: null }, envSource);

  assert.equal(result.port, 8080);
  assert.equal(result.enabled, true);
  assert.equal(result.nothing, null);
});

test('substituteEnvVars substitutes nested objects recursively', () => {
  const envSource = createEnvSource({ TEST_NESTED_VAR: 'nested-value' });
  const result = substituteEnvVars(
    { config: { payment: { apiKey: '${TEST_NESTED_VAR}' } } },
    envSource,
  );

  assert.equal(result.config.payment.apiKey, 'nested-value');
});

test('substituteEnvVars substitutes values inside arrays', () => {
  const envSource = createEnvSource({ TEST_ARRAY_VAR: 'array-value' });
  const result = substituteEnvVars({ items: ['${TEST_ARRAY_VAR}', 'plain'] }, envSource);

  assert.equal(result.items[0], 'array-value');
  assert.equal(result.items[1], 'plain');
});

test('substituteEnvVars handles the { env, required: true } object form', () => {
  const envSource = createEnvSource({ TEST_REQUIRED_VAR: 'required-value' });
  const result = substituteEnvVars(
    { apiKey: { env: '${TEST_REQUIRED_VAR}', required: true } },
    envSource,
  );

  assert.equal(result.apiKey, 'required-value');
});

test('substituteEnvVars throws ENV_VAR_REQUIRED_MISSING when required env var is absent', () => {
  const envSource = createEnvSource({});
  assert.throws(
    () => substituteEnvVars({ apiKey: { env: '${MISSING_REQUIRED_VAR}', required: true } }, envSource),
    (error) => error.code === 'ENV_VAR_REQUIRED_MISSING',
  );
});

test('substituteEnvVars always returns strings for substituted values', () => {
  const envSource = createEnvSource({ TEST_NUMBER_VAR: '42' });
  const result = substituteEnvVars({ count: '${TEST_NUMBER_VAR}' }, envSource);

  assert.equal(result.count, '42');
  assert.equal(typeof result.count, 'string');
});

test('load substitutes env vars during the load flow', () => {
  const envSource = createEnvSource({ PAYMENT_API_KEY: 'key-123' });
  const config = createValidConfig();
  config.config['acme.payment'] = { apiKey: '${PAYMENT_API_KEY}' };

  const result = load(config, envSource);
  assert.equal(result.config['acme.payment'].apiKey, 'key-123');
});

test('mergePluginConfig returns manifest defaults when no project config exists', () => {
  const defaults = { timeout: 3000, retries: 3 };
  const result = mergePluginConfig(defaults, null);

  assert.deepEqual(result, { timeout: 3000, retries: 3 });
});

test('mergePluginConfig returns project config when no manifest defaults exist', () => {
  const result = mergePluginConfig(null, { timeout: 5000 });
  assert.deepEqual(result, { timeout: 5000 });
});

test('mergePluginConfig overrides manifest defaults with project values', () => {
  const defaults = { timeout: 3000, retries: 3 };
  const project = { timeout: 5000 };
  const result = mergePluginConfig(defaults, project);

  assert.equal(result.timeout, 5000);
  assert.equal(result.retries, 3);
});

test('mergePluginConfig deep-merges nested objects', () => {
  const defaults = { db: { host: 'localhost', port: 5432 } };
  const project = { db: { port: 5433 } };
  const result = mergePluginConfig(defaults, project);

  assert.equal(result.db.host, 'localhost');
  assert.equal(result.db.port, 5433);
});

test('mergePluginConfig does not mutate the original manifest defaults', () => {
  const defaults = { timeout: 3000 };
  mergePluginConfig(defaults, { timeout: 5000 });

  assert.equal(defaults.timeout, 3000);
});

test('mergePluginConfig throws INVALID_PLUGIN_CONFIG when projectConfig is a number', () => {
  assert.throws(
    () => mergePluginConfig({ timeout: 3000 }, 42),
    (error) => error.code === 'INVALID_PLUGIN_CONFIG',
  );
});

test('mergePluginConfig throws INVALID_PLUGIN_CONFIG when projectConfig is a string', () => {
  assert.throws(
    () => mergePluginConfig({ timeout: 3000 }, 'not-a-config'),
    (error) => error.code === 'INVALID_PLUGIN_CONFIG',
  );
});

test('mergePluginConfig throws INVALID_PLUGIN_CONFIG when projectConfig is an array', () => {
  assert.throws(
    () => mergePluginConfig({ timeout: 3000 }, [1, 2, 3]),
    (error) => error.code === 'INVALID_PLUGIN_CONFIG',
  );
});
