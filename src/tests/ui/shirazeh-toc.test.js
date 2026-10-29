// jsdom tests for the shirazeh-toc component: tree rendering, submenu
// toggling, entry links, and empty-toc suppression.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsRecorder, createElement, importTocComponent } from './setup-dom.js';

await importTocComponent();

async function flushRender() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const TOC = [
  { id: 'h-1', level: 1, text: 'مقدمه' },
  { id: 'h-2', level: 2, text: 'نصب' },
  { id: 'h-3', level: 3, text: 'پیش‌نیازها' },
  { id: 'h-4', level: 2, text: 'پیکربندی' },
];

async function mount({ toc = TOC, maxDepth = 3 } = {}) {
  // Fresh body per mount: duplicate ids from earlier tests would win the
  // document.getElementById lookup.
  document.body.innerHTML = '';
  const recorder = createEventsRecorder();
  const contentRoot = document.createElement('div');
  contentRoot.innerHTML = '<h1 id="h-1">مقدمه</h1><h2 id="h-2">نصب</h2>';
  // Attached, so getRootNode() resolves to a root that can find headings by
  // id — mirroring the real page where the content lives in its shadow root.
  document.body.append(contentRoot);
  const tocElement = createElement('shirazeh-toc');
  tocElement.connect({
    infrastructure: { events: recorder.facade },
    refs: { toc, path: '/guide', maxDepth, title: 'در این صفحه', contentRoot },
  });
  document.body.append(tocElement);
  await flushRender();
  return { tocElement, shadow: tocElement.shadowRoot, contentRoot };
}

test('should_render_nested_entries_when_toc_has_headings', async () => {
  const { shadow, tocElement } = await mount();

  const links = [...shadow.querySelectorAll('a[data-toc-link]')];
  assert.deepEqual(links.map((a) => a.dataset.tocLink), ['h-1', 'h-2', 'h-3', 'h-4']);
  assert.equal(shadow.querySelector('.toc-title').textContent, 'در این صفحه');
});

test('should_render_nothing_when_toc_is_empty', async () => {
  const { shadow, tocElement } = await mount({ toc: [] });

  assert.equal(shadow.querySelector('.toc-panel'), null);
});

test('should_drop_entries_deeper_than_max_depth', async () => {
  const { shadow, tocElement } = await mount({ maxDepth: 2 });

  assert.equal(shadow.querySelector('a[data-toc-link="h-3"]'), null);
});

test('should_toggle_submenu_expansion_on_click', async () => {
  const { shadow, tocElement } = await mount();

  const toggle = shadow.querySelector('button[data-toc-toggle]');
  const submenu = toggle.closest('li').querySelector('ul');
  assert.equal(submenu.classList.contains('is-open'), true);
  toggle.click();
  assert.equal(submenu.classList.contains('is-open'), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('should_build_entry_links_with_anchor_query', async () => {
  const { shadow, tocElement } = await mount();

  const link = shadow.querySelector('a[data-toc-link="h-2"]');
  assert.equal(link.getAttribute('href'), '#/guide?a=h-2');
});

test('should_scroll_via_heading_root_when_entry_clicked', async () => {
  const { shadow, tocElement, contentRoot } = await mount();
  const heading = contentRoot.querySelector('#h-2');
  let scrolled = 0;
  heading.scrollIntoView = () => { scrolled += 1; };

  const link = shadow.querySelector('a[data-toc-link="h-2"]');
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(scrolled, 1);
});
