# Public API Contract

`pey.webui` is a source kit. Pey Core does not load this package directly. Each consuming application owns its final `ui/manifest.json` and `ui/index.js`.

## Exports

The package exposes these stable module addresses:

- `pey.webui/contracts`
- `pey.webui/shell/create-application-setup`
- `pey.webui/base/pey-element`
- `pey.webui/base/icon-sprite`
- `pey.webui/base/attach-style-sheet`
- `pey.webui/shared-state`
- `pey.webui/shell/app-shell`
- `pey.webui/routing/page-loader`
- `pey.webui/routing/page-host`
- `pey.webui/routing/page-fallback`
- `pey.webui/tokens.css`
- `pey.webui/assets/icons.svg`
- `pey.webui/i18n`
- `pey.webui/i18n/catalog`

All of these are implemented and shipped: the contracts, the application setup helper, the two application templates, `PeyElement`, the shared-state store, the icon sprite contract, the neutral shell, the design tokens, the icon sprite asset, the stylesheet attach module, the page-loader registry, the page host, the page fallback, and the i18n contract with its internal catalog.

## Application-Owned Boundary

An application copies or adapts the files under `templates/` into its own UI root. Its Entry Point receives the Core context and passes only explicit references to kit components.

`pey.router.service` is required by every consuming application. Storage and all product services are application-owned dependencies.

## Runtime APIs

- `PeyElement`: shared custom-element base class.
- `createSharedState()`: one UI-local presentation-state store per running UI.
- `AppShell`: neutral shell with a page host and infrastructure fallbacks.
- Page-loader registry helpers: lazy page mounting without route registration.
- `createI18n()`: kit translation and formatting contract.

## `PeyElement`

The shared custom-element base class lives at `pey.webui/base/pey-element`. Every component must connect with the fixed envelope `connect({ infrastructure: { events, logger? }, refs })` exactly once, before DOM insertion. The base class validates the Event Bus facade and `eventTypes()`, owns all subscriptions and the `ui:component-error` publisher, and renders the whole shadow root from `render()`. Declarative browser state marked with `data-pey-preserve` and `data-pey-preserve-state` is carried across full re-renders.

External stylesheets attach through three hooks a component may override. `stylesheetHref()` returns the sheet URL to load via `pey.webui/base/attach-style-sheet`; returning `null` means the base manages no external sheet — the component puts any style it needs directly in `render()` (the inline-`<style>` default). When a sheet URL is returned, the first contentful render waits for the sheet, a failed load reports `PEY_ELEMENT_STYLESHEET_FAILED` and stays sticky for that href, and the component still renders without the sheet. `stylesheetNonce()` returns the CSP nonce (or `null` when the sheet needs none); it is re-read on every full render and applied to the inlined stylesheet element, and a `stylesheetNonce()` that is invalid when applied is contained and reported as `PEY_ELEMENT_STYLESHEET_APPLY_FAILED`. `retryStylesheet()` clears a sticky stylesheet failure and requests a fresh render.

## `createApplicationSetup()`

`createApplicationSetup()` provides the shared application bootstrap policy. It validates the Core UI context, pre-trimmed and disjoint required/optional service lists (a service name with surrounding whitespace is rejected with `PEY_WEBUI_INVALID_SETUP_POLICY`, not stripped), Event Bus facade, pre-existing shutdown hook, and shared configuration; mounts the application-owned shell once with reentrancy protection; contains synchronous pre-shutdown callback failures; preserves the original startup error if rollback cleanup also fails; and installs an idempotent synchronous `context.onShutdown` cleanup hook.

## `createSharedState()`

`createSharedState()` provides one UI-local presentation-state store per running UI at `pey.webui/shared-state`. It exposes `get(key)`, `set(key, value)`, `subscribe(key, listener)`, and `clear()`. Keys must be non-empty trimmed strings. Only strict JSON-compatible values are accepted — plain JSON whose nested items are likewise strict, so `undefined` is rejected rather than coerced as `JSON.stringify` would — with cycles rejected and a chain of more than 100 array/object containers rejected. Values are compared with `Object.is`: setting an equal value does not notify, while a new object or array always notifies even with identical content. The store keeps the passed reference — it does not clone or freeze — and each consumer is responsible for replacing a value with a new reference before calling `set()` again. `subscribe()` is per key, registers a repeated listener only once, and returns an idempotent unsubscribe. A throwing listener is isolated and logged with only the stable code, and `clear()` releases all values and subscribers for Entry Point shutdown. The returned store object is frozen.

## `AppShell` And Assets

The neutral shell component lives at `pey.webui/shell/app-shell` (tag `pey-app-shell`). It defines three named slots: `extension` and `extension-end` for consumer chrome and `page` for the page landmark the Entry Point fills. The shell reflects `theme` and `direction` base states as `data-theme`/`dir` host attributes, seeded from connection refs and following the shared state store, and consumes `--pey-*` design tokens across the Shadow DOM boundary.

