// Guard for the fenced code block styling: the pre must use the solid
// theme tokens (no alpha wash) so the syntax-highlight token colors keep
// their contrast in both themes.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const contentCss = await readFile(new URL('../../ui/styles/content.css', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../../ui/styles/app.css', import.meta.url), 'utf8');

test('should_style_pre_with_solid_theme_tokens', () => {
  const rule = contentCss.match(/\.markdown-body pre \{[^}]*\}/);
  assert.ok(rule, 'pre rule missing in content.css');
  assert.match(rule[0], /background-color:\s*var\(--pre-bg\)/);
  assert.match(rule[0], /color:\s*var\(--pre-text\)/);
  assert.doesNotMatch(rule[0], /rgb\(/);
});

test('should_define_pre_tokens_for_both_themes', () => {
  const light = appCss.match(/:root,\s*\[data-theme='light'\] \{[\s\S]*?\n\}/);
  const dark = appCss.match(/\[data-theme='dark'\] \{[\s\S]*?\n\}/);
  assert.ok(light && dark);
  for (const block of [light[0], dark[0]]) {
    assert.match(block, /--pre-bg:/);
    assert.match(block, /--pre-text:/);
    assert.match(block, /--pre-border:/);
  }
});
