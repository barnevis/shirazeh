// Verifies router path, query, and base-path transformations.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_CODES, PLUGIN_NAME } from '../../lib/constants.js';
import {
  parseQuery,
  prependBasePath,
  serializeQuery,
  splitPath,
  stripBasePath,
  validatePath,
} from '../../lib/path-utils.js';

test('should_split_path_when_query_is_present', () => {
  assert.deepEqual(splitPath('/accounts/42?tab=details'), {
    path: '/accounts/42',
    queryString: 'tab=details',
  });
});

test('should_return_empty_query_when_path_has_no_query', () => {
  assert.deepEqual(splitPath('/accounts/42'), {
    path: '/accounts/42',
    queryString: '',
  });
});

test('should_parse_query_when_values_are_encoded', () => {
  assert.deepEqual(parseQuery('term=hello+world&section=recent%20items'), {
    term: 'hello world',
    section: 'recent items',
  });
});

test('should_keep_last_value_when_query_key_is_repeated', () => {
  assert.deepEqual(parseQuery('tab=summary&tab=details'), { tab: 'details' });
});

test('should_return_empty_object_when_query_is_empty', () => {
  assert.deepEqual(parseQuery(), {});
});

test('should_throw_standard_error_when_query_encoding_is_invalid', () => {
  assert.throws(() => parseQuery('term=%E0%A4%A'), isMalformedPathError);
});

test('should_parse_special_object_key_when_query_contains_proto_name', () => {
  const query = parseQuery('__proto__=safe');

  assert.equal(Object.prototype.hasOwnProperty.call(query, '__proto__'), true);
  assert.equal(query.__proto__, 'safe');
});

test('should_serialize_query_when_values_need_encoding', () => {
  assert.equal(serializeQuery({ term: 'hello world' }), '?term=hello+world');
});

test('should_serialize_number_when_query_contains_number', () => {
  assert.equal(serializeQuery({ page: 2 }), '?page=2');
});

test('should_serialize_boolean_when_query_contains_boolean', () => {
  assert.equal(serializeQuery({ archived: false, active: true }), '?archived=false&active=true');
});

test('should_omit_value_when_query_contains_undefined', () => {
  assert.equal(serializeQuery({ tab: undefined, page: 2 }), '?page=2');
});

test('should_throw_standard_error_when_query_value_is_complex', () => {
  for (const value of [null, ['details'], { tab: 'details' }]) {
    assert.throws(() => serializeQuery({ tab: value }), isMalformedQueryError);
  }
});

test('should_return_empty_string_when_query_is_empty', () => {
  assert.equal(serializeQuery(), '');
});

test('should_strip_nested_base_path_when_raw_path_is_inside_base', () => {
  assert.equal(stripBasePath('/application/accounts?tab=details', '/application'), '/accounts?tab=details');
});

test('should_return_root_when_raw_path_equals_base_path', () => {
  assert.equal(stripBasePath('/application', '/application'), '/');
});

test('should_return_root_with_query_when_raw_path_equals_base_path', () => {
  assert.equal(stripBasePath('/application?tab=details', '/application'), '/?tab=details');
});

test('should_preserve_path_when_base_path_is_root', () => {
  assert.equal(stripBasePath('/accounts?tab=details', '/'), '/accounts?tab=details');
});

test('should_return_null_when_raw_path_is_outside_base_path', () => {
  assert.equal(stripBasePath('/application-two/accounts', '/application'), null);
});

test('should_return_null_when_raw_path_with_query_is_outside_base_path', () => {
  assert.equal(stripBasePath('/other/page?tab=x', '/application'), null);
});

test('should_prepend_nested_base_path_when_path_is_relative_to_application', () => {
  assert.equal(prependBasePath('/accounts?tab=details', '/application'), '/application/accounts?tab=details');
});

test('should_prepend_base_without_trailing_slash_when_path_is_root', () => {
  assert.equal(prependBasePath('/', '/application/'), '/application');
});

test('should_preserve_path_when_prepended_base_path_is_root', () => {
  assert.equal(prependBasePath('/accounts', '/'), '/accounts');
});

test('should_throw_standard_error_when_path_is_empty', () => {
  assert.throws(() => validatePath(''), isMalformedPathError);
});

test('should_throw_standard_error_when_path_is_not_absolute', () => {
  assert.throws(() => validatePath('accounts/42'), isMalformedPathError);
});

test('should_throw_standard_error_when_path_encoding_is_invalid', () => {
  assert.throws(() => validatePath('/accounts/%E0%A4%A'), isMalformedPathError);
});

test('should_throw_standard_error_when_query_input_is_not_object', () => {
  assert.throws(() => serializeQuery('tab=details'), isMalformedQueryError);
});

function isMalformedPathError(error) {
  return error.code === ERROR_CODES.MALFORMED_PATH
    && error.source === PLUGIN_NAME
    && error.type === 'operational'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}

function isMalformedQueryError(error) {
  return error.code === ERROR_CODES.MALFORMED_QUERY
    && error.source === PLUGIN_NAME
    && error.type === 'operational'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}
