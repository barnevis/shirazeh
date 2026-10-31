// jsdom regression test for the docs page rendering with edge-of-chain
// pages: a page whose previous/next neighbors are null (first/last in the
// sidebar) must render without the render-failure crash.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsRecorder, createElement, importTocComponent } from './setup-dom.js';

await importTocComponent(); // ensures pey-element/jsdom globals are ready
const { DocsPage } = await import('../../ui/pages/docs/docs.js');

async function flushRender() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const SIDEBAR = {
  tree: [
    { href: '/', title: 'خانه', attrTitle: null, level: 1, children: [] },
    { href: 'about', title: 'درباره', attrTitle: null, level: 1, children: [] },
  ],
};

function createFakeDocsService(pages) {
  return {
    getPage: async (path) => pages[path] ?? {
      code: 'DOC_PAGE_NOT_FOUND', message: 'x', source: 'shirazeh.docs',
      type: 'operational', timestamp: new Date().toISOString(),
    },
    getSidebar: async () => SIDEBAR,
    getRawMarkdown: async () => '# x',
  };
}

const DEFAULT_PAGES = {
  '/': { path: '/', html: '<h1>خانه</h1>', toc: [{ id: 'a', level: 1, text: 'خانه' }], title: 'خانه', documentTitle: 'خانه', previous: null, next: { href: 'guide', title: 'راهنما', attrTitle: null, level: 1 } },
  '/about': { path: '/about', html: '<h1>درباره</h1>', toc: [{ id: 'b', level: 1, text: 'درباره' }], title: 'درباره', documentTitle: 'درباره', previous: { href: '/', title: 'خانه', attrTitle: null, level: 1 }, next: null },
};

async function mountPage({ path, pages = DEFAULT_PAGES, routeQuery = {}, events = null } = {}) {
  const recorder = createEventsRecorder();
  const docsPage = createElement('app-page-docs');
  docsPage.connect({
    infrastructure: { events: events ?? recorder.facade },
    refs: {
      services: { 'shirazeh.docs.service': createFakeDocsService(pages) },
      router: { navigate: () => {} },
      sharedState: null,
      config: {},
      events: events ?? recorder.facade,
      t: (key) => key,
      format: () => '',
      appName: 'شیرازه',
      routeParams: path === '/' ? {} : { page: path.slice(1) },
      routeQuery,
    },
  });
  document.body.append(docsPage);
  await flushRender(); // initial render (loading state)
  await flushRender(); // post-load render (ready state) + mount
  await flushRender(); // the component stylesheet gate settles (fetch fails in jsdom) and the gated re-render flushes
  return { docsPage, shadow: docsPage.shadowRoot, recorder };
}

test('should_render_pager_without_crash_when_page_has_no_next', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountPage({ path: '/about' });

  assert.equal(shadow.querySelector('.markdown-body h1')?.textContent, 'درباره');
  assert.equal(shadow.querySelector('.pager-placeholder') !== null, true);
  assert.equal(shadow.querySelector('.pager a[aria-label^="shirazeh.page.next"]'), null);
});

test('should_render_next_button_only_when_page_has_no_previous', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountPage({ path: '/' });

  assert.equal(shadow.querySelector('.markdown-body h1')?.textContent, 'خانه');
  // '/' is the first page: no previous neighbor, next button present
  assert.equal(shadow.querySelector('.pager a[aria-label^="shirazeh.page.previous"]'), null);
  assert.equal(shadow.querySelector('.pager a[aria-label^="shirazeh.page.next"]') !== null, true);
});

test('should_not_enter_error_state_when_neighbors_are_null', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountPage({ path: '/about' });

  assert.equal(shadow.querySelector('.content.is-error'), null);
  assert.equal(shadow.querySelector('.markdown-body') !== null, true);
});

// Regression for the stylesheet-gated first render: the post-render step used
// to run against the not-yet-rendered shadow root (queued by microtask before
// the gated flush), so heading anchors, copy buttons and the TOC never
// appeared even though the page content did.
test('should_apply_post_render_enhancements_after_gated_render', async () => {
  document.body.innerHTML = '';
  const pages = {
    '/': {
      path: '/',
      html: '<h1 id="a">خانه</h1><h2 id="b">مقدمه</h2><pre><code class="language-js">const a = 1;</code></pre>',
      toc: [
        { id: 'a', level: 1, text: 'خانه' },
        { id: 'b', level: 2, text: 'مقدمه' },
      ],
      title: 'خانه', documentTitle: 'خانه', previous: null, next: null,
    },
  };
  const { shadow } = await mountPage({ path: '/', pages });

  assert.equal(shadow.querySelector('.markdown-body .heading-anchor') !== null, true);
  assert.equal(shadow.querySelectorAll('.copy-code-button').length > 0, true);
  assert.equal(shadow.querySelector('[data-toc-slot] shirazeh-toc') !== null, true);
  // The mounted TOC reserves its fixed-panel width on the content column so
  // the prose centers between sidebar and TOC.
  assert.equal(shadow.querySelector('.content.has-toc') !== null, true);
});

