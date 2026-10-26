// Boots the real Pey Core with the real shirazeh.http, pey.markdown, and
// shirazeh.docs plugins, an in-memory Node Host, and a fake fetch that
// serves the sample docs. pey.router is intentionally absent: its browser
// adapter cannot run under Node, and coverage for it lives in the browser
// E2E pass.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PeyCore } from '../../core/pey-core/index.js';

const PROJECT_ROOT = new URL('../../', import.meta.url);

const SAMPLE_FILES = {
  './docs/README.md': '# خانه\n\nمتن **مهم** و [لینک](guide)',
  './docs/_sidebar.md': '- [خانه](/ "صفحه اصلی شیرازه")\n  - [راهنما](guide)\n- [درباره](about)',
  './docs/guide.md': '# راهنما\n\n## بخش\n\nمتن راهنما',
  './docs/about.md': '# درباره\n\nدرباره شیرازه',
  './docs/parsneshan.md': [
    '# پارسنشان',
    '',
    '... هشدار',
    'متن هشدار',
    '...',
    '',
    '۱. نخست',
    '۲. دوم',
    '',
    '...شعر',
    'مصرع یک     مصرع دو',
    '...',
    '',
    'پانویس[^۱]',
    '',
    '[^۱]: توضیح',
  ].join('\n'),
};

function createFakeFetch(files) {
  return async (url) => {
    if (Object.prototype.hasOwnProperty.call(files, url)) {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/markdown']]),
        text: async () => files[url],
      };
    }
    return { ok: false, status: 404, headers: new Map(), text: async () => '' };
  };
}

let capturedUiContext = null;

function createBootstrapConfig({ includeStorage = false } = {}) {
  const config = {
    architecture: '0.11',
    core: { name: 'pey.core', version: '0.2.0' },
    adapters: {},
    ui: { path: './ui' },
    plugins: [
      { name: 'shirazeh.http', version: '0.1.0', path: './plugins/shirazeh.http' },
      { name: 'pey.markdown', version: '1.1.0', path: './plugins/pey.markdown' },
      { name: 'shirazeh.docs', version: '0.3.0', path: './plugins/shirazeh.docs' },
    ],
    config: {
      'shirazeh.http': {},
      'pey.markdown': {},
      'shirazeh.docs': { docsRoot: './docs', homePage: 'README.md', sidebarFile: '_sidebar.md' },
      ui: {},
    },
    app: { name: 'شیرازه', version: '0.2.0' },
  };

  if (includeStorage) {
    config.plugins.unshift(
      { name: 'pey.storage', version: '0.5.0', path: './plugins/pey.storage' },
    );
    // The in-memory adapter runs under Node (no IndexedDB there); the browser
    // uses IndexedDBAdapter, selected in bootstrap.json.
    config.adapters.storage = 'InMemoryAdapter';
    config.plugins.push(
      { name: 'shirazeh.prefs', version: '0.1.0', path: './plugins/shirazeh.prefs' },
    );
    config.config['pey.storage'] = {
      databaseName: 'shirazeh-integration-db',
      schemaVersion: 1,
      stores: [{ name: 'prefs', keyPath: 'key' }],
    };
    config.config['shirazeh.prefs'] = {};
  }

  return config;
}

