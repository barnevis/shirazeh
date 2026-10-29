// Verifies the in-memory Router adapter contract used by service tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import { defineRouterAdapterContract } from '../contracts/router-adapter-contract.js';
import { createInMemoryRouterAdapter } from './in-memory-router-adapter.js';

defineRouterAdapterContract('in_memory_adapter', createInMemoryRouterAdapter);

test('should_return_initial_path_when_fake_is_created', () => {
  const adapter = createInMemoryRouterAdapter('/initial?tab=one');

  assert.equal(adapter.getCurrentPath(), '/initial?tab=one');
});

test('should_push_new_entry_when_push_entry_is_called', () => {
  const adapter = createInMemoryRouterAdapter('/initial');

  adapter.pushEntry('/next');

  assert.equal(adapter.getCurrentPath(), '/next');
});

test('should_replace_current_entry_when_replace_entry_is_called', () => {
  const adapter = createInMemoryRouterAdapter('/initial');

  adapter.replaceEntry('/replaced');

  assert.equal(adapter.getCurrentPath(), '/replaced');
});

test('should_truncate_forward_entries_when_new_entry_is_pushed_after_back', () => {
  const adapter = createInMemoryRouterAdapter('/one');
  adapter.pushEntry('/two');
  adapter.pushEntry('/three');
  adapter.goBack();
  adapter.pushEntry('/new-three');
  adapter.goForward();

  assert.equal(adapter.getCurrentPath(), '/new-three');
});

test('should_notify_when_external_change_is_simulated', () => {
  const adapter = createInMemoryRouterAdapter('/one');
  const paths = [];
  adapter.onExternalChange((path) => paths.push(path));

  adapter.simulateExternalChange('/external?tab=details');

  assert.deepEqual(paths, ['/external?tab=details']);
});

test('should_stop_notifying_after_unsubscribe', () => {
  const adapter = createInMemoryRouterAdapter('/one');
  const paths = [];
  const unsubscribe = adapter.onExternalChange((path) => paths.push(path));

  unsubscribe();
  adapter.simulateExternalChange('/external');

  assert.deepEqual(paths, []);
});

test('should_reject_non_string_path_when_fake_path_is_written', () => {
  const adapter = createInMemoryRouterAdapter();

  assert.throws(() => adapter.pushEntry(null), TypeError);
  assert.throws(() => adapter.replaceEntry({}), TypeError);
});
