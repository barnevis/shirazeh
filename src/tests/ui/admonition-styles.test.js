// Guard for the GitHub-style admonition palette: every parsneshan box must
// carry its own accent and background tint (instead of the shared
// blockquote look), with tokens defined for both themes in app.css.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const contentCss = await readFile(new URL('../../ui/styles/content.css', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../../ui/styles/app.css', import.meta.url), 'utf8');

const TYPES = ['note', 'tip', 'important', 'warning', 'caution'];

test('should_color_each_admonition_type_with_its_own_accent_and_tint', () => {
  for (const type of TYPES) {
    const rule = contentCss.match(new RegExp(`\\.markdown-body \\.parsneshan-${type} \\{[^}]*\\}`));
    assert.ok(rule, `missing .parsneshan-${type} rule in content.css`);
    assert.match(rule[0], /border-inline-start-color:\s*var\(--admonition-[\w-]+\)/);
    assert.match(rule[0], /background-color:\s*var\(--admonition-[\w-]+\)/);
    // Each type references its own token pair, not a shared one.
    assert.match(rule[0], new RegExp(`--admonition-${type}-accent`));
    assert.match(rule[0], new RegExp(`--admonition-${type}-bg`));
  }
});

test('should_keep_boxes_compact_with_base_body_and_14px_label', () => {
  const base = contentCss.match(/\.markdown-body :where\(\[class\^='parsneshan-'\][^{]+\{[^}]*\}/);
  assert.ok(base, 'base admonition rule missing');
  // Box body follows the prose base (16px); the label line is 14px.
  assert.doesNotMatch(base[0], /font-size/);
  const label = contentCss.match(/\.markdown-body \.parsneshan-label \{[^}]*\}/);
  assert.match(label[0], /font-size: 14px/);
  // The global paragraph margin must not add a blank line inside the box.
  assert.match(contentCss, /> :last-child \{\n  margin-block-end: 0;/);
});

test('should_exclude_the_label_from_the_base_box_rule', () => {
  // The label class also starts with "parsneshan-"; unwrapped it would
  // inherit the box chrome (border/background/padding) and look like a
  // nested quote box.
  assert.match(contentCss, /:not\(\.parsneshan-label\)/);
});

test('should_keep_the_label_plain_colored_text', () => {
  const rule = contentCss.match(/\.markdown-body \.parsneshan-label \{[^}]*\}/);
  assert.ok(rule, 'label rule missing');
  assert.doesNotMatch(rule[0], /font-weight/);
  assert.doesNotMatch(rule[0], /background/);
  assert.doesNotMatch(rule[0], /border/);
  assert.match(rule[0], /font-size: 14px/);
});

test('should_keep_base_box_rule_below_per_type_specificity', () => {
  // The base rule carries three :not() selectors; unwrapped it would outrank
  // the per-type color rules and every box would share one color again.
  const base = contentCss.match(/\.markdown-body :where\(\[class\^='parsneshan-'\][^\n]*\{/);
  assert.ok(base, 'base admonition rule must be wrapped in :where()');
});

test('should_define_admonition_tokens_for_both_themes', () => {
  const light = appCss.match(/:root,\s*\[data-theme='light'\] \{[\s\S]*?\n\}/);
  const dark = appCss.match(/\[data-theme='dark'\] \{[\s\S]*?\n\}/);
  assert.ok(light, 'light theme block not found in app.css');
  assert.ok(dark, 'dark theme block not found in app.css');
  for (const block of [light[0], dark[0]]) {
    for (const type of TYPES) {
      assert.match(block, new RegExp(`--admonition-${type}-accent:`));
      assert.match(block, new RegExp(`--admonition-${type}-bg:`));
    }
  }
});
