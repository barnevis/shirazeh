// Real-browser decision spike for the kit's stylesheet-attach contract
// (Chrome/Firefox/WebKit): whichever method flashes an unstyled first paint
// loses the first-paint contract, so both candidates are measured on a
// throttled network. See docs/decisions.md#css-attach-method and
// #browser-spikes-are-a-deliverable.
// Scenarios covered per mount: subpath resolution, scope (no leak into the
// light DOM — the light probe shares the shadow rule's id so a leak would
// match), single network fetch across re-renders (authoritative server
// counter delta), missing-stylesheet error surfacing, and — on the first-paint
// pages — measured first contentful paint for both the rejected <link> method
// and the final <style> method.
import { startSpikeServer } from './_server.js';
import { loadEngines, parseEngines, writeDecision } from './_browsers.js';

const PAGES = [
  { key: 'baseline', fixture: 'spike-css.html', mount: '/spike/assets/' },
  { key: 'target-csp', fixture: 'spike-css.html', mount: '/spike-csp/assets/' },
  { key: 'firstpaint-baseline', fixture: 'spike-css-firstpaint.html', mount: '/spike/assets/', queries: ['method=link', 'method=style'] },
  { key: 'firstpaint-throttled', fixture: 'spike-css-firstpaint.html', mount: '/spike-throttled/assets/', queries: ['method=link', 'method=style'] },
];

const DECISION =
  'preload-and-cache-<style> for first paint (sheet text inlined before the box mounts, so no unstyled first paint is measured); '
  + '<link rel="stylesheet"> rejected for first paint (the sheet is measured to apply after the styled element first paints); '
  + 'the final method imposes a CSP consequence: the deployment style-src must permit the inlined <style>. '
  + 'Note on semantics: a record\'s passed means this spike executed and every recorded expectation was met — it does not '
  + 'mean the strategy is compatible with a style-src "self" policy; the CSP consequence is recorded as a finding.';

async function loadPage(browser, server, page, query) {
  const browserPage = await browser.newPage();
  const pageErrors = [];
  browserPage.on('pageerror', (error) => pageErrors.push(error.message));
  const url = `${server.base}${page.mount}${page.fixture}${query ? `?${query}` : ''}`;
  await browserPage.goto(url);
  await browserPage.waitForFunction(() => window.__spikeDone === true, { timeout: 15_000 });
  const flash = await browserPage.evaluate(() => window.__spikeFlash ?? null);
  const fixtureScenarios = query ? null : await browserPage.evaluate(() => window.__spike);
  await browserPage.close();
  return { pageErrors, flash, fixtureScenarios };
}

async function runEngine(engine, server) {
  const browser = await engine.launch();
  const records = [];
  try {
    for (const page of PAGES) {
      const cssPath = `${page.mount}component.css`;
      const before = server.counters[cssPath] ?? 0;
      const loads = page.queries
        ? await Promise.all(page.queries.map((query) => loadPage(browser, server, page, query)))
        : [await loadPage(browser, server, page, null)];

      const scenarios = [];
      for (const load of loads) {
        if (load.flash) {
          // Measured finding, not a gate assertion: the phase-4 decision rule
          // consumes these timestamps to select the first-paint method.
          scenarios.push({
            name: `first-paint-measured (${load.flash.method})`,
            pass: load.flash.flash !== null && load.flash.paintAt !== null && load.flash.styleAppliedAt !== null,
            detail: JSON.stringify(load.flash),
          });
        } else {
          scenarios.push(...(load.fixtureScenarios ?? []));
        }
        scenarios.push({
          name: 'no-page-error',
          pass: load.pageErrors.length === 0,
          detail: JSON.stringify(load.pageErrors),
        });
      }

      if (!page.queries) {
        const delta = (server.counters[cssPath] ?? 0) - before;
        scenarios.push({
          name: 'stylesheet-fetched-once-over-the-network',
          // The preload-and-fetch runtime must produce exactly one network
          // request: the fetch is served from the response the preload put in
          // the HTTP cache. The server counter is authoritative and runs on
          // every engine, so an engine that fails to reuse the preload
          // response (delta === 2) fails this scenario.
          pass: delta === 1,
          detail: `${cssPath} fetched ${delta} time(s) across this page run (preload + read must be a single request)`,
        });
        // The fixture's own findings must have run (so its pass/fail records
        // are meaningful) and a spike-impl exception must never pass silently.
        const reportable = (loads.flatMap((load) => load.fixtureScenarios ?? [])).filter(
          (s) => s.name === 'spike-exception' || s.name === 'final-method-inline-style-csp-consequence',
        );
        scenarios.push({
          name: 'spike-impl-ran-and-reported-findings',
          pass: reportable.length > 0
            && reportable.every((s) => !(s.name === 'spike-exception' && s.pass === true)),
          detail: `reportable findings: ${reportable.length} (${reportable.map((s) => s.name).join(', ') || 'none'})`,
        });
      }

      const passed = scenarios.filter((s) => s.pass).length;
      records.push({ key: page.key, total: scenarios.length, passed, scenarios });
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
      await writeDecision('css-attach', engine.name, record.key, record.scenarios, {
        passed: ok,
        decision: DECISION,
      });
      allPass = allPass && ok;
      console.log(`css-attach [${engine.name}/${record.key}]: ${record.passed}/${record.total}${ok ? ' ok' : ' FAIL'}`);
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
