// Rebuilds the import-map block inside index.html.
// Merges three sources:
//   1. every package vendored under src/vendor/node_modules (resolved from each
//      package.json exports, falling back to main/index.js)
//   2. every export of the vendored pey.webui package (from its package.json)
//   3. the @pey/core package entry
// The script fails loudly when a bare import inside the vendored tree has no
// import-map entry, so a missing package can never break the browser boot
// silently again.
// Run with: node src/scripts/build-import-map.mjs

import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const HTML_PATH = new URL('../../index.html', import.meta.url);
const VENDOR_DIR = new URL('../../src/vendor/node_modules/', import.meta.url);
const WEBUI_PACKAGE_PATH = new URL('../../src/ui-kit/package.json', import.meta.url);
const IMPORT_MAP_MARKER = /<script type="importmap">[\s\S]*?<\/script>/;
const BARE_IMPORT_PATTERN = /from\s+['"]([^'"][^'"]*)['"]|import\s*\(\s*['"]([^'"][^'"]*)['"]\s*\)/g;

/** Resolves a package export target to a relative file path. */
function resolveExportTarget(target) {
  if (typeof target === 'string') {
    return target;
  }
  if (target !== null && typeof target === 'object') {
    // Export conditions: prefer default, then import, then the first string.
    for (const key of ['default', 'import', 'require']) {
      if (typeof target[key] === 'string') {
        return target[key];
      }
    }
    for (const value of Object.values(target)) {
      const resolved = resolveExportTarget(value);
      if (resolved !== null) {
        return resolved;
      }
    }
  }
  return null;
}

async function buildVendorImports() {
  // The map covers exactly the pinned dependency list — npm may also drop
  // never-imported transitive extras (debug, ms, devlop, @types) into
  // node_modules; they must not grow the map (some have CJS-style main
  // fields that are not valid browser targets).
  const pinned = JSON.parse(await readFile(new URL('../package.json', VENDOR_DIR), 'utf8')).dependencies;
  const entries = {};
  for (const name of Object.keys(pinned)) {
    const packageDir = new URL(`${name}/`, VENDOR_DIR);
    if (!(await stat(packageDir)).isDirectory()) {
      continue;
    }

    const pkg = JSON.parse(await readFile(new URL(`${name}/package.json`, VENDOR_DIR), 'utf8'));
    const rootExport = pkg.exports?.['.'] ?? pkg.exports ?? {};
    const target = resolveExportTarget(rootExport)
      ?? (typeof pkg.main === 'string' ? pkg.main : null)
      ?? 'index.js';

    if (target === null) {
      throw new Error(`Vendored package "${name}" has no resolvable entry`);
    }
    entries[name] = `./src/vendor/node_modules/${name}/${target.replace(/^\.\//, '')}`;
  }
  return entries;
}

async function collectBareImports() {
  const needed = new Set();

  async function walk(dirUrl) {
    for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
      const entryUrl = new URL(`${entry.name}/`, dirUrl);
      const entryPath = join(dirUrl.pathname, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'dev' || entry.name === 'test' || entry.name === 'playground') {
          continue;
        }
        await walk(entryUrl);
      } else if (entry.name.endsWith('.js')) {
        const source = await readFile(entryPath, 'utf8');
        for (const match of source.matchAll(BARE_IMPORT_PATTERN)) {
          const specifier = match[1] ?? match[2];
          if (specifier && !specifier.startsWith('.') && !specifier.startsWith('node:') && !specifier.startsWith('/')) {
            const packageName = specifier.startsWith('@')
              ? specifier.split('/').slice(0, 2).join('/')
              : specifier.split('/')[0];
            needed.add(packageName);
          }
        }
      }
    }
  }

  await walk(VENDOR_DIR);
  return needed;
}

async function buildWebuiImports() {
  const webuiPackage = JSON.parse(await readFile(WEBUI_PACKAGE_PATH, 'utf8'));
  const imports = {};
  for (const [subpath, target] of Object.entries(webuiPackage.exports)) {
    if (subpath.startsWith('./templates/')) {
      continue;
    }
    imports[`pey.webui${subpath.slice(1)}`] = `./src/ui-kit/${target.replace(/^\.\//, '')}`;
  }
  return imports;
}

