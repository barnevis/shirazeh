// Verifies the injectable i18n contract: t lookup, fallback behavior, and format.

import assert from 'node:assert/strict';
import test from 'node:test';

import { KIT_LANGUAGE_DEFAULT, KIT_TRANSLATIONS, createI18n } from '../../i18n/create-i18n.js';

const KIT_NOT_FOUND = KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found'];

test('should_return_frozen_instance_exposing_t_format_and_language', () => {
  const i18n = createI18n({ language: 'en' });
  assert.equal(Object.isFrozen(i18n), true);
  assert.equal(typeof i18n.t, 'function');
  assert.equal(typeof i18n.format, 'function');
  assert.equal(i18n.language, 'en');
  assert.equal(KIT_LANGUAGE_DEFAULT, 'en');
});

test('should_resolve_keys_from_active_language_and_interpolate_params', () => {
  const i18n = createI18n({
    language: 'en',
    catalog: { en: { 'app.greeting': 'Hello {name}, you have {count} new messages.' } },
  });
  assert.equal(i18n.t('app.greeting', { name: 'Pey', count: 2 }), 'Hello Pey, you have 2 new messages.');
});

test('should_leave_placeholders_for_missing_params_intact', () => {
  const i18n = createI18n({ catalog: { en: { 'app.greeting': 'Hi {name}!' } } });
  assert.equal(i18n.t('app.greeting'), 'Hi {name}!');
  assert.equal(i18n.t('app.greeting', { other: 'x' }), 'Hi {name}!');
});

test('should_fall_back_to_fallback_language_catalog', () => {
  const i18n = createI18n({
    language: 'de',
    fallbackLanguage: 'en',
    catalog: {
      de: { 'app.title': 'Titel' },
      en: { 'app.title': 'Title', 'app.missing': 'Fallback value' },
    },
  });
  assert.equal(i18n.t('app.title'), 'Titel');
  assert.equal(i18n.t('app.missing'), 'Fallback value');
});

test('should_resolve_kit_internal_keys_from_kit_catalog', () => {
  const i18n = createI18n({ language: 'en' });
  assert.equal(i18n.t('pey.webui.errors.page-not-found'), KIT_NOT_FOUND);
});

test('should_override_kit_keys_when_application_catalog_has_same_language', () => {
  const i18n = createI18n({
    catalog: { en: { 'pey.webui.actions.retry': 'Try again' } },
  });
  assert.equal(i18n.t('pey.webui.actions.retry'), 'Try again');
});

test('should_not_throw_and_fall_back_to_key_itself_when_key_is_missing', () => {
  const i18n = createI18n({ language: 'xx', fallbackLanguage: 'zz' });
  assert.equal(i18n.t('app.unknown'), 'app.unknown');
  assert.equal(i18n.t('pey.webui.errors.page-not-found'), KIT_NOT_FOUND);
});

test('should_return_empty_string_for_invalid_keys_without_throwing', () => {
  const i18n = createI18n();
  assert.equal(i18n.t(null), '');
  assert.equal(i18n.t(undefined), '');
  assert.equal(i18n.t(42), '');
  assert.equal(i18n.t(''), '');
  assert.equal(i18n.t('  key  '), '');
  assert.equal(i18n.t(Symbol('key')), '');
});

test('should_not_throw_when_interpolation_value_cannot_be_stringified', () => {
  const i18n = createI18n({ catalog: { en: { 'app.boom': 'value {bad}' } } });
  const bad = { toString() { throw new Error('boom'); } };
  assert.equal(i18n.t('app.boom', { bad }), 'app.boom');
});

test('should_reject_invalid_language', () => {
  for (const language of ['', '   ', ' en']) {
    assert.throws(
      () => createI18n({ language }),
      (error) => error.code === 'PEY_I18N_INVALID_LANGUAGE',
    );
  }
});

test('should_reject_invalid_bcp_47_language_tags', () => {
  for (const language of ['en_GB', 'not a tag']) {
    assert.throws(
      () => createI18n({ language }),
      (error) => error.code === 'PEY_I18N_INVALID_LANGUAGE',
    );
  }
  assert.throws(
    () => createI18n({ fallbackLanguage: 'de_DE' }),
    (error) => error.code === 'PEY_I18N_INVALID_LANGUAGE',
  );
});

