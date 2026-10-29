// Real-browser spike for the kit's provisional icon-sprite contract: verifies
// <svg><use> inside an open Shadow DOM (subpath assetBaseUrl, target CSP, a
// real delegated click, per-engine accessibility-tree coverage) in Chrome,
// Firefox and WebKit. See docs/decisions.md#icon-sprite-contract and
// #browser-spikes-are-a-deliverable.
import { startSpikeServer } from './_server.js';
import { collectA11yNodes, getAccessibilityTree, loadEngines, nameOf, parseEngines, roleOf, writeDecision } from './_browsers.js';

const MOUNTS = [
  { key: 'baseline', path: '/spike/assets/spike-svg.html' },
  { key: 'target-csp', path: '/spike-csp/assets/spike-svg.html' },
];

async function runEngine(engine, server) {
  const browser = await engine.launch();
  const records = [];
  try {
    for (const mount of MOUNTS) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(server.base + mount.path);
      await page.waitForFunction(() => window.__spikeDone === true, { timeout: 15_000 });
      const scenarios = await page.evaluate(() => window.__spike);

      // Delegated click on the nested SVG, via a real Playwright click so the
      // event is genuinely composed across the shadow boundary. At the document
      // the retargeted target is the shadow host.
      const icon = page.locator('pey-icon svg').first();
      await icon.click();
      const clicks = await page.evaluate(() => window.__spikeClicks);
      scenarios.push({
        name: 'delegated-click-bubbles',
        pass: clicks.length === 1 && clicks[0] === 'PEY-ICON',
        detail: JSON.stringify(clicks),
      });

      const buttonName = await page.evaluate(() => {
        const button = document.getElementById('save');
        return (button?.textContent ?? '').trim();
      });
      scenarios.push({
        name: 'labeled-control-name-source',
        pass: buttonName === 'Save',
        detail: buttonName,
      });

      // Accessibility tree facts come from the real browser tree where the
      // engine exposes one to the runner (Chromium via CDP); the other engines
      // fall back to the DOM-level aria/focusable/role checks the fixture
      // recorded. The coverage is recorded explicitly so the decision records
      // never claim real-tree verification for engines that only got DOM checks.
      let a11yTree = null;
      let a11ySource = 'dom-only';
      try {
        a11yTree = await getAccessibilityTree(page);
        a11ySource = a11yTree ? 'real-browser-tree' : 'dom-only';
      } catch {
        a11yTree = null;
        a11ySource = 'dom-only';
      }
      scenarios.push({
        name: 'a11y-tree-coverage',
        pass: true,
        detail: `${engine.name}: ${a11ySource}`,
      });
      if (a11yTree) {
        const nodes = collectA11yNodes(a11yTree);
        const named = nodes.filter((node) => nameOf(node).trim().length > 0);
        const svgLeaks = named.filter((node) => /arrow|check/.test(nameOf(node)));
        scenarios.push({
          name: 'decorative-svg-absent-from-a11y-tree',
          pass: svgLeaks.length === 0,
          detail: JSON.stringify(named.slice(0, 6).map((node) => ({ role: roleOf(node), name: nameOf(node) }))),
        });
        const button = nodes.find((node) => roleOf(node) === 'button');
        scenarios.push({
          name: 'labeled-control-accessible-name',
          pass: Boolean(button && nameOf(button) === 'Save'),
          detail: JSON.stringify(button ? { role: roleOf(button), name: nameOf(button) } : null),
        });
      }

      scenarios.push({
        name: 'no-page-error',
        pass: pageErrors.length === 0,
        detail: JSON.stringify(pageErrors),
      });
      const passed = scenarios.filter((s) => s.pass).length;
      records.push({
        mount: mount.key,
        total: scenarios.length,
        passed,
        scenarios,
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return records;
}

const engines = await loadEngines(parseEngines(process.argv.slice(2)));
const server = await startSpikeServer();
let allPass = true;
try {
  for (const engine of engines) {
    const records = await runEngine(engine, server);
    for (const record of records) {
      const ok = record.passed === record.total;
      await writeDecision('svg-use', engine.name, record.mount, record.scenarios, {
        passed: ok,
        decision: `icon-sprite contract ${ok ? 'holds' : 'fails'} on ${engine.name}/${record.mount}; provisional until Chrome, Firefox and WebKit each record a passing run`,
      });
      allPass = allPass && ok;
      console.log(`svg-use [${engine.name}/${record.mount}]: ${record.passed}/${record.total}${ok ? ' ok' : ' FAIL'}`);
      if (!ok) {
        for (const scenario of record.scenarios.filter((s) => !s.pass)) {
          console.log(`  - ${scenario.name}: ${scenario.detail}`);
        }
      }
    }
  }
} finally {
  await server.close();
}

if (!allPass) process.exitCode = 1;
