// Verifies the parsneshan extension bundle built from configuration flags.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createParsneshanOptions } from '../lib/parsneshan-extensions.js';

test('should_enable_all_extensions_when_config_is_undefined', () => {
  const options = createParsneshanOptions(undefined);

  assert.equal(options.syntaxExtensions.length, 7);
  assert.equal(options.htmlExtensions.length, 7);
  assert.equal(options.footnoteOptions.label, 'پاورقی');
});

test('should_enable_all_extensions_when_config_flags_are_true', () => {
  const options = createParsneshanOptions({
    admonitions: true,
    persianList: true,
    persianPoem: true,
    persianFootnote: true,
  });

  assert.equal(options.syntaxExtensions.length, 7);
  assert.equal(options.footnoteOptions !== null, true);
});

test('should_disable_admonitions_when_flag_is_false', () => {
  const options = createParsneshanOptions({ admonitions: false });

  assert.equal(options.syntaxExtensions.length, 2);
  assert.equal(options.htmlExtensions.length, 2);
  assert.equal(options.footnoteOptions !== null, true);
});

test('should_disable_footnote_options_when_flag_is_false', () => {
  const options = createParsneshanOptions({ persianFootnote: false });

  assert.equal(options.syntaxExtensions.length, 7);
  assert.equal(options.footnoteOptions, null);
});

test('should_disable_everything_when_all_flags_are_false', () => {
  const options = createParsneshanOptions({
    admonitions: false,
    persianList: false,
    persianPoem: false,
    persianFootnote: false,
  });

  assert.deepEqual(options.syntaxExtensions, []);
  assert.deepEqual(options.htmlExtensions, []);
  assert.equal(options.footnoteOptions, null);
});

test('should_ignore_non_object_config_when_flags_are_read', () => {
  const options = createParsneshanOptions('oops');

  assert.equal(options.syntaxExtensions.length, 7);
});

test('should_produce_distinct_extension_instances_when_called_twice', () => {
  const first = createParsneshanOptions(undefined);
  const second = createParsneshanOptions(undefined);

  assert.notEqual(first.syntaxExtensions[0], second.syntaxExtensions[0]);
});
