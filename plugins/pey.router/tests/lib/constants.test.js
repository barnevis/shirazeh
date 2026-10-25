import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  ERROR_CODES,
  EVENT_NAMES,
  NAVIGATION_FAILURE_REASONS,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  ROUTER_ADAPTER_METHODS,
  SERVICE_NAME,
} from '../../lib/constants.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'));
const service = manifest.provides.find((entry) => entry.name === SERVICE_NAME);

test('should_export_plugin_identity_when_constants_are_loaded', () => {
  assert.equal(PLUGIN_NAME, manifest.name);
  assert.equal(PLUGIN_VERSION, manifest.version);
});

test('should_export_service_name_when_constants_are_loaded', () => {
  assert.equal(service?.name, SERVICE_NAME);
});

test('should_match_declared_events_when_contract_constants_are_loaded', () => {
  const eventNames = Object.values(EVENT_NAMES);
  assert.deepEqual(eventNames, manifest.events.map((event) => event.name));
});

test('should_match_declared_error_codes_when_contract_constants_are_loaded', () => {
  const errorCodes = [
    ERROR_CODES.MALFORMED_PATH,
    ERROR_CODES.MALFORMED_PATTERN,
    ERROR_CODES.MALFORMED_QUERY,
    ERROR_CODES.NAVIGATION_FAILED,
  ];
  const declaredErrors = new Set(service.methods.flatMap((method) => method.errors));
  assert.deepEqual(new Set(errorCodes), declaredErrors);
});

test('should_keep_malformed_path_and_query_distinct_when_contract_constants_are_loaded', () => {
  assert.equal(ERROR_CODES.MALFORMED_PATH, 'ROUTER_MALFORMED_PATH');
  assert.equal(ERROR_CODES.MALFORMED_QUERY, 'ROUTER_MALFORMED_QUERY');
  assert.notEqual(ERROR_CODES.MALFORMED_PATH, ERROR_CODES.MALFORMED_QUERY);
});

test('should_export_runtime_critical_error_when_contract_constants_are_loaded', () => {
  assert.equal(ERROR_CODES.EXTERNAL_CHANGE_FAILED, 'ROUTER_EXTERNAL_CHANGE_FAILED');
});

test('should_match_navigation_failure_reason_when_contract_constants_are_loaded', () => {
  assert.equal(NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND, 'ROUTE_NOT_FOUND');
});

test('should_match_adapter_methods_when_contract_constants_are_loaded', () => {
  assert.deepEqual(ROUTER_ADAPTER_METHODS, [
    'getCurrentPath',
    'pushEntry',
    'replaceEntry',
    'goBack',
    'goForward',
    'onExternalChange',
  ]);
});