const vendorImports = await buildVendorImports();
const imports = {
  ...vendorImports,
  ...(await buildWebuiImports()),
  '@pey/core': './src/core/index.js',
};

// Completeness guard: every bare import in the vendored tree must resolve.
const needed = await collectBareImports();
const missing = [...needed].filter((name) => !(name in imports));
if (missing.length > 0) {
  throw new Error(`Bare imports without an import-map entry (vendor the package or fix the map): ${missing.join(', ')}`);
}

const importMapBlock = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n  </script>`;

// Static module graph → <link rel="modulepreload"> list. A no-build app
// ships hundreds of small ES modules; a browser that discovers them only by
// executing the import chains pays one network round trip per chain level
// (visible as a very slow boot on any non-localhost hosting). Preloading the
// whole static graph lets the browser fetch everything in parallel up front.
const PROJECT_ROOT = new URL('../../', import.meta.url);
const HOST_ENTRY = 'src/host/browser-host.js';
const MODULE_SPECIFIER_PATTERN = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

function toRootRelative(url) {
  return url.href.startsWith(PROJECT_ROOT.href)
    ? decodeURIComponent(url.href.slice(PROJECT_ROOT.href.length))
    : null;
}

async function collectModuleGraph(roots, imports) {
  const graph = new Set();
  const queue = [...roots];
  const seen = new Set();
  while (queue.length > 0) {
    const relativePath = queue.pop();
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    let source;
    try {
      source = await readFile(new URL(relativePath, PROJECT_ROOT), 'utf8');
    } catch {
      continue; // a root that does not exist (or a false positive) is not a module
    }
    graph.add(relativePath);
    for (const match of source.matchAll(MODULE_SPECIFIER_PATTERN)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      let target = null;
      if (specifier.startsWith('.')) {
        target = toRootRelative(new URL(specifier, new URL(relativePath, PROJECT_ROOT)));
      } else if (!specifier.startsWith('node:')) {
        const mapped = imports[specifier];
        target = typeof mapped === 'string' ? mapped.replace(/^\.\//, '') : null;
      }
      if (target !== null && target.endsWith('.js')) {
        queue.push(target);
      }
    }
  }
  return graph;
}

const bootstrap = JSON.parse(await readFile(new URL('bootstrap.json', PROJECT_ROOT), 'utf8'));
const graphRoots = [
  HOST_ENTRY,
  ...(bootstrap.plugins ?? []).map((plugin) => `${plugin.path.replace(/^\.\//, '')}/index.js`),
  `${(bootstrap.config?.ui?.path ?? './src/ui').replace(/^\.\//, '')}/index.js`,
];
const moduleGraph = await collectModuleGraph(graphRoots, imports);
const modulePreloadBlock = `  <!-- Module preloads (generated by npm run build:import-map — do not edit) -->\n${[...moduleGraph].sort()
    .map((path) => `  <link rel="modulepreload" href="${path}">`)
    .join('\n')}\n  <!-- /Module preloads -->`;
const MODULE_PRELOAD_MARKER = /^[ \t]*<!-- Module preloads \(generated by npm run build:import-map — do not edit\) -->\n[\s\S]*?^[ \t]*<!-- \/Module preloads -->/m;

const html = await readFile(HTML_PATH, 'utf8');
if (!IMPORT_MAP_MARKER.test(html)) {
  throw new Error('index.html has no importmap script block to replace');
}
if (!MODULE_PRELOAD_MARKER.test(html)) {
  throw new Error('index.html has no module-preload marker block to replace');
}

let updatedHtml = html.replace(IMPORT_MAP_MARKER, importMapBlock);
updatedHtml = updatedHtml.replace(MODULE_PRELOAD_MARKER, modulePreloadBlock);
await writeFile(HTML_PATH, updatedHtml);
console.log(`import map rebuilt with ${Object.keys(imports).length} entries (all ${needed.size} bare imports resolve); module preload list: ${moduleGraph.size} modules`);
