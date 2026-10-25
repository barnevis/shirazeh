// Validates the phase 2 PeyElement export and contract surface.
import { readFile } from 'node:fs/promises';

import '../tests/setup-dom.js';
import { PeyElement } from '../base/pey-element.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const REQUIRED_METHODS = [
  'onConnect',
  'subscriptions',
  'eventTypes',
  'render',
  'handleEvent',
  'requestRender',
  'publishUIEvent',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));

  assert(
    packageData.exports['./base/pey-element'] === './base/pey-element.js',
    'Phase 2 PeyElement export is invalid',
  );
  assert(typeof PeyElement === 'function', 'PeyElement is not exported');
  assert(PeyElement.prototype instanceof HTMLElement, 'PeyElement must extend HTMLElement');
  for (const method of REQUIRED_METHODS) {
    assert(
      typeof PeyElement.prototype[method] === 'function',
      `PeyElement is missing ${method}()`,
    );
  }

  console.log('Phase 2 contracts are valid.');
}

await main();
