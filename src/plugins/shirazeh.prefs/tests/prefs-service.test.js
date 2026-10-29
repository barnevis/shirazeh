// Verifies the preference service behavior with a fake storage service.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrefsService } from '../lib/prefs-service.js';

function createFakeStorage(records = new Map(), { failReads = false, failWrites = false } = {}) {
  const calls = [];
  return {
    calls,
    async read(collection, key) {
      calls.push(['read', collection, key]);
      if (failReads) {
        throw new Error('storage down');
      }
      return records.get(key) ?? null;
    },
    async write(collection, record) {
      calls.push(['write', collection, record]);
      if (failWrites) {
        throw new Error('storage down');
      }
      records.set(record.key, record);
    },
  };
}

function createBoundPrefs(storage, collection = 'prefs') {
  const prefs = createPrefsService({ collection });
  prefs.bindDependencies({ 'pey.storage.service': storage });
  return prefs;
}

test('should_return_stored_value_when_get_is_called', async () => {
  const storage = createFakeStorage(new Map([['theme', { key: 'theme', value: 'dark' }]]));
  const { service } = createBoundPrefs(storage);

  assert.equal(await service.get('theme'), 'dark');
  assert.deepEqual(storage.calls[0], ['read', 'prefs', 'theme']);
});

test('should_return_null_when_preference_is_missing', async () => {
  const { service } = createBoundPrefs(createFakeStorage());

  assert.equal(await service.get('theme'), null);
});

test('should_return_null_when_storage_read_fails', async () => {
  const { service } = createBoundPrefs(createFakeStorage(new Map(), { failReads: true }));

  assert.equal(await service.get('theme'), null);
});

test('should_write_record_when_set_is_called', async () => {
  const records = new Map();
  const { service } = createBoundPrefs(createFakeStorage(records));

  const result = await service.set('language', 'en');

  assert.equal(result, true);
  assert.deepEqual(records.get('language'), { key: 'language', value: 'en' });
});

test('should_return_false_when_storage_write_fails', async () => {
  const { service } = createBoundPrefs(createFakeStorage(new Map(), { failWrites: true }));

  assert.equal(await service.set('theme', 'dark'), false);
});

test('should_return_defaults_when_dependencies_are_not_bound', async () => {
  const prefs = createPrefsService({ collection: 'prefs' });

  assert.equal(await prefs.service.get('theme'), null);
  assert.equal(await prefs.service.set('theme', 'dark'), false);
});

test('should_reject_after_deactivation', async () => {
  const { service, deactivate } = createBoundPrefs(createFakeStorage());

  deactivate();
  assert.equal(await service.get('theme'), null);
  assert.equal(await service.set('theme', 'dark'), false);
});

test('should_use_configured_collection_when_different_from_default', async () => {
  const storage = createFakeStorage();
  const { service } = createBoundPrefs(storage, 'user-prefs');

  await service.set('theme', 'light');

  assert.deepEqual(storage.calls[0], ['write', 'user-prefs', { key: 'theme', value: 'light' }]);
});

test('should_return_defaults_when_key_is_invalid', async () => {
  const { service } = createBoundPrefs(createFakeStorage());

  assert.equal(await service.get(''), null);
  assert.equal(await service.set('', 'x'), false);
});

test('should_treat_record_without_value_field_as_missing', async () => {
  const storage = createFakeStorage(new Map([['odd', { key: 'odd' }]]));
  const { service } = createBoundPrefs(storage);

  assert.equal(await service.get('odd'), null);
});
