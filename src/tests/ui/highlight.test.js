// Verifies the fence-syntax parsing and code-block decoration of the
// highlight module with a fake hljs — the vendored bundle is never loaded.

import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { highlightCodeBlocks, parseFenceInfo } from '../../ui/pages/docs/highlight.js';

function createContent(markup) {
  const dom = new JSDOM(`<body><div class="markdown-body">${markup}</div></body>`);
  return dom.window.document.querySelector('.markdown-body');
}

function createFakeHljs(languages = ['js']) {
  return {
    getLanguage: (name) => (languages.includes(name) ? { name } : undefined),
    highlightElement: (code) => {
      code.classList.add('hljs');
      code.innerHTML = '<span class="hljs-keyword">const</span> x = 1' + '\n' + 'const y = 2';
    },
  };
}

test('should_parse_language_when_info_has_only_language', () => {
  const dom = new JSDOM('<code class="language-js"></code>');
  const code = dom.window.document.querySelector('code');

  assert.deepEqual(parseFenceInfo(code), { language: 'js', fileName: null, ranges: [] });
});

test('should_parse_file_name_when_info_has_lang_file', () => {
  const dom = new JSDOM('<code class="language-js:app.js"></code>');
  const code = dom.window.document.querySelector('code');

  assert.deepEqual(parseFenceInfo(code), { language: 'js', fileName: 'app.js', ranges: [] });
});

test('should_parse_ranges_when_info_has_brace_block', () => {
  const dom = new JSDOM('<code class="language-js:app.js{1-3,5}"></code>');
  const code = dom.window.document.querySelector('code');

  assert.deepEqual(parseFenceInfo(code).ranges, [[1, 3], [5, 5]]);
});

test('should_return_null_language_when_class_has_no_language', () => {
  const dom = new JSDOM('<code class="raw"></code>');
  const code = dom.window.document.querySelector('code');

  assert.equal(parseFenceInfo(code).language, null);
});

test('should_highlight_and_clean_fence_class_when_language_is_known', () => {
  const root = createContent('<pre><code class="language-js:app.js{2-2}">const x = 1\nconst y = 2</code></pre>');

  const count = highlightCodeBlocks({ contentRoot: root, hljs: createFakeHljs() });

  assert.equal(count, 1);
  const code = root.querySelector('code');
  assert.equal(code.className, 'language-js hljs');
  assert.equal(code.querySelector('.hljs-line-highlight') !== null, true);
  assert.equal(root.querySelectorAll('.hljs-line').length, 2);
  const label = root.querySelector('.hljs-language-label');
  assert.equal(label.textContent, 'js: app.js');
});

test('should_skip_highlight_element_when_language_is_unknown', () => {
  const root = createContent('<pre><code class="language-ruby">puts 1</code></pre>');
  let highlighted = 0;
  const hljs = {
    getLanguage: () => undefined,
    highlightElement: () => { highlighted += 1; },
  };

  highlightCodeBlocks({ contentRoot: root, hljs });

  assert.equal(highlighted, 0);
  assert.equal(root.querySelector('code').className, 'language-ruby');
});

test('should_add_bare_label_when_ranges_absent_and_file_present', () => {
  const root = createContent('<pre><code class="language-css:theme.css">a {}</code></pre>');
  const fakeHljs = createFakeHljs(['css']);

  highlightCodeBlocks({ contentRoot: root, hljs: fakeHljs });

  assert.equal(root.querySelector('.hljs-language-label').textContent, 'css: theme.css');
  assert.equal(root.querySelectorAll('.hljs-line').length, 0);
});

test('should_return_zero_when_content_root_is_missing', () => {
  assert.equal(highlightCodeBlocks({ contentRoot: null, hljs: createFakeHljs() }), 0);
});

test('should_return_zero_when_hljs_is_missing', () => {
  const root = createContent('<pre><code class="language-js">x</code></pre>');

  assert.equal(highlightCodeBlocks({ contentRoot: root, hljs: null }), 0);
});
