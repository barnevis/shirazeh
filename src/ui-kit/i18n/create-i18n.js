// Injectable i18n and formatting contract for pey.webui consumers.
// Contract decisions: docs/decisions.md#injectable-i18n-not-an-engine.

import { KIT_LANGUAGE_DEFAULT, KIT_TRANSLATIONS } from './catalog.js';

const ERROR_SOURCE = 'pey.webui';
const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const DEFAULT_DATE_STYLE = 'medium';
const DEFAULT_TIME_STYLE = 'short';

function createPeyWebUiError(code, message, type) {
  return Object.assign(new Error(message), {
    code,
    source: ERROR_SOURCE,
    type,
    timestamp: new Date().toISOString(),
  });
}

function assert(condition, code, message, type = 'startup') {
  if (!condition) throw createPeyWebUiError(code, message, type);
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidLanguageTag(language) {
  try {
    Intl.getCanonicalLocales(language);
    return true;
  } catch {
    return false;
  }
}

function validateLanguage(language, label) {
  assert(
    typeof language === 'string' && language.trim().length > 0 && language === language.trim(),
    'PEY_I18N_INVALID_LANGUAGE',
    `${label} must be a non-empty trimmed string`,
  );
  assert(
    isValidLanguageTag(language),
    'PEY_I18N_INVALID_LANGUAGE',
    `${label} must be a valid BCP 47 language tag`,
  );
  return language;
}

function validateCatalog(catalog) {
  assert(
    isPlainObject(catalog),
    'PEY_I18N_INVALID_CATALOG',
    'catalog must be a plain object of language catalogs',
  );
  for (const [language, entries] of Object.entries(catalog)) {
    assert(
      isValidLanguageTag(language),
      'PEY_I18N_INVALID_CATALOG',
      `catalog[${language}] must be a valid BCP 47 language tag`,
    );
    assert(
      isPlainObject(entries),
      'PEY_I18N_INVALID_CATALOG',
      `catalog[${language}] must be a plain object of key-value pairs`,
    );
    for (const [key, value] of Object.entries(entries)) {
      assert(
        typeof key === 'string' && key.trim().length > 0 && key === key.trim(),
        'PEY_I18N_INVALID_CATALOG',
        'catalog keys must be non-empty trimmed strings',
      );
      assert(typeof value === 'string', 'PEY_I18N_INVALID_CATALOG', 'catalog values must be strings');
    }
  }
  return catalog;
}

function mergedFor(language, catalog) {
  return { ...(KIT_TRANSLATIONS[language] ?? {}), ...(catalog[language] ?? {}) };
}

function interpolate(template, params) {
  return template.replace(PLACEHOLDER_PATTERN, (match, name) => {
    const value = params?.[name];
    return value === undefined || value === null ? match : String(value);
  });
}

function buildFormatter(type, locale, options) {
  switch (type) {
    case 'date':
      return new Intl.DateTimeFormat(locale, options);
    case 'time':
      return new Intl.DateTimeFormat(locale, { ...options, timeStyle: options.timeStyle ?? DEFAULT_TIME_STYLE });
    case 'dateTime':
      return new Intl.DateTimeFormat(locale, {
        ...options,
        dateStyle: options.dateStyle ?? DEFAULT_DATE_STYLE,
        timeStyle: options.timeStyle ?? DEFAULT_TIME_STYLE,
      });
    case 'number':
      return new Intl.NumberFormat(locale, options);
    case 'currency':
      assert(
        typeof options.currency === 'string' && options.currency.trim().length > 0,
        'PEY_I18N_FORMAT_INVALID_CURRENCY',
        'currency format requires a currency code',
        'operational',
      );
      // Required fields come after the spread so caller options can never
      // override the currency style or code.
      return new Intl.NumberFormat(locale, { ...options, style: 'currency', currency: options.currency });
    default:
      throw createPeyWebUiError('PEY_I18N_FORMAT_INVALID_TYPE', `Unsupported format type: ${String(type)}`, 'operational');
  }
}

/**
 * Creates the UI-local i18n instance for one running UI.
 * @param {object} options I18n options.
 * @param {string} [options.language] Active language tag (default 'en').
 * @param {string} [options.fallbackLanguage] Fallback language tag (default 'en').
 * @param {object} [options.catalog] Application catalog: { [language]: { [key]: string } }.
 * @returns {object} Frozen { t, format, language }.
 */
export function createI18n({ language = KIT_LANGUAGE_DEFAULT, catalog = {}, fallbackLanguage = KIT_LANGUAGE_DEFAULT } = {}) {
  const activeLanguage = validateLanguage(language, 'language');
  validateLanguage(fallbackLanguage, 'fallbackLanguage');
  validateCatalog(catalog);

  const activeEntries = mergedFor(activeLanguage, catalog);
  const fallbackEntries = mergedFor(fallbackLanguage, catalog);

  /**
   * Translates a key with `{param}` interpolation. Resolution, never-throw, and
   * escaping guarantees follow docs/decisions.md#missing-language-and-key-fallback
   * and docs/decisions.md#t-returns-raw-text: a missing key/language never
   * throws and surfaces only the key itself, an invalid key returns an empty
   * string, and the returned text is raw (the caller must HTML-escape it).
   * @param {string} key Stable translation key.
   * @param {object} [params] Interpolation parameters.
   * @returns {string} Translated string.
   */
  function t(key, params) {
    if (typeof key !== 'string' || key.length === 0 || key !== key.trim()) {
      return '';
    }
    try {
      const template = activeEntries[key] ?? fallbackEntries[key] ?? KIT_TRANSLATIONS[KIT_LANGUAGE_DEFAULT]?.[key] ?? key;
      return interpolate(template, params);
    } catch {
      // A value that cannot be stringified must not break the never-throw
      // guarantee; fall back to the key itself.
      return key;
    }
  }

  /**
   * Formats a value for the active language. Options must be a plain object; a
   * `locale` key is stripped because format always targets the active language,
   * and any underlying `Intl` failure is normalized into `PEY_I18N_FORMAT_FAILED`
   * so the boundary only ever surfaces `PEY_I18N_*` codes — see
   * docs/decisions.md#format-options-are-not-overridable.
   * @param {number|Date} value Value to format.
   * @param {'date'|'time'|'dateTime'|'number'|'currency'} type Format type.
   * @param {object} [options] Intl options; currency requires a currency code.
   * @returns {string} Formatted string.
   */
  function format(value, type, options = {}) {
    try {
      assert(
        isPlainObject(options),
        'PEY_I18N_FORMAT_INVALID_OPTIONS',
        'format options must be a plain object',
        'operational',
      );
      const formatOptions = { ...options };
      delete formatOptions.locale;
      return buildFormatter(type, activeLanguage, formatOptions).format(value);
    } catch (error) {
      if (error?.code) throw error;
      throw createPeyWebUiError('PEY_I18N_FORMAT_FAILED', 'The value could not be formatted for the active language', 'operational');
    }
  }

  return Object.freeze({ t, format, language: activeLanguage });
}

export { KIT_LANGUAGE_DEFAULT, KIT_TRANSLATIONS } from './catalog.js';