function createInMemoryHost({ includeStorage = false } = {}) {
  return {
    configSource: {
      async getConfig() {
        return createBootstrapConfig({ includeStorage });
      },
    },
    envSource: {
      get() {
        return undefined;
      },
    },
    moduleLoader: {
      async loadManifest(ref) {
        const cleanRef = ref.replace(/^\.\//, '').replace(/\/+$/, '');
        return JSON.parse(await readFile(new URL(`${cleanRef}/manifest.json`, PROJECT_ROOT), 'utf8'));
      },
      async loadEntry(ref) {
        if (ref === './ui') {
          // A minimal fake UI that captures the Core-bound service map so the
          // test can call the real services exactly as the real UI would.
          return {
            async setup(context) {
              capturedUiContext = context;
              context.onShutdown = () => {};
            },
          };
        }
        const cleanRef = ref.replace(/^\.\//, '').replace(/\/+$/, '');
        return import(new URL(`${cleanRef}/index.js`, PROJECT_ROOT).href);
      },
    },
  };
}

async function bootShirazeh(files = SAMPLE_FILES, { includeStorage = false } = {}) {
  capturedUiContext = null;
  const events = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFakeFetch(files);

  let core;
  try {
    const host = createInMemoryHost({ includeStorage });
    core = new PeyCore(host);
    const { shutdown } = await core.start({
      onEvent: (event) => events.push(event),
    });
    return { events, shutdown, uiContext: capturedUiContext };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('should_reach_core_ready_when_real_plugins_boot', async () => {
  const { events } = await bootShirazeh();

  const eventTypes = events.map((event) => event.type);
  assert.equal(eventTypes.includes('http:ready'), true);
  assert.equal(eventTypes.includes('markdown:ready'), true);
  assert.equal(eventTypes.includes('docs:ready'), true);
  assert.equal(eventTypes.indexOf('docs:ready') > eventTypes.indexOf('http:ready'), true);
  assert.equal(eventTypes[events.length - 1], 'core:ready');
});

test('should_render_home_page_through_bound_services_when_ui_calls_get_page', async () => {
  const { uiContext, events, shutdown } = await bootShirazeh();

  try {
    const docsService = uiContext.services['shirazeh.docs.service'];
    assert.equal(typeof docsService.getPage, 'function');

    const page = await docsService.getPage('/');
    assert.equal(page.path, '/');
    assert.equal(page.title, 'خانه');
    assert.equal(page.documentTitle, 'صفحه اصلی شیرازه');
    assert.equal(page.html.includes('<h1'), true);
    assert.equal(page.toc.length, 1);
    assert.deepEqual(page.next, { href: 'guide', title: 'راهنما', attrTitle: null, level: 2 });

    const loadedEvent = events.find((event) => event.type === 'docs:page-loaded');
    assert.deepEqual(loadedEvent.data, { path: '/' });
    assert.equal(loadedEvent.source, 'shirazeh.docs');
  } finally {
    await shutdown();
  }
});

test('should_return_sidebar_through_bound_services_when_ui_calls_get_sidebar', async () => {
  const { uiContext, shutdown } = await bootShirazeh();

  try {
    const links = await uiContext.services['shirazeh.docs.service'].getSidebar();
    assert.equal(links.length, 3);
    assert.deepEqual(links[0], { href: '/', title: 'خانه', attrTitle: 'صفحه اصلی شیرازه', level: 1 });
  } finally {
    await shutdown();
  }
});

test('should_render_parsneshan_dialect_when_page_uses_it', async () => {
  const { uiContext, shutdown } = await bootShirazeh();

  try {
    const page = await uiContext.services['shirazeh.docs.service'].getPage('/parsneshan');
    assert.equal(page.title, 'پارسنشان');
    assert.equal(page.html.includes('class="parsneshan-warning"'), true);
    assert.equal(page.html.includes('<ol>'), true);
    assert.equal(page.html.includes('class="parsneshan-poem"'), true);
    assert.equal(page.html.includes('پاورقی'), true);
  } finally {
    await shutdown();
  }
});

test('should_return_page_not_found_when_document_is_missing', async () => {
  const { uiContext, shutdown } = await bootShirazeh();

  try {
    const result = await uiContext.services['shirazeh.docs.service'].getPage('/missing');
    assert.equal(result.code, 'DOC_PAGE_NOT_FOUND');
    assert.equal(result.source, 'shirazeh.docs');
  } finally {
    await shutdown();
  }
});

test('should_publish_stopped_events_in_reverse_order_when_shutdown_is_called', async () => {
  const { events, shutdown } = await bootShirazeh();

  await shutdown();

  const eventTypes = events.map((event) => event.type);
  const stopped = eventTypes.filter((type) => type.endsWith(':stopped'));
  assert.deepEqual(stopped, ['docs:stopped', 'markdown:stopped', 'http:stopped']);
  assert.equal(eventTypes.includes('core:shutdown'), true);
});

test('should_return_unavailable_after_shutdown_when_service_is_called_on_stale_reference', async () => {
  const { uiContext, shutdown } = await bootShirazeh();

  const docsService = uiContext.services['shirazeh.docs.service'];
  await shutdown();

  const result = await docsService.getPage('/');
  assert.equal(result.code, 'SERVICE_UNAVAILABLE');
});

test('should_boot_storage_group_and_persist_preferences_when_enabled', async () => {
  const { events, uiContext, shutdown } = await bootShirazeh(SAMPLE_FILES, { includeStorage: true });

  try {
    const eventTypes = events.map((event) => event.type);
    assert.equal(eventTypes.includes('storage:ready'), true);
    assert.equal(eventTypes.includes('prefs:ready'), true);
    assert.equal(eventTypes[events.length - 1], 'core:ready');

    // The UI context only receives optional services that are available.
    const prefsService = uiContext.services['shirazeh.prefs.service'];
    assert.equal(typeof prefsService.get, 'function');

    assert.equal(await prefsService.set('theme', 'dark'), true);
    assert.equal(await prefsService.get('theme'), 'dark');
    assert.equal(await prefsService.get('missing'), null);
  } finally {
    await shutdown();
  }
});
