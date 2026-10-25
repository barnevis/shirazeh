// Verifies the user-configuration mapping and merge for the browser host.

import assert from 'node:assert/strict';
import test from 'node:test';
import { applyUserConfig } from '../host/user-config.js';

function createBootstrapContent() {
  return {
    architecture: '0.11',
    core: { name: 'pey.core', version: '0.2.0' },
    adapters: { router: 'HashHistoryAdapter' },
    ui: { path: './ui' },
    plugins: [{ name: 'shirazeh.docs', version: '0.1.0', path: './plugins/shirazeh.docs' }],
    config: {
      ui: { language: 'fa', direction: 'rtl', theme: 'light' },
      'shirazeh.docs': { docsRoot: './docs', homePage: 'README.md' },
    },
    app: { name: 'شیرازه', version: '0.2.0' },
  };
}

test('should_override_ui_values_when_user_config_sets_them', () => {
  const content = createBootstrapContent();

  const result = applyUserConfig(content, { language: 'en', theme: 'dark' });

  assert.equal(result.config.ui.language, 'en');
  assert.equal(result.config.ui.theme, 'dark');
  assert.equal(result.config.ui.direction, 'rtl');
});

test('should_override_docs_values_when_user_config_sets_them', () => {
  const content = createBootstrapContent();

  const result = applyUserConfig(content, { docsRoot: './my-docs', sidebarFile: 'nav.md' });

  assert.equal(result.config['shirazeh.docs'].docsRoot, './my-docs');
  assert.equal(result.config['shirazeh.docs'].sidebarFile, 'nav.md');
  assert.equal(result.config['shirazeh.docs'].homePage, 'README.md');
});

test('should_deep_merge_nested_user_objects_when_target_exists', () => {
  const content = createBootstrapContent();
  content.config.ui.toc = { maxDepth: 3, title: 'فهرست' };

  const result = applyUserConfig(content, { toc: { maxDepth: 2 } });

  assert.deepEqual(result.config.ui.toc, { maxDepth: 2, title: 'فهرست' });
});

test('should_return_same_content_when_user_config_is_null', () => {
  const content = createBootstrapContent();

  const result = applyUserConfig(content, null);

  assert.equal(result, content);
});

test('should_warn_and_ignore_when_user_config_is_not_an_object', () => {
  const warnings = [];

  const result = applyUserConfig(createBootstrapContent(), 'oops', (m) => warnings.push(m));

  assert.equal(result.config.ui.language, 'fa');
  assert.equal(warnings.length, 1);
});

test('should_warn_and_ignore_unknown_keys_when_user_config_has_typos', () => {
  const warnings = [];

  const result = applyUserConfig(createBootstrapContent(), { langauge: 'en' }, (m) => warnings.push(m));

  assert.equal(result.config.ui.language, 'fa');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].includes('langauge'), true);
});

test('should_not_mutate_bootstrap_content_when_user_config_is_applied', () => {
  const content = createBootstrapContent();

  applyUserConfig(content, { language: 'en' });

  assert.equal(content.config.ui.language, 'fa');
});

test('should_keep_technical_sections_untouched_when_user_config_is_applied', () => {
  const content = createBootstrapContent();

  const result = applyUserConfig(content, { language: 'en', plugins: [], adapters: { router: 'X' } });

  assert.equal(result.plugins, content.plugins);
  assert.equal(result.adapters, content.adapters);
  assert.equal(result.architecture, content.architecture);
});
