# pey.webui

[![AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)](#)
[![version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bonyan Architecture](https://img.shields.io/badge/bonyan-0.11-56c3bf)](https://github.com/barnevis/bonyan)

A source kit of shared native Web Components infrastructure for building application UIs in the Pey architecture. It is not an application: Pey Core loads only a consuming application's own UI entry point, so each product team owns its `ui/manifest.json` and `ui/index.js`. This package supplies the shared building blocks that such an entry point composes — a component base class, a neutral shell, page-host routing with an internal fallback, a UI-local shared-state store, design tokens, an icon sprite contract, and an injectable i18n contract — plus the application templates to start from.

It is for teams building a UI inside a Pey Core application. Consume it as a plain source package: copy the application templates into your own UI root, adapt the Entry Point with your pages, routes, dependencies, events, and translations, and compose the kit's runtime modules. The kit package itself is never loaded by Core and never appears in `manifest.json`; what does appear there are the kit's contracts — the required `pey.router.service` dependency and the `ui:component-error` event declaration.

## Features

- **Application bootstrap** — `createApplicationSetup()` validates the Core UI context, services, and shared config, mounts the shell once with reentrancy protection, and owns idempotent synchronous shutdown.
- **`PeyElement` base class** — connect-once `{ infrastructure, refs }` envelope, transactional subscribe/bind with rollback, coalesced rendering, a text-free error boundary, and declarative browser-state preservation.
- **External stylesheet runtime** — preload-and-cache-`<style>` attach method via `stylesheetHref()`/`stylesheetNonce()` with sticky-failure `retryStylesheet()`.
- **UI-local shared state** — frozen `get`/`set`/`subscribe`/`clear` store with strict JSON-compatible value validation and per-key listener isolation.
- **Neutral `AppShell`** — slot/host contract with `theme`/`direction` reflection, minimal `--pey-*` design tokens, and an `assetBaseUrl`-resolved icon sprite.
- **Page loading and routing** — validated page-loader registry, generation-guarded page host reacting to `router:changed`, and an internal `pey-page-fallback` with contained retry/navigation actions.
- **I18n and formatting** — injectable `createI18n()` with `t`/`format`, a kit-owned internal catalog, and localized fallback outcomes from the first deploy.
- **Native ES Modules** — no transpilation, bundling, or build step; consumed directly in the browser.
- **Headless test suite and contract gate** — jsdom-backed tests for every runtime module, gated by contract check scripts under `scripts/`.

## Installation

`pey.webui` is a native ES Modules source kit. It is **not published to the npm registry**; the only way to obtain it is from this GitHub repository. Clone the repository once, then point your consuming application's dependency at that local checkout rather than at a registry package:

```sh
git clone <this-repository-url> pey.webui
```

Inside the consuming application, reference the local checkout path:

```sh
npm install /path/to/pey.webui
```

The kit ships no Core-loadable plugin surface; it is consumed by your application's UI Entry Point through the package's stable exports (see `docs/public-api.md`):

```js
import { createI18n } from 'pey.webui/i18n';
import { createPageLoaderRegistry } from 'pey.webui/routing/page-loader';
import { createPageHost } from 'pey.webui/routing/page-host';
import { createApplicationSetup } from 'pey.webui/shell/create-application-setup';
```

Then copy the application templates (`templates/application-manifest.json` and `templates/application-entry-point.js`) into your own UI root and adapt them to your product. `jsdom` and `playwright` are dev-only dependencies used by the kit's own test and spike suites.

Start with `docs/overview.md` (the from-scratch introduction) and `docs/entry-point.md` (the lifecycle contract your Entry Point must satisfy); `docs/public-api.md` covers what the kit exports, and `docs/configuration.md` covers the shared config contract. The rest of `docs/` is the reference:

- `docs/overview.md`: from-scratch introduction to the project.
- `docs/public-api.md`: package boundaries, exports, and the usage notes for every runtime API.
- `docs/entry-point.md`: the consuming application lifecycle contract and `createApplicationSetup()`.
- `docs/configuration.md`: the shared UI configuration contract.
- `docs/component-index.md`: kit components and infrastructure inventory.
- `docs/shared-infrastructure.md`: the shared infrastructure the kit delivers, area by area.
- `docs/decisions.md`: the architectural and behavioral decisions behind these contracts, with the rationale for each.

## Status

Package layout, contracts, application bootstrap, `PeyElement`, the shared-state store, the neutral `AppShell`, design tokens, the icon sprite contract, the page-loader registry, the page host, the page fallback, and the injectable i18n and formatting contract with a kit-owned internal catalog are implemented, together with the unit/integration test suite and this documentation set. The kit itself is not Core-loadable; the application manifest template ships as the consumer-side contract.

## Browser spikes

The two browser-dependent contracts — the shared SVG sprite (`<svg><use>` inside an open Shadow DOM) and the stylesheet attach method — are verified in real Chrome/Firefox/WebKit, not jsdom. Run `npm run spikes` (Playwright); each run writes a decision record carrying an overall `passed` and a `decision`. The stylesheet spike is a decision spike: it measured that a plain `<link rel="stylesheet">` applies after the styled element's first paint — by a few milliseconds on a prompt sheet and by the full throttle delay under a slow network — so the final attach method is preload-and-cache-`<style>` (which inlines the sheet before the box mounts and carries a documented CSP consequence for `style-src`). The icon-sprite contract stays provisional until Chrome, Firefox and WebKit each record a passing run; in the development environment Chromium and Firefox have recorded passing runs, and WebKit is still unrecorded.

## License

Released under the [MIT License](LICENSE).
