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

async function mountPage({ path, pages = DEFAULT_PAGES }) {
  const recorder = createEventsRecorder();
  const docsPage = createElement('app-page-docs');
  docsPage.connect({
    infrastructure: { events: recorder.facade },
    refs: {
      services: { 'shirazeh.docs.service': createFakeDocsService(pages) },
      router: { navigate: () => {} },
      sharedState: null,
      config: {},
      events: recorder.facade,
      t: (key) => key,
      format: () => '',
      appName: 'شیرازه',
      routeParams: path === '/' ? {} : { page: path.slice(1) },
      routeQuery: {},
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

test('should_not_reserve_toc_width_when_toc_does_not_mount', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountPage({ path: '/' });

  // Single heading → below TOC_MIN_HEADINGS: no TOC, no reserved width.
  assert.equal(shadow.querySelector('[data-toc-slot] shirazeh-toc'), null);
  assert.equal(shadow.querySelector('.content.has-toc'), null);
});
