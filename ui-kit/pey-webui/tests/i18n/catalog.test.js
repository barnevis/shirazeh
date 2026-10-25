// Verifies the kit-owned translation catalog contract.

import assert from 'node:assert/strict';
import test from 'node:test';

import { KIT_LANGUAGE_DEFAULT, KIT_TRANSLATIONS } from '../../i18n/catalog.js';

test('should_default_to_en_language', () => {
  assert.equal(KIT_LANGUAGE_DEFAULT, 'en');
});

test('should_contain_every_internal_infrastructure_key', () => {
  for (const key of [
    'pey.webui.errors.page-not-found',
    'pey.webui.errors.page-load-failed',
    'pey.webui.actions.retry',
    'pey.webui.actions.go-back',
    'pey.webui.actions.go-to-fallback',
  ]) {
    assert.equal(typeof KIT_TRANSLATIONS.en[key], 'string', `missing kit key: ${key}`);
    assert.ok(KIT_TRANSLATIONS.en[key].length > 0, `empty kit key: ${key}`);
  }
});

test('should_carry_no_product_translation_keys', () => {
  for (const key of Object.keys(KIT_TRANSLATIONS.en)) {
    assert.ok(key.startsWith('pey.webui.'), `unexpected key: ${key}`);
  }
});

test('should_be_frozen', () => {
  assert.equal(Object.isFrozen(KIT_TRANSLATIONS), true);
  assert.equal(Object.isFrozen(KIT_TRANSLATIONS.en), true);
});
