// Verifies the page-export helpers: file naming, embedding, and the
// standalone HTML composition.

import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  buildExportFileName,
  buildStandaloneHtml,
  embedImages,
} from '../../ui/pages/docs/export.js';

function createDom(bodyHtml) {
  const dom = new JSDOM(`<body>${bodyHtml}</body>`, { url: 'http://127.0.0.1:8901/' });
  return { dom, document: dom.window.document };
}

test('should_build_file_name_from_titles_and_sanitize_forbidden_characters', () => {
  assert.equal(
    buildExportFileName({ documentTitle: 'راهنما: نصب?', appName: 'شیرازه' }),
    'راهنما- نصب- - شیرازه',
  );
});

test('should_fall_back_to_app_name_when_document_title_is_empty', () => {
  assert.equal(buildExportFileName({ documentTitle: '', appName: 'شیرازه' }), 'شیرازه - شیرازه');
});

test('should_embed_same_origin_images_as_data_urls', async () => {
  // jsdom fetch is not wired here; the unit targets the rewrite contract via
  // a stubbed global fetch returning a real jsdom Blob.
  const originalFetch = globalThis.fetch;
  const { dom } = (() => {
    const d = new JSDOM('<body></body>');
    return { dom: d };
  })();
  const png = dom.window.Blob ? new dom.window.Blob(['89504e47'], { type: 'image/png' }) : null;
  // The module resolves FileReader from its module realm; in tests that realm
  // is Node, whose FileReader cannot read a jsdom Blob — swap in jsdom's.
  const originalFileReader = globalThis.FileReader;
  Object.defineProperty(globalThis, 'FileReader', { value: dom.window.FileReader, configurable: true });
  globalThis.fetch = async () => ({
    ok: true,
    blob: async () => png,
  });

  try {
    const { document } = createDom('<p><img src="docs/pic.png"></p>');
    const container = document.querySelector('p').parentElement;

    const embedded = await embedImages(container);

    assert.equal(embedded, 1);
    const src = document.querySelector('img').getAttribute('src');
    assert.equal(src.startsWith('data:'), true);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'FileReader', { value: originalFileReader, configurable: true });
  }
});

test('should_keep_external_images_when_embedding_runs', async () => {
  const { document } = createDom('<p><img src="https://example.com/x.png"></p>');
  const container = document.querySelector('p').parentElement;

  const embedded = await embedImages(container);

  assert.equal(embedded, 0);
  assert.equal(document.querySelector('img').getAttribute('src'), 'https://example.com/x.png');
});

test('should_compose_standalone_html_with_theme_and_styles', async () => {
  const { document } = createDom('<h1>تیتر</h1><p>متن</p>');

  const html = await buildStandaloneHtml({
    pageHtml: '<h1>تیتر</h1><p>متن</p>',
    documentTitle: 'راهنما',
    appName: 'شیرازه',
    theme: 'dark',
    contentCss: '.markdown-body { color: red; }',
    hljsCss: '.hljs { color: blue; }',
    fontCssUrl: 'https://fonts.example/vazir.css',
    ownerDocument: document,
  });

  assert.equal(html.includes('data-theme="dark"'), true);
  assert.equal(html.includes('.markdown-body { color: red; }'), true);
  assert.equal(html.includes('.hljs { color: blue; }'), true);
  assert.equal(html.includes('<h1>تیتر</h1>'), true);
  assert.equal(html.includes('راهنما | شیرازه'), true);
});

test('should_escape_document_title_in_the_export_head', async () => {
  const { document } = createDom('<p>x</p>');

  const html = await buildStandaloneHtml({
    pageHtml: '<p>x</p>',
    documentTitle: '<script>alert(1)</script>',
    appName: 'شیرازه',
    theme: 'light',
    contentCss: '',
    ownerDocument: document,
  });

  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('&lt;script&gt;'), true);
});
