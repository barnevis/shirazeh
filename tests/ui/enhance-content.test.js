// jsdom-based tests for the docs-page content post-processing.

import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { addCodeCopyButtons, addHeadingAnchors, wrapTables } from '../../ui/pages/docs/enhance-content.js';

function createRoot(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window.document.body;
}

test('should_add_anchors_when_headings_have_ids', () => {
  const root = createRoot('<h1 id="a">یک</h1><h2 id="b">دو</h2><h3>بدون شناسه</h3>');

  const anchored = addHeadingAnchors(root, { path: '/guide' });

  assert.equal(anchored, 2);
  const anchors = [...root.querySelectorAll('.heading-anchor')];
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].getAttribute('href'), '#/guide?a=a');
  assert.equal(anchors[1].getAttribute('href'), '#/guide?a=b');
});

test('should_encode_anchor_href_when_id_has_unicode', () => {
  const root = createRoot('<h2 id="user-content-h-%D8%B3%D9%84%D8%A7%D9%85">سلام</h2>');

  addHeadingAnchors(root, { path: '/' });

  const anchor = root.querySelector('.heading-anchor');
  assert.equal(anchor.getAttribute('href'), '#/?a=user-content-h-%25D8%25B3%25D9%2584%25D8%25A7%25D9%2585');
});

test('should_use_root_path_when_path_option_is_missing', () => {
  const root = createRoot('<h1 id="a">یک</h1>');

  addHeadingAnchors(root, {});

  assert.equal(root.querySelector('.heading-anchor').getAttribute('href'), '#/?a=a');
});

test('should_not_duplicate_anchors_when_run_twice', () => {
  const root = createRoot('<h1 id="a">یک</h1>');

  addHeadingAnchors(root, { path: '/' });
  const second = addHeadingAnchors(root, { path: '/' });

  assert.equal(second, 0);
  assert.equal(root.querySelectorAll('.heading-anchor').length, 1);
});

test('should_skip_headings_when_they_have_no_id', () => {
  const root = createRoot('<h1>بدون شناسه</h1>');

  assert.equal(addHeadingAnchors(root, { path: '/' }), 0);
  assert.equal(root.querySelector('.heading-anchor'), null);
});

test('should_return_zero_when_root_is_missing_for_anchors', () => {
  assert.equal(addHeadingAnchors(null, { path: '/' }), 0);
});

test('should_add_copy_button_when_pre_blocks_exist', () => {
  const root = createRoot('<pre><code>x</code></pre><pre><code>y</code></pre>');

  const added = addCodeCopyButtons(root, { label: 'رونوشت' });

  assert.equal(added, 2);
  const buttons = [...root.querySelectorAll('.copy-code-button')];
  assert.equal(buttons[0].textContent, 'رونوشت');
  assert.equal(buttons[0].closest('pre') !== null, true);
});

test('should_not_duplicate_copy_buttons_when_run_twice', () => {
  const root = createRoot('<pre><code>x</code></pre>');

  addCodeCopyButtons(root, { label: 'a' });
  const second = addCodeCopyButtons(root, { label: 'a' });

  assert.equal(second, 0);
  assert.equal(root.querySelectorAll('.copy-code-button').length, 1);
});

test('should_use_empty_label_when_option_is_missing', () => {
  const root = createRoot('<pre><code>x</code></pre>');

  addCodeCopyButtons(root, {});

  assert.equal(root.querySelector('.copy-code-button').textContent, '');
});

test('should_return_zero_when_root_is_missing_for_copy_buttons', () => {
  assert.equal(addCodeCopyButtons(null, { label: 'x' }), 0);
});

test('should_wrap_tables_when_content_contains_them', () => {
  const root = createRoot('<table id="t1"></table><p>x</p><table id="t2"></table>');

  const wrapped = wrapTables(root);

  assert.equal(wrapped, 2);
  assert.equal(root.querySelector('#t1').parentElement.className, 'table-wrapper');
  assert.equal(root.querySelector('#t2').parentElement.className, 'table-wrapper');
});

test('should_keep_table_position_when_wrapped', () => {
  const root = createRoot('<p>قبل</p><table></table><p>بعد</p>');

  wrapTables(root);

  const wrapper = root.querySelector('.table-wrapper');
  assert.equal(wrapper.previousElementSibling.textContent, 'قبل');
  assert.equal(wrapper.nextElementSibling.textContent, 'بعد');
});

test('should_not_rewrap_tables_when_already_wrapped', () => {
  const root = createRoot('<div class="table-wrapper"><table></table></div>');

  const wrapped = wrapTables(root);

  assert.equal(wrapped, 0);
  assert.equal(root.querySelectorAll('.table-wrapper').length, 1);
});

test('should_return_zero_when_root_has_no_tables', () => {
  const root = createRoot('<p>فقط متن</p>');

  assert.equal(wrapTables(root), 0);
});

test('should_return_zero_when_root_is_missing', () => {
  assert.equal(wrapTables(null), 0);
});
