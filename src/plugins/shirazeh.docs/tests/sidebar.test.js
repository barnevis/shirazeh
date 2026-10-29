// Verifies sidebar parsing and path resolution utilities.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSidebarTree,
  documentTitleForPath,
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
    { href: '/', title: 'خانه', attrTitle: null, level: 1 },
    { href: 'guide/setup', title: 'راهنما', attrTitle: null, level: 2 },
    { href: 'guide/config.md', title: 'پیکربندی', attrTitle: null, level: 3 },
    { href: 'about', title: 'درباره', attrTitle: null, level: 1 },
  ]);
});

test('should_parse_attr_title_when_link_has_title_attribute', () => {
  const { links } = parseSidebar('- [خانه](/ "صفحه اصلی شیرازه")');

  assert.deepEqual(links, [
    { href: '/', title: 'خانه', attrTitle: 'صفحه اصلی شیرازه', level: 1 },
  ]);
});

test('should_return_null_attr_title_when_title_attribute_is_empty', () => {
  const { links } = parseSidebar('- [خانه](/ "")');

  assert.equal(links[0].attrTitle, null);
});

test('should_skip_plain_items_when_sidebar_contains_text_without_links', () => {
  const { links } = parseSidebar('- بخش\n- [تنظیمات](settings)\n\nمتن آزاد');

  assert.deepEqual(links, [{ href: 'settings', title: 'تنظیمات', attrTitle: null, level: 1 }]);
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

test('should_prefer_attr_title_when_link_has_one', () => {
  const links = [{ href: '/', title: 'خانه', attrTitle: 'صفحه اصلی' }];

  assert.equal(documentTitleForPath(links, '/', 'تیتر محتوا'), 'صفحه اصلی');
});

test('should_fall_back_to_label_when_attr_title_is_missing', () => {
  const links = [{ href: '/', title: 'خانه', attrTitle: null }];

  assert.equal(documentTitleForPath(links, '/', 'تیتر محتوا'), 'خانه');
});

test('should_fall_back_to_heading_when_link_is_missing_from_sidebar', () => {
  const links = [{ href: '/', title: 'خانه', attrTitle: null }];

  assert.equal(documentTitleForPath(links, '/guide', 'راهنمای شیرازه'), 'راهنمای شیرازه');
});

test('should_return_heading_when_link_has_no_label', () => {
  const links = [{ href: '/guide', title: '', attrTitle: null }];

  assert.equal(documentTitleForPath(links, '/guide', 'تیتر'), 'تیتر');
});

test('should_return_empty_title_when_no_source_exists', () => {
  assert.equal(documentTitleForPath([], '/', ''), '');
});

test('should_build_nested_tree_when_levels_nest', () => {
  const links = [
    { href: '/', title: 'خانه', attrTitle: null, level: 1 },
    { href: 'guide', title: 'راهنما', attrTitle: null, level: 2 },
    { href: 'guide/config', title: 'پیکربندی', attrTitle: null, level: 3 },
    { href: 'about', title: 'درباره', attrTitle: null, level: 1 },
  ];

  const tree = buildSidebarTree(links);

  assert.deepEqual(tree.map((node) => node.href), ['/', 'about']);
  assert.deepEqual(tree[0].children.map((node) => node.href), ['guide']);
  assert.deepEqual(tree[0].children[0].children.map((node) => node.href), ['guide/config']);
  assert.equal(tree[0].children[0].title, 'راهنما');
});

test('should_flatten_when_all_levels_equal', () => {
  const links = [
    { href: 'a', title: 'یک', attrTitle: null, level: 1 },
    { href: 'b', title: 'دو', attrTitle: null, level: 1 },
  ];

  const tree = buildSidebarTree(links);

  assert.deepEqual(tree.map((node) => node.href), ['a', 'b']);
  assert.deepEqual(tree[0].children, []);
});

test('should_skip_invalid_links_when_building_tree', () => {
  const tree = buildSidebarTree([{ title: 'بدون href', level: 1 }, { href: 'ok', title: 'درست', attrTitle: null, level: 1 }]);

  assert.deepEqual(tree.map((node) => node.href), ['ok']);
});

test('should_return_empty_tree_when_input_is_not_an_array', () => {
  assert.deepEqual(buildSidebarTree(null), []);
});
