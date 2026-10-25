# Browser spike decision records

Each successful spike run writes one `*.json` record per engine and per mount:

- `svg-use-spike-<engine>-<timestamp>-<n>.json`
- `css-attach-spike-<engine>-<timestamp>-<n>.json`

Every record contains `{ spike, engine, mount, ranAt, passed, decision,
scenarios }`, where `scenarios` is the array of `{ name, pass, detail }`
results, `mount` identifies which server mount (`/spike/`, `/spike-csp/`,
`/spike-throttled/`) the run exercised, `passed` is the overall pass/fail for
that record (so it never has to be recomputed from the scenario array), and
`decision` is the human-readable strategy verdict. The outcome feeds the two
phase-4 contracts:

- **Icon sprite** (`assets/icons.svg` + `<svg><use>` markup): stays the default
  strategy while the spike keeps passing in the target engines; the strict-host/CSP
  fallback (the Entry Point inlines the sprite text once and clones the symbol
  into the Shadow DOM) becomes the contract if a target host or CSP blocks
  external sprite references. The `a11y-tree-coverage` scenario records whether
  the real browser accessibility tree was inspected (Chromium via CDP) or only
  DOM-level `aria-hidden`/`focusable`/`role` checks ran (Firefox/WebKit). The
  contract remains provisional until Chrome, Firefox and WebKit each record a
  passing run; so far only Chromium runs have been recorded.
- **CSS attach**: the decision spike measured (in `firstpaint-baseline` /
  `firstpaint-throttled` scenarios) that a plain `<link rel="stylesheet">`
  applies after the styled element's first contentful paint — by a few
  milliseconds on a prompt sheet and by the full ~700ms throttle delay — so
  `<link>` is rejected for first paint. The final method is
  **preload-and-cache-`<style>`**: preload the sheet, inline its text as
  `<style>` before the box mounts, and cache the text across re-renders. The
  record's `decision` field states this selection. Inlining carries a CSP
  consequence: `style-src` must permit the inlined `<style>`; under
  `style-src 'self'` it is blocked, which the fixture records explicitly on the
  target-CSP mount.

Records are build artifacts: they are regenerated on every run and their
presence is what `check:phase-7` verifies, not their content.
