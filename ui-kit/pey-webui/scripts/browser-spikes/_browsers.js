// Shared browser engine loading and decision-record writing for the spikes.
import { mkdir, writeFile } from 'node:fs/promises';

const ENGINES = ['chromium', 'firefox', 'webkit'];

export function parseEngines(argv) {
  const requested = argv.filter((arg) => !arg.startsWith('-'));
  const chosen = requested.filter((name) => ENGINES.includes(name));
  if (argv.includes('--all')) return [...ENGINES];
  return chosen.length > 0 ? chosen : ['chromium'];
}

export async function loadEngines(names) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    throw new Error('Playwright is required to run the browser spikes. Install it with:\n  npm install --save-dev playwright');
  }
  const engines = [];
  for (const name of names) {
    if (playwright[name]) {
      // Prefer a system/CI browser when Playwright's own download is not
      // available, e.g. PEY_SPIKE_CHROMIUM_PATH=/usr/bin/chromium.
      const executablePath = process.env[`PEY_SPIKE_${name.toUpperCase()}_PATH`];
      engines.push({
        name,
        launch: (options = {}) =>
          playwright[name].launch({ ...options, ...(executablePath ? { executablePath } : {}) }),
      });
    }
  }
  if (engines.length === 0) {
    throw new Error(`None of the requested engines are installed (${names.join(', ')}). Run: npx playwright install`);
  }
  return engines;
}

let decisionCounter = 0;

export async function writeDecision(name, engine, mount, scenarios, outcome = {}) {
  const dir = new URL('decisions/', import.meta.url);
  await mkdir(dir, { recursive: true });
  // Date.now() alone is not unique: several records in one run can be written
  // within the same millisecond and silently overwrite each other, so a
  // monotonic counter makes the filename unique per write.
  const file = new URL(`${name}-${engine}-${Date.now()}-${decisionCounter++}.json`, dir);
  await writeFile(
    file,
    JSON.stringify(
      { spike: name, engine, mount, ranAt: new Date().toISOString(), passed: outcome.passed, decision: outcome.decision ?? null, scenarios },
      null,
      2,
    ),
  );
  return file;
}

export function collectA11yNodes(snapshot, acc = []) {
  const roots = Array.isArray(snapshot) ? snapshot : (snapshot ? [snapshot] : []);
  for (const node of roots) {
    if (node.role) acc.push(node);
    for (const child of node.children ?? []) collectA11yNodes(child, acc);
  }
  return acc;
}

// CDP (Accessibility.getFullAXTree) reports role/name as { value } objects,
// while the removed Playwright API reported plain strings. Normalize both.
export function roleOf(node) {
  return typeof node.role === 'string' ? node.role : node.role?.value;
}

export function nameOf(node) {
  return typeof node.name === 'string' ? node.name : node.name?.value ?? '';
}

// Playwright removed its accessibility API, so the accessibility tree is read
// through CDP when the engine supports it. Returns null when unavailable; the
// spikes then fall back to DOM-level checks, which is why the in-page fixture
// records the aria/focusable/role facts directly.
export async function getAccessibilityTree(page) {
  if (page.accessibility?.snapshot) {
    return page.accessibility.snapshot();
  }
  if (page.context().newCDPSession) {
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    return nodes;
  }
  return null;
}