`pey.webui/tokens.css` defines minimal design tokens (typography, spacing, color, radius, motion, elevation) as CSS Custom Properties on `:root`; any token is overridable by a consuming application. `pey.webui/base/icon-sprite` resolves the sprite URL exclusively from `assetBaseUrl` and builds the `<svg aria-hidden="true" focusable="false"><use href=".../icons.svg#symbol-id"></use></svg>` markup contract. Two distinct concerns apply to this markup. Accessibility: the sprite markup itself is decorative and carries no label, so a meaningful icon must pair it with an accessible label on the control or host element. Sprite availability: the external `<use>` sprite is provisional until Chrome, Firefox, and WebKit each record a passing spike run (Chromium and Firefox have; WebKit has not; see `decisions.md`). If a target host or CSP blocks external sprite references — or until that engine matrix passes — the fallback contract is that the Entry Point loads the sprite text once and clones the symbol into the Shadow DOM, so no component ever fetches the sprite separately.

## Page Loading And Routing

The three routing modules the Entry Point composes to mount pages:

`pey.webui/routing/page-loader` provides `createPageLoaderRegistry()` and `defaultConnect()`. The registry validates the Entry Point's route catalog: entries need a non-empty trimmed `pattern`, a `load()` function, a valid trimmed kebab-case custom-element `element` tag, and an optional `connect()` override; the `notFound` slot is optional and has the same shape without a `pattern`. Duplicate patterns are rejected, and validation failures use the `startup` error type. The returned registry is frozen and resolves entries by exact pattern through `getEntry(pattern)`, exposing `notFoundEntry`. `defaultConnect(element, infrastructure, refs, route)` builds the standard page connection envelope, merging `routeParams` and `routeQuery` into the base refs.

`pey.webui/routing/page-host` provides `createPageHost()` which mounts pages into the application shell. It subscribes to `router:changed`, reads the full route with `getCurrentRoute()`, and mounts/unmounts pages, guarding every async step with a generation counter so a stale slow load never overrides a newer route. The `router:changed` callback is contained: route read and mount invocation are separate steps, so a throwing route read is logged as `PEY_PAGE_ROUTE_READ_FAILED` and any failure in the mount flow (sync invocation or async rejection) as `PEY_PAGE_ROUTE_MOUNT_FAILED`, never propagated. The router subscription is validated at construction, and `dispose()` is terminal: it invalidates any in-flight load, contains a throwing `unsubscribe()` (logged as `PEY_PAGE_UNSUBSCRIBE_FAILED`), and unmounts the page in a `finally` block so the page is always removed. It never registers routes and never owns a `/not-found` route: resolving unresolved paths is the Router's own job (its `notFoundPath`), so the host only covers not-found and load-failure states. `config.fallbackPath` is only the safe-path action the fallback offers.

`pey.webui/routing/page-fallback` provides the internal `pey-page-fallback` element (class `PageFallback`, states via `PAGE_FALLBACK_STATES`) rendering only stable message keys — never technical error text — with optional retry, go-back, and go-to-fallback actions. Retry is offered only after a load/connect failure of a real loader entry and reuses the host's normal mount flow (returning its promise so the rejection is contained); a missing loader and the not-found outcome never offer retry. Translated output is HTML-escaped before insertion, the navigation actions render only when a router (and path) actually exist, and a failure while mounting the fallback itself is contained and logged (the host may then be left empty, with no renderable output left to show).

## I18n And Formatting

The injectable i18n contract lives at `pey.webui/i18n` (`createI18n()`) and the kit-owned catalog at `pey.webui/i18n/catalog`. The Entry Point builds one instance with the application's catalog and injects `t` and `format` as component refs; components never import the kit's i18n directly and the kit never imports a product catalog.

`createI18n({ language, fallbackLanguage, catalog })` returns a frozen `{ t, format, language }`. `t(key, params)` requires a non-empty trimmed string key (any other input returns an empty string), resolves from the active language, falls back to `fallbackLanguage`, then to the kit's `en` catalog, and finally to the key itself — it never throws and never surfaces a raw error message, even when a parameter value cannot be stringified. `{param}` placeholders are interpolated from `params`. The returned text is raw and unescaped; HTML-escaping before insertion is the caller's responsibility, as `pey-page-fallback` does. `format(value, type, options)` formats `date`, `time`, `dateTime`, `number`, and `currency` through `Intl` for the active language (a `locale` option is stripped, not honored); `dateTime` renders a date and a time by default, and the currency style/code cannot be overridden through `options`. Options must be a plain object, and invalid usage or a malformed language/catalog throws structured `PEY_I18N_*` codes, with any underlying `Intl` failure normalized into `PEY_I18N_FORMAT_FAILED`.

`pey.webui/i18n/catalog` ships the kit's internal keys — `pey.webui.errors.page-not-found`, `pey.webui.errors.page-load-failed`, `pey.webui.actions.retry`, `pey.webui.actions.go-back`, `pey.webui.actions.go-to-fallback` — with no product keys. The page host uses these as the default `t` for the fallback when the Entry Point injects none, so infrastructure outcomes are localized from the start; when a valid shared-state facade is provided, its `language` key is authoritative for that default and a change re-renders an active fallback.
