// Validates phase 1 exports and application Entry Point integration.
import { readFile } from 'node:fs/promises';

import { createApplicationSetup } from '../shell/create-application-setup.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const TEMPLATE_URL = new URL('../templates/application-entry-point.js', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));
  const template = await readFile(TEMPLATE_URL, 'utf8');

  assert(typeof createApplicationSetup === 'function', 'Phase 1 setup helper is missing');
  assert(
    packageData.exports['./shell/create-application-setup']
      === './shell/create-application-setup.js',
    'Phase 1 setup helper export is invalid',
  );
  assert(
    template.includes("from 'pey.webui/shell/create-application-setup'"),
    'Application Entry Point template must consume the package helper',
  );
  assert(
    template.includes('assetBaseUrlBase: import.meta.url'),
    'Application Entry Point must own relative asset resolution',
  );

  console.log('Phase 1 contracts are valid.');
}

await main();
