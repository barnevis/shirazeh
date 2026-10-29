// Verifies route-pattern validation and path matching behavior.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_CODES, PLUGIN_NAME } from '../../lib/constants.js';
import { matchRoute, validatePattern } from '../../lib/route-matcher.js';

test('should_match_static_route_when_path_is_equal', () => {
  assert.deepEqual(matchRoute('/accounts', '/accounts'), { params: {} });
});

test('should_match_root_route_when_path_is_root', () => {
  assert.deepEqual(matchRoute('/', '/'), { params: {} });
});

test('should_extract_parameter_when_parameterized_route_matches', () => {
  assert.deepEqual(matchRoute('/accounts/:id', '/accounts/42'), {
    params: { id: '42' },
  });
});

test('should_accept_parameter_name_when_name_uses_no_defined_restriction', () => {
  assert.deepEqual(matchRoute('/accounts/:account-id', '/accounts/42'), {
    params: { 'account-id': '42' },
  });
});

test('should_extract_multiple_parameters_when_parameterized_route_matches', () => {
  assert.deepEqual(matchRoute('/accounts/:accountId/items/:itemId', '/accounts/7/items/9'), {
    params: { accountId: '7', itemId: '9' },
  });
});

test('should_decode_parameter_when_encoded_path_matches', () => {
  assert.deepEqual(matchRoute('/search/:term', '/search/hello%20world'), {
    params: { term: 'hello world' },
  });
});

test('should_ignore_query_when_path_is_matched', () => {
  assert.deepEqual(matchRoute('/accounts/:id', '/accounts/42?tab=details'), {
    params: { id: '42' },
  });
});

test('should_return_null_when_static_segment_differs', () => {
  assert.equal(matchRoute('/accounts/:id', '/users/42'), null);
});

test('should_return_null_when_segment_count_differs', () => {
  assert.equal(matchRoute('/accounts/:id', '/accounts/42/details'), null);
});

test('should_return_null_when_path_is_not_absolute', () => {
  assert.equal(matchRoute('/accounts/:id', 'accounts/42'), null);
});

test('should_return_null_when_parameter_encoding_is_invalid', () => {
  assert.equal(matchRoute('/search/:term', '/search/%E0%A4%A'), null);
});

test('should_throw_standard_error_when_pattern_is_empty', () => {
  assert.throws(() => matchRoute('', '/accounts'), isMalformedPatternError);
});

test('should_throw_standard_error_when_parameter_name_is_malformed', () => {
  assert.throws(() => matchRoute('/accounts/:', '/accounts/42'), isMalformedPatternError);
});

test('should_throw_standard_error_when_parameter_name_is_duplicated', () => {
  assert.throws(() => validatePattern('/:id/items/:id'), isMalformedPatternError);
});

test('should_throw_standard_error_when_pattern_contains_query', () => {
  assert.throws(() => validatePattern('/accounts?tab=active'), isMalformedPatternError);
});

test('should_throw_standard_error_when_pattern_uses_unsupported_syntax', () => {
  for (const pattern of ['/accounts/{id}', '/accounts/*', '/accounts/(id)']) {
    assert.throws(() => validatePattern(pattern), isMalformedPatternError);
  }
});

test('should_throw_standard_error_when_pattern_contains_empty_segment', () => {
  assert.throws(() => validatePattern('/accounts//details'), isMalformedPatternError);
});

test('should_throw_standard_error_when_pattern_has_trailing_slash', () => {
  assert.throws(() => validatePattern('/accounts/'), isMalformedPatternError);
});

function isMalformedPatternError(error) {
  return error.code === ERROR_CODES.MALFORMED_PATTERN
    && error.source === PLUGIN_NAME
    && error.type === 'operational'
    && Number.isNaN(Date.parse(error.timestamp)) === false;
}
