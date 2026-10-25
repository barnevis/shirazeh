// Validates the phase 7 deliverables: the documentation set, the contract
// test suite (run headlessly against the jsdom-backed tests), the browser
// spike harness for the provisional asset/CSS contracts, and the guarantee
// that the kit itself is not Core-loadable.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT_URL = new URL('../', import.meta.url);
const ROOT = fileURLToPath(ROOT_URL);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(url) {
  return readFile(url, 'utf8');
}

const DOCS = [
  'README.md',
  'public-api.md',
  'decisions.md',
  'configuration.md',
  'entry-point.md',
  'component-index.md',
  'shared-infrastructure.md',
];

const TEST_FILES = [
  'tests/base/pey-element.test.js',
  'tests/base/icon-sprite.test.js',
  'tests/shared-state.test.js',
  'tests/shell/app-shell.test.js',
  'tests/shell/create-application-setup.test.js',
  'tests/routing/page-loader.test.js',
  'tests/routing/page-host.test.js',
  'tests/routing/page-fallback.test.js',
  'tests/i18n/catalog.test.js',
  'tests/i18n/create-i18n.test.js',
  'tests/templates/application-manifest.test.js',
];

const BROWSER_SPIKES = [
  'scripts/browser-spikes/svg-use-spike.js',
  'scripts/browser-spikes/css-attach-spike.js',
  'scripts/browser-spikes/README.md',
  'scripts/browser-spikes/_server.js',
  'scripts/browser-spikes/_browsers.js',
  'scripts/browser-spikes/fixtures/icons.svg',
  'scripts/browser-spikes/fixtures/component.css',
  'scripts/browser-spikes/fixtures/spike-svg.html',
  'scripts/browser-spikes/fixtures/spike-svg.js',
  'scripts/browser-spikes/fixtures/spike-css.html',
  'scripts/browser-spikes/fixtures/spike-css.js',
  'scripts/browser-spikes/fixtures/spike-css-firstpaint.html',
  'scripts/browser-spikes/fixtures/spike-css-firstpaint.js',
  'scripts/browser-spikes/decisions/README.md',
];

const UI_MAP_TOKENS = [
  'PeyElement',
  'AppShell',
  'PageFallback',
  'icon-sprite',
  'tokens.css',
  'page-loader',
  'page-host',
  'i18n',
];

const SVG_SPIKE_TOKENS = ['Chrome', 'Firefox', 'WebKit', 'subpath', 'CSP', '<use>'];
const CSS_SPIKE_TOKENS = ['Chrome', 'Firefox', 'WebKit', 'flash', '<link rel="stylesheet">'];

function lastCount(output, patterns) {
  let found = -1;
  for (const pattern of patterns) {
    for (const match of output.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) found = value;
    }
  }
  return found;
}

async function main() {
  for (const doc of DOCS) {
    const url = doc === 'README.md'
      ? new URL(doc, ROOT_URL)
      : new URL(`docs/${doc}`, ROOT_URL);
    assert(existsSync(url), `Phase 7 doc is missing: ${url.pathname}`);
  }
  for (const testFile of TEST_FILES) {
    assert(existsSync(new URL(testFile, ROOT_URL)), `Phase 7 test file is missing: ${testFile}`);
  }
  for (const spike of BROWSER_SPIKES) {
    assert(existsSync(new URL(spike, ROOT_URL)), `Phase 7 browser spike artifact is missing: ${spike}`);
  }

  assert(
    !existsSync(new URL('index.js', ROOT_URL)) && !existsSync(new URL('manifest.json', ROOT_URL)),
    'The kit must not ship a Core-loadable index.js or manifest.json',
  );

  const manifest = JSON.parse(await readText(new URL('templates/application-manifest.json', ROOT_URL)));
  assert(!('type' in manifest) && !('provides' in manifest) && !('adapterType' in manifest), 'The application manifest template must not declare type, provides, or adapterType');
  assert(manifest.dependencies.required.includes('pey.router.service'), 'The application manifest template must require pey.router.service');
  const componentError = manifest.events?.find(({ name }) => name === 'ui:component-error');
  assert(componentError, 'The application manifest template must declare ui:component-error');
  assert(
    componentError.data?.every(({ name, type }) => typeof name === 'string' && typeof type === 'string'),
    'The ui:component-error event must declare { name, type } data fields',
  );

  const packageData = JSON.parse(await readText(new URL('package.json', ROOT_URL)));
  for (const exportName of [
    './contracts',
    './shared-state',
    './base/pey-element',
    './base/icon-sprite',
    './shell/create-application-setup',
    './shell/app-shell',
    './routing/page-loader',
    './routing/page-host',
    './routing/page-fallback',
    './i18n',
    './i18n/catalog',
    './tokens.css',
    './assets/icons.svg',
  ]) {
    assert(typeof packageData.exports?.[exportName] === 'string', `Phase 7 export is missing: ${exportName}`);
  }
  assert(typeof packageData.scripts?.spikes === 'string', 'The package must expose a spikes script');

  const componentIndex = await readText(new URL('docs/component-index.md', ROOT_URL));
  for (const token of UI_MAP_TOKENS) {
    assert(componentIndex.includes(token), `The component index (UI map) must stay in sync and reference ${token}`);
  }

  const svgSpike = await readText(new URL('scripts/browser-spikes/svg-use-spike.js', ROOT_URL));
  for (const token of SVG_SPIKE_TOKENS) {
    assert(svgSpike.includes(token), `The SVG-use spike must reference the ${token} scenario`);
  }
  const cssSpike = await readText(new URL('scripts/browser-spikes/css-attach-spike.js', ROOT_URL));
  for (const token of CSS_SPIKE_TOKENS) {
    assert(cssSpike.includes(token), `The CSS-attach spike must reference the ${token} scenario`);
  }

  // The jsdom suite is a headless contract gate; its pass/fail is decided by
  // the runner exit code (version-independent) and only mirrored by parsing the
  // summary line in whatever reporter shape the runtime emits (spec or TAP).
  let output;
  try {
    output = execFileSync(process.execPath, ['--test'], { cwd: ROOT, encoding: 'utf8' });
  } catch (error) {
    throw new Error(`The full test suite failed (exit ${error.status ?? 'unknown'}).`);
  }

  const pass = lastCount(output, [/(?:^|\s)ℹ pass\s+(\d+)/gm, /^# pass\s+(\d+)$/gm]);
  const fail = lastCount(output, [/(?:^|\s)ℹ fail\s+(\d+)/gm, /^# fail\s+(\d+)$/gm]);
  assert(fail === -1 || fail === 0, `The full test suite must have zero failures; parsed fail=${fail}`);
  assert(pass === -1 || pass > 0, 'The full test suite must report at least one passing test');

  console.log(`Phase 7 contracts are valid (suite exit 0${pass >= 0 ? `, ${pass} tests passing` : ''}).`);
}

await main();
