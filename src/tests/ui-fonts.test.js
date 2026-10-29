// Verifies the Vazirmatn font assets are shipped and wired together:
// woff2 files exist, fonts.css declares the three faces, index.html
// preloads the files, and the app stack references the family.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const FONTS_DIR = new URL('../ui/assets/fonts/', import.meta.url);
const FONTS_CSS = new URL('../ui/styles/fonts.css', import.meta.url);
const APP_CSS = new URL('../ui/styles/app.css', import.meta.url);
const INDEX_HTML = new URL('../../index.html', import.meta.url);

const FONT_WEIGHTS = ['Regular', 'Medium', 'Bold'];

for (const weight of FONT_WEIGHTS) {
  test(`should_ship_${weight.toLowerCase()}_woff2_when_font_assets_are_checked`, async () => {
    const file = await readFile(new URL(`Vazirmatn-${weight}.woff2`, FONTS_DIR));

    // A valid woff2 starts with the "wOF2" magic bytes.
    assert.equal(file.subarray(0, 4).toString('ascii'), 'wOF2');
  });
}

test('should_declare_three_faces_when_fonts_css_is_read', async () => {
  const css = await readFile(FONTS_CSS, 'utf8');

  const faceCount = (css.match(/@font-face/g) ?? []).length;
  assert.equal(faceCount, 3);
  assert.equal(css.includes("'Vazirmatn'"), true);
  assert.equal(css.includes('font-display: swap'), true);
  for (const weight of FONT_WEIGHTS) {
    assert.equal(css.includes(`Vazirmatn-${weight}.woff2`), true);
  }
});

test('should_preload_font_files_when_index_html_is_read', async () => {
  const html = await readFile(INDEX_HTML, 'utf8');

  const preloads = html.match(/<link rel="preload"[^>]+as="font"[^>]*>/g) ?? [];
  assert.equal(preloads.length, 3);
  for (const weight of FONT_WEIGHTS) {
    assert.equal(html.includes(`ui/assets/fonts/Vazirmatn-${weight}.woff2`), true);
  }
});

test('should_reference_family_when_app_stack_is_read', async () => {
  const css = await readFile(APP_CSS, 'utf8');

  assert.equal(css.includes("'Vazirmatn'"), true);
});
