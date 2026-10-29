// Verifies the navbar.md parser: zones, nesting, dividers, CTA, badges.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNavbar } from '../lib/navbar.js';

test('should_parse_three_zones_when_position_directives_present', () => {
  const { zones } = parseNavbar([
    '{.position: left}',
    '- [خانه](/)',
    '{.position: center}',
    '- [راهنما](guide)',
    '{.position: right}',
    '- [گیت‌هاب](https://github.com/x)',
  ].join('\n'));

  assert.deepEqual(Object.keys(zones.left).length >= 0 ? Object.keys(zones) : [], ['left', 'center', 'right']);
  assert.equal(zones.left.length, 1);
  assert.equal(zones.center.length, 1);
  assert.equal(zones.right.length, 1);
  assert.equal(zones.left[0].href, '/');
});

test('should_default_zone_to_right_when_no_directive', () => {
  const { zones } = parseNavbar('- [خانه](/)');

  assert.equal(zones.right.length, 1);
  assert.equal(zones.left.length, 0);
});

test('should_nest_indented_items_as_submenu_children', () => {
  const { zones } = parseNavbar([
    '{.position: left}',
    '- [مستندات](docs)',
    '  - [شروع](docs/start)',
    '  - [پیکربندی](docs/config)',
  ].join('\n'));

  const parent = zones.left[0];
  assert.equal(parent.children.length, 2);
  assert.deepEqual(parent.children.map((child) => child.href), ['docs/start', 'docs/config']);
});

test('should_parse_divider_cta_and_badge_decorations', () => {
  const { zones } = parseNavbar([
    '{.position: right}',
    '---',
    '- [دانلود](download){.cta}',
    '- [نسخه](/release){.badge:۰٫۵}',
    '- مخزن',
    '  - [سورس](src)',
  ].join('\n'));

  const [divider, cta, badge, text] = zones.right;
  assert.equal(divider.type, 'divider');
  assert.equal(cta.cta, true);
  assert.equal(badge.badge, '۰٫۵');
  assert.equal(text.type, 'text');
  assert.deepEqual(text.children.map((child) => child.href), ['src']);
});

test('should_strip_html_comments_when_parsing', () => {
  const { zones } = parseNavbar([
    '{.position: left}',
    '<!-- این کامنت نادیده گرفته می‌شود -->',
    '- [خانه](/)',
  ].join('\n'));

  assert.equal(zones.left.length, 1);
});

test('should_throw_parse_error_when_input_is_not_text', () => {
  assert.throws(
    () => parseNavbar(null),
    (error) => error.code === 'NAVBAR_PARSE_FAILED' && error.source === 'shirazeh.docs',
  );
});

test('should_ignore_plain_lines_without_list_markers', () => {
  const { zones } = parseNavbar('{.position: left}\nمتن آزاد بدون فهرست');

  assert.equal(zones.left.length, 0);
});