test('should_scroll_to_heading_when_toc_entry_clicked', async () => {
  document.body.innerHTML = '';
  // pey.markdown emits heading ids percent-encoded; the toc carries them
  // verbatim — the click must find the heading WITHOUT extra decoding.
  const pages = {
    '/': {
      path: '/',
      html: '<h1 id="user-content-h-%D8%AE%D8%A7%D9%86%D9%87">خانه</h1><h2 id="user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87">مقدمه</h2>',
      toc: [
        { id: 'user-content-h-%D8%AE%D8%A7%D9%86%D9%87', level: 1, text: 'خانه' },
        { id: 'user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87', level: 2, text: 'مقدمه' },
      ],
      title: 'خانه', documentTitle: 'خانه', previous: null, next: null,
    },
  };
  const mounted = await mountPage({ path: '/', pages });
  const tocPanel = mounted.shadow.querySelector('[data-toc-slot] shirazeh-toc');
  const link = tocPanel.shadowRoot.querySelector('a[data-toc-link="user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87"]');
  assert.equal(link !== null, true);

  const heading = mounted.shadow.getElementById('user-content-h-%D9%85%D9%82%D8%AF%D9%85%D9%87');
  assert.equal(heading !== null, true);
  let scrolled = false;
  heading.scrollIntoView = () => { scrolled = true; };

  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(scrolled, true);
});

test('should_scroll_to_heading_on_deep_link_query', async () => {
  document.body.innerHTML = '';
  const scrolls = [];
  const original = window.HTMLElement.prototype.scrollIntoView;
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoViewSpy() {
    scrolls.push(this.id);
  };
  try {
    await mountPage({
      path: '/deep',
      pages: {
        '/deep': {
          path: '/deep',
          html: '<h1 id="user-content-h-%D9%86%D8%B4%D8%A7%D9%86%D9%87">نشانه</h1>',
          toc: [{ id: 'user-content-h-%D9%86%D8%B4%D8%A7%D9%86%D9%87', level: 1, text: 'نشانه' }],
          title: 'نشانه', documentTitle: 'نشانه', previous: null, next: null,
        },
      },
      routeQuery: { a: 'user-content-h-%D9%86%D8%B4%D8%A7%D9%86%D9%87' },
    });
  } finally {
    window.HTMLElement.prototype.scrollIntoView = original;
  }
  // The router decoded the query once; the id must be looked up verbatim.
  assert.deepEqual(scrolls, ['user-content-h-%D9%86%D8%B4%D8%A7%D9%86%D9%87']);
});

test('should_run_the_export_when_the_download_event_arrives', async () => {
  document.body.innerHTML = '';
  let exportHandler = null;
  const events = {
    publish: () => ({ success: true }),
    subscribe: (type, handler) => {
      if (type === 'ui:export-requested') exportHandler = handler;
      return () => {};
    },
  };
  const { shadow } = await mountPage({ path: '/', events });
  assert.equal(typeof exportHandler, 'function');

  // The bus delivers the enriched event; the payload lives in .data.
  exportHandler({ type: 'ui:export-requested', data: { format: 'md' } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // The export flow ran far enough to surface its toast (jsdom cannot
  // actually download; a failed download still proves the event wired up).
  assert.equal(shadow.querySelector('.page-toast') !== null, true);
});

test('should_not_run_the_export_for_an_unknown_format', async () => {
  document.body.innerHTML = '';
  let exportHandler = null;
  const events = {
    publish: () => ({ success: true }),
    subscribe: (type, handler) => {
      if (type === 'ui:export-requested') exportHandler = handler;
      return () => {};
    },
  };
  const { shadow } = await mountPage({ path: '/', events });

  exportHandler({ type: 'ui:export-requested', data: { format: 'pdf' } });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(shadow.querySelector('.page-toast'), null);
});

test('should_not_reserve_toc_width_when_toc_does_not_mount', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountPage({ path: '/' });

  // Single heading → below TOC_MIN_HEADINGS: no TOC, no reserved width.
  assert.equal(shadow.querySelector('[data-toc-slot] shirazeh-toc'), null);
  assert.equal(shadow.querySelector('.content.has-toc'), null);
});
