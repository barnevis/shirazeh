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

const html = await readFile(HTML_PATH, 'utf8');
if (!IMPORT_MAP_MARKER.test(html)) {
  throw new Error('index.html has no importmap script block to replace');
}

await writeFile(HTML_PATH, html.replace(IMPORT_MAP_MARKER, importMapBlock));
console.log(`import map rebuilt with ${Object.keys(imports).length} entries (all ${needed.size} bare imports resolve)`);
