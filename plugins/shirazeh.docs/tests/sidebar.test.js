// Verifies sidebar parsing and path resolution utilities.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  neighborsForPath,
  normalizeHref,
  parseSidebar,
  pathToDocumentUrl,
  titleFromToc,
  validatePath,
} from '../lib/sidebar.js';

test('should_parse_links_when_sidebar_contains_nested_lists', () => {
  const { links } = parseSidebar([
    '- [خانه](/)',
    '  - [راهنما](guide/setup)',
    '    - [پیکربندی](guide/config.md)',
    '- [درباره](about)',
  ].join('\n'));

  assert.deepEqual(links, [
    { href: '/', title: 'خانه', level: 1 },
    { href: 'guide/setup', title: 'راهنما', level: 2 },
    { href: 'guide/config.md', title: 'پیکربندی', level: 3 },
    { href: 'about', title: 'درباره', level: 1 },
  ]);
});

test('should_skip_plain_items_when_sidebar_contains_text_without_links', () => {
  const { links } = parseSidebar('- بخش\n- [تنظیمات](settings)\n\nمتن آزاد');

  assert.deepEqual(links, [{ href: 'settings', title: 'تنظیمات', level: 1 }]);
});

test('should_reject_parse_error_when_sidebar_has_no_links', () => {
  assert.throws(
    () => parseSidebar('# عنوان\nمتن بدون لینک'),
    (error) => error.code === 'SIDEBAR_PARSE_FAILED' && error.source === 'shirazeh.docs',
  );
});

test('should_reject_parse_error_when_sidebar_is_not_a_string', () => {
  assert.throws(
    () => parseSidebar(null),
    (error) => error.code === 'SIDEBAR_PARSE_FAILED',
  );
});

test('should_return_root_url_when_path_is_home', () => {
  assert.equal(pathToDocumentUrl('/', './docs', 'README.md'), './docs/README.md');
});

test('should_append_md_when_path_has_no_extension', () => {
  assert.equal(pathToDocumentUrl('/guide/setup', './docs', 'README.md'), './docs/guide/setup.md');
});

test('should_keep_extension_when_path_already_has_one', () => {
  assert.equal(pathToDocumentUrl('/guide/setup.html', './docs', 'README.md'), './docs/guide/setup.html');
});

test('should_strip_trailing_slash_when_path_ends_with_slash', () => {
  assert.equal(pathToDocumentUrl('/guide/', './docs', 'README.md'), './docs/guide.md');
});

test('should_accept_path_when_it_is_valid', () => {
  assert.equal(validatePath('/'), '/');
  assert.equal(validatePath('/guide/setup'), '/guide/setup');
});

test('should_reject_invalid_path_when_it_misses_leading_slash', () => {
  assert.throws(
    () => validatePath('guide'),
    (error) => error.code === 'DOC_PATH_INVALID',
  );
});

test('should_reject_invalid_path_when_it_traverses_upward', () => {
  assert.throws(
    () => validatePath('/../secret'),
    (error) => error.code === 'DOC_PATH_INVALID',
  );
});

test('should_reject_invalid_path_when_it_is_not_a_string', () => {
  assert.throws(
    () => validatePath(42),
    (error) => error.code === 'DOC_PATH_INVALID',
  );
});

test('should_return_first_heading_text_when_toc_has_entries', () => {
  const toc = [
    { id: 'a', level: 2, text: 'عنوان' },
    { id: 'b', level: 3, text: 'زیرعنوان' },
  ];

  assert.equal(titleFromToc(toc), 'عنوان');
});

test('should_return_empty_title_when_toc_is_empty', () => {
  assert.equal(titleFromToc([]), '');
});

test('should_return_neighbors_when_path_is_in_sidebar', () => {
  const links = [
    { href: '/', title: 'خانه' },
    { href: 'guide', title: 'راهنما' },
    { href: 'about', title: 'درباره' },
  ];

  assert.deepEqual(neighborsForPath(links, '/guide'), {
    previous: { href: '/', title: 'خانه' },
    next: { href: 'about', title: 'درباره' },
  });
});

test('should_return_null_neighbors_when_path_is_missing_from_sidebar', () => {
  const links = [{ href: '/', title: 'خانه' }];

  assert.deepEqual(neighborsForPath(links, '/unknown'), { previous: null, next: null });
});

test('should_normalize_href_when_it_has_relative_prefix', () => {
  assert.equal(normalizeHref('./guide'), '/guide');
  assert.equal(normalizeHref('guide'), '/guide');
  assert.equal(normalizeHref('/guide'), '/guide');
});
