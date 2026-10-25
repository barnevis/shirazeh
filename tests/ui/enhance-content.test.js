// jsdom-based tests for the docs-page content post-processing.

import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { wrapTables } from '../../ui/pages/docs/enhance-content.js';

function createRoot(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window.document.body;
}

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
