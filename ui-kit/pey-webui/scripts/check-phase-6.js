// Validates phase 6 i18n exports, kit catalog, t/format contract, and fallback.
import { readFile } from 'node:fs/promises';

import '../tests/setup-dom.js';
import { createI18n, KIT_LANGUAGE_DEFAULT, KIT_TRANSLATIONS } from '../i18n/create-i18n.js';
import { createPageHost } from '../routing/page-host.js';
import { createPageLoaderRegistry } from '../routing/page-loader.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));

  for (const exportName of ['./i18n', './i18n/catalog']) {
    assert(
      typeof packageData.exports[exportName] === 'string',
      `Phase 6 export is missing: ${exportName}`,
    );
  }

  assert(KIT_LANGUAGE_DEFAULT === 'en', 'Kit default language must be en');
  for (const key of [
    'pey.webui.errors.page-not-found',
    'pey.webui.errors.page-load-failed',
    'pey.webui.actions.retry',
    'pey.webui.actions.go-back',
    'pey.webui.actions.go-to-fallback',
  ]) {
    assert(typeof KIT_TRANSLATIONS.en?.[key] === 'string', `Kit catalog must contain: ${key}`);
  }
  assert(!('account.title' in KIT_TRANSLATIONS.en), 'Kit catalog must not contain product keys');

  const i18n = createI18n({
    language: 'en',
    catalog: {
      en: { 'app.greeting': 'Hello {name}', 'pey.webui.actions.retry': 'Try again' },
    },
  });
  assert(i18n.t('app.greeting', { name: 'Pey' }) === 'Hello Pey', 't must interpolate params');
  assert(i18n.t('app.missing') === 'app.missing', 't must fall back to the key for missing keys');
  assert(
    i18n.t('pey.webui.actions.retry') === 'Try again',
    'application catalog must override kit keys',
  );
  assert(
    i18n.t('pey.webui.errors.page-not-found') === KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found'],
    'kit keys must resolve from the kit catalog',
  );

  assert(i18n.format(1234.5, 'number') === new Intl.NumberFormat('en').format(1234.5), 'number format must use Intl');
  assert(
    i18n.format(1, 'currency', { currency: 'USD' }) === new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1),
    'currency format must use Intl',
  );
  const date = new Date(2020, 0, 2);
  assert(
    i18n.format(date, 'date') === new Intl.DateTimeFormat('en').format(date),
    'date format must use Intl',
  );
  assert(
    i18n.format(date, 'dateTime') === new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date),
    'dateTime format must render both date and time by default',
  );
  assert(
    (() => {
      try {
        i18n.format(1, 'unknown');
        return false;
      } catch (error) {
        return error.code === 'PEY_I18N_FORMAT_INVALID_TYPE';
      }
    })(),
    'unknown format type must throw the stable code',
  );

  const events = {
    subscribe: () => () => {},
    publish: () => ({ success: true }),
  };
  const router = {
    getCurrentRoute: () => ({ pattern: '/missing', params: {}, query: {}, isNotFound: true }),
    back: async () => {},
    replace: async () => {},
  };
  const registry = createPageLoaderRegistry({ routes: [] });
  const shell = document.createElement('div');
  document.body.append(shell);
  const host = createPageHost({
    hostElement: shell,
    events,
    router,
    registry,
    infrastructure: { events },
    refs: {},
    config: { language: 'en' },
  });
  await host.mountForRoute(router.getCurrentRoute());
  await flush();
  const message = shell.firstElementChild?.shadowRoot?.querySelector('[part="message"]')?.textContent;
  assert(
    message === KIT_TRANSLATIONS.en['pey.webui.errors.page-not-found'],
    'fallback must render kit translations, not the raw key',
  );

  console.log('Phase 6 contracts are valid.');
}

await main();
