# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-08-16

Initial release of `pey.webui`: a source kit of shared native Web Components infrastructure for building application UIs in the Pey architecture. The kit is consumed as a plain source package; Pey Core loads only a consuming application's own UI entry point.

### Added

- **Package contracts** (`contracts.js`): stable kit names, the shared UI config defaults, and `PEY_*` structured error codes.
- **Application bootstrap** (`shell/create-application-setup.js`): the `createApplicationSetup()` lifecycle helper — Core UI context, required and optional service list, Event Bus facade, and shared configuration validation; single reentrancy-protected shell mount; synchronous pre-shutdown callback containment; startup-error preservation across rollback; and an idempotent synchronous `context.onShutdown` cleanup hook.
- **Application templates** (`templates/`): application-owned Core UI manifest and Entry Point starting points demonstrating the required Router lookup.
- **Shared component base class** (`base/pey-element.js`): `PeyElement` with a mandatory open Shadow DOM, a connect-once `{ infrastructure, refs }` envelope, transactional subscribe/bind with rollback, coalesced microtask rendering, a text-free error boundary with `ui:component-error` publication, sanitized optional logging, and the declarative `data-pey-preserve` / `data-pey-preserve-state` preservation mechanism.
- **External stylesheet runtime** (`base/attach-style-sheet.js`): the preload-and-cache-`<style>` attach method with `stylesheetHref()` / `stylesheetNonce()` hooks, `retryStylesheet()`, per-href caching and eviction, concurrent in-flight deduplication, and the documented CSP consequence.
- **UI-local shared state store** (`shared-state.js`): frozen store exposing `get`/`set`/`subscribe`/`clear`, strict JSON-compatible value validation with cycle detection and a 100-container depth limit, `Object.is` equality semantics, per-key listener isolation, and idempotent unsubscribe.
- **Neutral shell, tokens, and icon sprite** (`shell/app-shell.js`, `tokens.css`, `base/icon-sprite.js`, `assets/icons.svg`): the `pey-app-shell` slot/host contract with transactional connection rollback, minimal product-neutral `--pey-*` design tokens, and the decorative `<svg><use>` sprite markup contract resolved exclusively from `assetBaseUrl`.
- **Page loading and routing** (`routing/`): the validated, frozen page-loader registry (`createPageLoaderRegistry()`), the generation-guarded page host (`createPageHost()`) reacting to `router:changed`, and the internal `pey-page-fallback` element rendering only stable translated message keys with contained retry/go-back/go-to-fallback actions.
- **I18n and formatting** (`i18n/`): the injectable `createI18n()` contract with `t` and `format`, structural language validation via `Intl.getCanonicalLocales()`, a kit-owned internal catalog, and localized fallback outcomes from the first deploy.
- **Real-browser spike harness** (`scripts/browser-spikes/`): Playwright-driven verification of the provisional SVG sprite contract and the stylesheet attach decision across Chrome, Firefox, and WebKit.
- **Test suite and contract gate**: unit/integration tests for every runtime module, run headlessly (jsdom-backed, with no real Core, backend, or History API) and gated by the contract check scripts under `scripts/` — each verifying its area's exports, behavior, and documentation stay in sync, treating the test runner's exit code as the source of truth for pass/fail.
- **Documentation set** (`docs/`): README, public API contract, entry point contract, shared configuration contract, component index, shared infrastructure overview, and package contract decisions including rejected
  alternatives.
