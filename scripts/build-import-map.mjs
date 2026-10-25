// Rebuilds the import-map block inside index.html.
// Merges three sources:
//   1. vendor/node_modules entries (vendor/import-map.part.json)
//   2. every export of the vendored pey.webui package (from its package.json)
//   3. the @pey/core package entry
// Run with: node scripts/build-import-map.mjs

import { readFile, writeFile } from 'node:fs/promises';

const HTML_PATH = new URL('../index.html', import.meta.url);
const VENDOR_PART_PATH = new URL('../vendor/import-map.part.json', import.meta.url);
const WEBUI_PACKAGE_PATH = new URL('../ui-kit/pey-webui/package.json', import.meta.url);
const IMPORT_MAP_MARKER = /<script type="importmap">[\s\S]*?<\/script>/;

async function buildImports() {
  const vendor = JSON.parse(await readFile(VENDOR_PART_PATH, 'utf8'));
  const webuiPackage = JSON.parse(await readFile(WEBUI_PACKAGE_PATH, 'utf8'));

  const peyWebuiImports = {};
  for (const [subpath, target] of Object.entries(webuiPackage.exports)) {
    if (subpath.startsWith('./templates/')) {
      continue;
    }
    peyWebuiImports[`pey.webui${subpath.slice(1)}`] = `./ui-kit/pey-webui/${target.replace(/^\.\//, '')}`;
  }

  return {
    ...vendor,
    ...peyWebuiImports,
    '@pey/core': './core/pey-core/index.js',
  };
}

const imports = await buildImports();
const importMapBlock = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n  </script>`;

const html = await readFile(HTML_PATH, 'utf8');
if (!IMPORT_MAP_MARKER.test(html)) {
  throw new Error('index.html has no importmap script block to replace');
}

await writeFile(HTML_PATH, html.replace(IMPORT_MAP_MARKER, importMapBlock));
console.log(`import map rebuilt with ${Object.keys(imports).length} entries`);
