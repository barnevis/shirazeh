// Regression guard for the GitHub Pages deploy: every import-map entry in
// index.html must resolve to a real file in the working tree. The vendored
// browser dependencies are NOT committed to git (they are rebuilt by
// `npm run vendor` from src/vendor/package.json), so a stale map or a
// missing vendored package only broke on the deployed site with a
// "disallowed MIME type" error — this test makes that failure local and
// immediate. Runs after `npm run vendor` locally and in the deploy workflow.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';

test('should_resolve_every_import_map_entry_to_an_existing_file', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const mapMatch = html.match(/<script type="importmap">\s*(\{[\s\S]*?\})\s*<\/script>/);
  assert.ok(mapMatch, 'index.html must contain an import map');
  const map = JSON.parse(mapMatch[1]);
  const entries = Object.entries(map.imports);
  assert.ok(entries.length >= 30, `expected the full import map, found ${entries.length} entries`);

  for (const [specifier, target] of entries) {
    const fileUrl = new URL(target, new URL('../../', import.meta.url));
    await access(fileUrl); // throws ENOENT when the target is missing
  }
});