test('should_reject_invalid_catalogs', () => {
  assert.throws(
    () => createI18n({ catalog: [] }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
  assert.throws(
    () => createI18n({ catalog: { en: [] } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
  assert.throws(
    () => createI18n({ catalog: { en: { 'app.title': 42 } } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
});

test('should_reject_catalogs_that_are_not_plain_objects', () => {
  assert.throws(
    () => createI18n({ catalog: new Date() }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
  assert.throws(
    () => createI18n({ catalog: { en: new Date() } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
  class Entries {}
  assert.throws(
    () => createI18n({ catalog: { en: new Entries() } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
});

test('should_reject_catalog_language_keys_that_are_not_valid_bcp_47_tags', () => {
  assert.throws(
    () => createI18n({ catalog: { 'en_GB': { 'app.title': 'Title' } } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
  assert.throws(
    () => createI18n({ catalog: { 'not a tag': { 'app.title': 'Title' } } }),
    (error) => error.code === 'PEY_I18N_INVALID_CATALOG',
  );
});

test('should_render_dates_times_numbers_and_currency_via_intl', () => {
  const i18n = createI18n({ language: 'en' });
  const date = new Date(2020, 0, 2, 15, 4);
  assert.equal(i18n.format(date, 'date'), new Intl.DateTimeFormat('en').format(date));
  assert.equal(i18n.format(date, 'time'), new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(date));
  assert.equal(
    i18n.format(date, 'dateTime'),
    new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date),
  );
  assert.equal(i18n.format(1234.5, 'number'), new Intl.NumberFormat('en').format(1234.5));
  assert.equal(i18n.format(1, 'currency', { currency: 'USD' }), new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1));
});

test('should_not_redirect_currency_format_to_another_style_via_options', () => {
  const i18n = createI18n({ language: 'en' });
  const expected = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(9.5);
  assert.equal(i18n.format(9.5, 'currency', { currency: 'USD', style: 'number' }), expected);
});

test('should_normalize_intl_failures_into_pey_i18n_format_failed', () => {
  const i18n = createI18n({ language: 'en' });
  assert.throws(
    () => i18n.format(new Date('invalid'), 'date'),
    (error) => error.code === 'PEY_I18N_FORMAT_FAILED' && error.type === 'operational',
  );
  assert.throws(
    () => i18n.format(1, 'currency', { currency: 'NOTACURRENCY' }),
    (error) => error.code === 'PEY_I18N_FORMAT_FAILED',
  );
  assert.throws(
    () => i18n.format(1, 'number', { numberingSystem: 'not-a-system' }),
    (error) => error.code === 'PEY_I18N_FORMAT_FAILED',
  );
});

test('should_reject_non_plain_object_options_with_pey_i18n_format_invalid_options', () => {
  const i18n = createI18n({ language: 'en' });
  assert.throws(
    () => i18n.format(1, 'number', null),
    (error) => error.code === 'PEY_I18N_FORMAT_INVALID_OPTIONS' && error.type === 'operational',
  );
  assert.throws(
    () => i18n.format(1, 'number', []),
    (error) => error.code === 'PEY_I18N_FORMAT_INVALID_OPTIONS',
  );
});

test('should_target_active_language_and_ignore_locale_option', () => {
  const i18n = createI18n({ language: 'en' });
  const number = 1234.5;
  assert.equal(i18n.format(number, 'number', { locale: 'de-DE' }), new Intl.NumberFormat('en').format(number));
});

test('should_throw_structured_errors_for_invalid_usage', () => {
  const i18n = createI18n({ language: 'en' });
  assert.throws(
    () => i18n.format(1, 'unknown'),
    (error) => error.code === 'PEY_I18N_FORMAT_INVALID_TYPE' && error.type === 'operational',
  );
  assert.throws(
    () => i18n.format(1, 'currency', {}),
    (error) => error.code === 'PEY_I18N_FORMAT_INVALID_CURRENCY',
  );
});
