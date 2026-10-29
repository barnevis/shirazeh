// Verifies the application UI manifest template contract.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MANIFEST_URL = new URL('../../templates/application-manifest.json', import.meta.url);

test('should_match_ui_manifest_contract_when_template_is_loaded', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'));

  assert.equal(manifest.architecture, '0.11');
  assert.equal('type' in manifest, false);
  assert.equal('provides' in manifest, false);
  assert.equal('adapterType' in manifest, false);
  assert.deepEqual(manifest.dependencies.required, ['pey.router.service']);
  assert.equal(manifest.dependencies.optional.length, 0);
  assert.deepEqual(
    manifest.events.find(({ name }) => name === 'ui:component-error').data,
    [
      { name: 'componentTag', type: 'string' },
      { name: 'code', type: 'string' },
    ],
  );
});
