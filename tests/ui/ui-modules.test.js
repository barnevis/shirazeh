// Guards UI modules against two classes of silent breakage:
//  - duplicate private class fields (a SyntaxError only surfaced by the
//    browser at module evaluation time, which the page host turns into a
//    "page could not be loaded" fallback)
//  - syntax errors in general (node --check on every UI module)

import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';

const UI_ROOT = new URL('../../ui/', import.meta.url);
const PRIVATE_FIELD_PATTERN = /^\s*(#[a-zA-Z][a-zA-Z0-9]*)\s*=/gm;

async function collectJsFiles(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}/`, dir);
    if (entry.isDirectory()) {
      await collectJsFiles(entryUrl, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(new URL(entry.name, dir));
    }
  }
  return files;
}

test('should_declare_each_private_field_once_when_ui_modules_are_scanned', async () => {
  const files = await collectJsFiles(UI_ROOT);
  assert.ok(files.length > 0, 'no UI modules found');

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const declared = new Set();
    const duplicates = new Set();
    for (const match of source.matchAll(PRIVATE_FIELD_PATTERN)) {
      if (declared.has(match[1])) {
        duplicates.add(match[1]);
      }
      declared.add(match[1]);
    }
    assert.deepEqual(
      [...duplicates],
      [],
      `${file.pathname} declares private fields more than once: ${[...duplicates].join(', ')}`,
    );
  }
});

test('should_parse_every_ui_module_when_node_check_runs', async () => {
  const files = await collectJsFiles(UI_ROOT);

  for (const file of files) {
    execFileSync(process.execPath, ['--check', file.pathname], { stdio: 'pipe' });
  }
});
