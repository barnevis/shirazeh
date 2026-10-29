// Validates the phase 3 shared-state export and contract surface.
import { readFile } from 'node:fs/promises';

import { createSharedState } from '../shared-state.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const REQUIRED_METHODS = ['get', 'set', 'subscribe', 'clear'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));

  assert(
    packageData.exports['./shared-state'] === './shared-state.js',
    'Phase 3 shared-state export is invalid',
  );
  assert(typeof createSharedState === 'function', 'createSharedState is not exported');
  const store = createSharedState();
  assert(Object.isFrozen(store), 'shared-state store must be frozen');
  for (const method of REQUIRED_METHODS) {
    assert(typeof store[method] === 'function', `shared state is missing ${method}()`);
  }

  console.log('Phase 3 contracts are valid.');
}

await main();