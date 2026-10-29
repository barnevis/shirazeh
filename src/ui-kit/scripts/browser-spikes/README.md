# Browser spikes

Real-browser verification for the two phase-4 contracts that jsdom cannot
judge: the shared SVG sprite (`<svg><use>` inside an open Shadow DOM) and the
stylesheet attach method. Both run in **Chrome**, **Firefox** and **WebKit**
through Playwright.

- The **icon-sprite** contract stays *provisional* until Chrome, Firefox and
  WebKit each record a passing run — the existence of the harness is not enough
  on its own. Chromium and Firefox have each recorded passing runs in the
  development environment; WebKit is still unrecorded (no runnable Playwright
  WebKit build on the current system).
- The **CSS-attach** decision is *final*: the decision spike measured that a
  plain `<link rel="stylesheet">` flashes an unstyled first paint, so the final
  method is preload-and-cache-`<style>`.

`docs/decisions.md` tracks that status.

## Run

```sh
npm run spikes              # chromium
npm run spikes -- firefox   # a specific engine
npm run spikes -- --all     # chromium + firefox + webkit
```

Playwright must be installed once:

```sh
npm install --save-dev playwright
```

Playwright's own browser downloads are optional. When a system browser is
present (common in CI and sandboxes), point the spike at it instead — no
download needed:

```sh
PEY_SPIKE_CHROMIUM_PATH=/usr/bin/chromium npm run spikes
PEY_SPIKE_FIREFOX_PATH=/usr/bin/firefox npm run spikes -- firefox
PEY_SPIKE_WEBKIT_PATH=/usr/bin/webkit npm run spikes -- webkit
```

Note: headless Firefox requires a working desktop/DBus session; in bare
sandboxes it may exit on launch. That is an environment limitation, not a
harness failure — the harness launches whichever installed engine is available.

Each spike starts a local static server that serves the fixture directory under
several mounts so the *same* page is exercised under different deployment conditions:

| mount | scenario |
|---|---|
| `/spike/assets/` | baseline deployment subpath |
| `/spike-csp/assets/` | subpath + target CSP (`default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'`) |
| `/spike-throttled/assets/` | subpath + stylesheets delayed ~700ms to simulate a slow network |

The kit root is also mounted (`/pkg/`) so the fixtures import the *real* kit
code rather than a copy: `base/icon-sprite.js` for the SVG spike and
`base/attach-style-sheet.js` for the CSS-attach spike (its final method and the
CSP consequence it records are exactly the package runtime's, `scripts/browser-spikes/css-attach-spike.js`
→ `fixtures/spike-css.js` → `/pkg/base/attach-style-sheet.js`).

## `svg-use-spike`

Proves the icon-sprite contract: sprite URL resolution from an independent
`assetBaseUrl` under a subpath deployment (never from the router `basePath`),
`<svg aria-hidden="true" focusable="false"><use>` markup, the external `<use>`
actually painting inside the open Shadow DOM (polled until the sprite is
fetched, not a fixed wait), exclusion from the accessibility tree while a
labeled control keeps its accessible name, and a delegated click on the nested
SVG bubbling to an ancestor listener — exercised with a **real Playwright
click**, so the event is genuinely composed across the shadow boundary. Runs
under the baseline and target-CSP mounts.

Accessibility-tree assertions run against the real browser tree only where the
engine exposes one to the runner: **Chromium via CDP**. Firefox and WebKit
currently fall back to the DOM-level `aria-hidden`/`focusable`/`role` checks
the fixture records, and the decision records carry an explicit `a11y-tree-coverage`
scenario so they never claim real-tree verification for engines that only got
DOM-level checks.

## `css-attach-spike`

This is a **decision spike**, not a proof of success for the rejected `<link>`
method: per the phase-4 decision rule, whichever candidate flashes an unstyled
first paint loses the first-paint contract. The fixture implements the **final
method** — preload the stylesheet (`<link rel="preload" as="style">`, removed
from the head once it has loaded), inline its text as `<style>` inside the
Shadow DOM before the styled content mounts, and cache the settled outcome by
href so concurrent and repeated loads share one request — and verifies its
contract: subpath
resolution, scope without leaking into the light DOM (the light probe
deliberately shares the shadow rule's `#box` id so a leak would actually
match), a single network fetch across re-renders (asserted from the server's
request counter as a per-run delta), and a missing stylesheet surfacing an
element error instead of failing silently.

First paint is measured precisely on `spike-css-firstpaint` pages: the page
holds no other content, so `first-contentful-paint` fires exactly when the
styled element first paints, and the runner loads the page once per candidate
method (`?method=link` and `?method=style`). The measurement is a recorded
finding on both the fast and throttled mounts. **Measured finding: the `<link>`
method applies the sheet after the styled element's first contentful paint — by
a few milliseconds on a prompt sheet (racy) and by the full ~700ms delay under
throttle — while the final method inlines the style before the box mounts, so
no unstyled first paint is measured.** Re-renders do not flash under either
method because the loaded sheet/text is cached.

The final method inlines the sheet, so it carries a documented **CSP
consequence**: the deployment `style-src` must permit the inlined `<style>`
(e.g. `'unsafe-inline'` or a hash/nonce). Under `style-src 'self'` the inlined
style is blocked, and the fixture records that enforcement explicitly on the
target-CSP mount instead of hiding it.

## Decision records

Each run writes `decisions/<spike>-<engine>-<timestamp>-<n>.json` (the
monotonic suffix keeps records unique even when several mounts are written in
the same millisecond). Every record stores the mount it ran under (`mount`), an
overall `passed` boolean, a human-readable `decision`, and the per-scenario
results — so the outcome never has to be recomputed from the scenario array.
The icon-sprite outcome decides whether that provisional contract stays
(default) or the strict-host/CSP fallback becomes the contract; the CSS-attach
`decision` field records the phase-4 strategy selection — see
`decisions/README.md`.
