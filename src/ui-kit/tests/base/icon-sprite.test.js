// Verifies the shared icon sprite URL resolution and markup contract.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createIconMarkup, resolveIconSpriteUrl } from '../../base/icon-sprite.js';

test('should_resolve_sprite_url_inside_asset_base_with_trailing_slash', () => {
  const url = resolveIconSpriteUrl('https://example.test/ui/assets/');
  assert.equal(url, 'https://example.test/ui/assets/icons.svg');
});

test('should_resolve_sprite_url_from_dir_base_integrated_under_subpath', () => {
  const url = resolveIconSpriteUrl('https://example.test/sub/ui/assets/');
  assert.equal(url, 'https://example.test/sub/ui/assets/icons.svg');
});

test('should_build_icon_markup_with_the_documented_use_contract', () => {
  const markup = createIconMarkup('https://example.test/ui/assets/', 'star');
  assert.equal(
    markup,
    '<svg aria-hidden="true" focusable="false"><use href="https://example.test/ui/assets/icons.svg#star"></use></svg>',
  );
});

test('should_mark_icon_markup_as_decorative_and_not_focusable', () => {
  const markup = createIconMarkup('https://example.test/ui/assets/', 'star');
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /focusable="false"/);
});

test('should_reject_empty_icon_symbol_id', () => {
  assert.throws(() => createIconMarkup('https://example.test/ui/assets/', ''), (error) => error.code === 'PEY_ICON_SYMBOL_INVALID');
  assert.throws(() => createIconMarkup('https://example.test/ui/assets/', '   '), (error) => error.code === 'PEY_ICON_SYMBOL_INVALID');
});

test('should_reject_icon_symbol_fragment_injection_attempts', () => {
  const base = 'https://example.test/ui/assets/';
  const unsupported = [
    '<use onload="alert(1)">',
    'filter" onload="alert(1)"',
    'star><script>alert(1)</script>',
    'STAR',
    'star id',
    '#star',
    '1star',
    'star/other',
    'star-',
    '-star',
    'star--filled',
    'star_',
  ];
  for (const symbolId of unsupported) {
    assert.throws(
      () => createIconMarkup(base, symbolId),
      (error) => error.code === 'PEY_ICON_SYMBOL_INVALID',
      `expected PEY_ICON_SYMBOL_INVALID for ${JSON.stringify(symbolId)}`,
    );
  }
});

test('should_keep_supported_kebab_case_symbol_ids', () => {
  const url = 'https://example.test/ui/assets/icons.svg';
  assert.equal(createIconMarkup('https://example.test/ui/assets/', 'star'), `<svg aria-hidden="true" focusable="false"><use href="${url}#star"></use></svg>`);
  assert.equal(createIconMarkup('https://example.test/ui/assets/', 'chevron-left'), `<svg aria-hidden="true" focusable="false"><use href="${url}#chevron-left"></use></svg>`);
});

test('should_reject_empty_or_non_string_asset_base_url', () => {
  const invalid = ['', '   ', null, undefined, 42];
  for (const assetBaseUrl of invalid) {
    assert.throws(
      () => createIconMarkup(assetBaseUrl, 'star'),
      (error) => error.code === 'PEY_ICON_SPRITE_URL_INVALID',
      `expected PEY_ICON_SPRITE_URL_INVALID for ${JSON.stringify(assetBaseUrl)}`,
    );
  }
});

test('should_reject_unparsable_asset_base_url', () => {
  assert.throws(
    () => resolveIconSpriteUrl('not a valid url'),
    (error) => error.code === 'PEY_ICON_SPRITE_URL_INVALID',
  );
});