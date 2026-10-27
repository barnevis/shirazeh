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

async function mountPage({ path, page }) {
  const recorder = createEventsRecorder();
  const docsPage = createElement('app-page-docs');
  docsPage.connect({
    infrastructure: { events: recorder.facade },
    refs: {
      services: { 'shirazeh.docs.service': createFakeDocsService({
        '/': { path: '/', html: '<h1>خانه</h1>', toc: [{ id: 'a', level: 1, text: 'خانه' }], title: 'خانه', documentTitle: 'خانه', previous: null, next: { href: 'guide', title: 'راهنما', attrTitle: null, level: 1 } },
        '/about': { path: '/about', html: '<h1>درباره</h1>', toc: [{ id: 'b', level: 1, text: 'درباره' }], title: 'درباره', documentTitle: 'درباره', previous: { href: '/', title: 'خانه', attrTitle: null, level: 1 }, next: null },
      }) },
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
