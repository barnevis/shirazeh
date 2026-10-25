// Validates the phase 0 package and application-template contracts.
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';

import {
  DEFAULT_UI_CONFIG,
  PEY_ELEMENT_TAG_PREFIX,
  PEY_ROUTER_SERVICE,
  UI_COMPONENT_ERROR_EVENT,
} from '../contracts.js';

const APPLICATION_MANIFEST_PATH = new URL(
  '../templates/application-manifest.json',
  import.meta.url,
);
const FORBIDDEN_KIT_PATHS = [
  new URL('../index.js', import.meta.url),
  new URL('../manifest.json', import.meta.url),
  new URL('../ui', import.meta.url),
];
const REQUIRED_KIT_DIRECTORIES = [
  'assets',
  'base',
  'components',
  'docs',
  'i18n',
  'pages',
  'routing',
  'shell',
  'templates',
  'tests/routing',
];
const REQUIRED_KIT_FILES = ['contracts.js', 'tokens.css'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readApplicationManifest() {
  const source = await readFile(APPLICATION_MANIFEST_PATH, 'utf8');
  return JSON.parse(source);
}

async function readPathType(path) {
  try {
    return await stat(new URL(`../${path}`, import.meta.url));
  } catch {
    throw new Error(`Required phase 0 path is missing: ${path}`);
  }
}

function validateManifest(manifest) {
  assert(manifest.architecture === '0.11', 'Template must target architecture 0.11');
  assert(!('type' in manifest), 'UI manifest must not declare type');
  assert(!('provides' in manifest), 'UI manifest must not declare provides');
  assert(!('adapterType' in manifest), 'UI manifest must not declare adapterType');
  assert(
    manifest.dependencies
      && typeof manifest.dependencies === 'object'
      && !Array.isArray(manifest.dependencies),
    'UI manifest dependencies must be an object',
  );
  assert(
    Array.isArray(manifest.dependencies.required),
    'UI manifest dependencies.required must be an array',
  );
  assert(
    Array.isArray(manifest.dependencies.optional),
    'UI manifest dependencies.optional must be an array',
  );
  assert(Array.isArray(manifest.events), 'UI manifest events must be an array');
  assert(
    manifest.dependencies.required.includes(PEY_ROUTER_SERVICE),
    'UI manifest must require pey.router.service',
  );

  const componentError = manifest.events.find(
    (event) => event && typeof event === 'object'
      && event.name === UI_COMPONENT_ERROR_EVENT,
  );
  assert(componentError, 'UI manifest must declare ui:component-error');
  assert(
    Array.isArray(componentError.data),
    'ui:component-error data must be an array',
  );
  assert(
    componentError.data.every(
      (field) => field && typeof field === 'object' && field.name && field.type,
    ),
    'Event data fields must use { name, type } objects',
  );
}

function validateContracts() {
  assert(PEY_ELEMENT_TAG_PREFIX === 'pey-', 'Kit custom elements must use pey-');
  assert(
    `${PEY_ELEMENT_TAG_PREFIX}app-shell` === 'pey-app-shell',
    'Tag suffixes must not introduce a second hyphen',
  );
  assert(DEFAULT_UI_CONFIG.direction === 'auto', 'Default direction must be auto');
  assert(DEFAULT_UI_CONFIG.assetBaseUrl, 'assetBaseUrl must have a default');
  assert(Object.isFrozen(DEFAULT_UI_CONFIG), 'Default UI config must be immutable');
}

async function validateNoCoreEntryPoint() {
  const results = await Promise.all(FORBIDDEN_KIT_PATHS.map(pathExists));
  assert(results.every((exists) => !exists), 'Kit must not contain a Core UI entry point');
}

async function validateFlatLayout() {
  for (const path of REQUIRED_KIT_DIRECTORIES) {
    const pathStat = await readPathType(path);
    assert(pathStat.isDirectory(), `${path} must be a directory`);
  }

  for (const path of REQUIRED_KIT_FILES) {
    const pathStat = await readPathType(path);
    assert(pathStat.isFile(), `${path} must be a file`);
  }
}

async function main() {
  const manifest = await readApplicationManifest();
  validateManifest(manifest);
  validateContracts();
  await validateNoCoreEntryPoint();
  await validateFlatLayout();
  console.log('Phase 0 contracts are valid.');
}

await main();
