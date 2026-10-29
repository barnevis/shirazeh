# Package Contract Decisions

## Package Identity

- Package name: `pey.webui`.
- Kit component custom-element prefix: `pey-`.
- Tag suffixes never start with `-`; concatenate as `${PEY_ELEMENT_TAG_PREFIX}app-shell` to produce `pey-app-shell`, never `pey--app-shell`.
- Page custom-element prefix is chosen once by each consuming application; the kit does not impose one on product pages.
- File and folder names: lowercase kebab-case.
- Base class name: `PeyElement` in `base/pey-element.js`.

These identity names are part of the stable public contract. A fixed custom-element prefix keeps kit tags unique and derivable from a single constant (so a tag can only ever be built one way), and lowercase kebab-case keeps file, folder, and element names consistent with web-component conventions.

## Kit Layout

The package uses a flat root layout: `assets/`, `base/`, `components/`, `docs/`, `i18n/`, `pages/`, `routing/`, `shell/`, `templates/`, `tests/`, `contracts.js`, and `tokens.css` live beside `package.json`.

This deliberately differs from the final application UI layout, which is rooted at `ui/`. `pey.webui` is a reusable package rather than that final application. The extra `contracts.js`, `routing/`, and `templates/` paths are package-level infrastructure:

- `contracts.js` exposes stable kit names and shared defaults.
- `routing/` contains the page-loader registry helpers and `router:changed` reaction logic implemented by the kit. It mounts resolved pages but never registers route patterns.
- `templates/` contains application-owned Core manifest and Entry Point starting points.

Consuming applications may retain the architecture's `ui/` application layout while importing this package.

## Core Boundary

`pey.webui` has no Core-loadable manifest or Entry Point. Those files are application artifacts. This package provides templates and runtime modules consumed by an application Entry Point. Keeping the kit out of Core's plugin surface lets it be versioned and reused independently, and leaves each application the sole author of its own manifest.

## Module Loading

- Native ES Modules only.
- No transpilation, bundling, loader suffixes, or import rewriting.
- JavaScript module URLs are resolved by the browser.
- Co-located resource URLs use `new URL(relativePath, import.meta.url)` when implemented.
- Router `basePath` is navigation-only. Assets resolve exclusively from `assetBaseUrl`.

Native ES Modules with no build step keep the kit directly consumable in the browser, and `new URL(relativePath, import.meta.url)` keeps co-located assets resolvable regardless of where the package is served from.

## Configuration Contract

The kit recognizes only these shared keys:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `theme` | `string` | `system` | Initial presentation theme. |
| `language` | `string` | `en` | Initial locale identifier. |
| `direction` | `ltr \| rtl \| auto` | `auto` | Initial writing direction. |
| `fallbackPath` | `string \| null` | `null` | Optional safe navigation target; only non-empty string validation belongs to the UI. |
| `assetBaseUrl` | `string` | `./assets` | Asset location resolved against `import.meta.url` of the consuming application Entry Point, independent of Router configuration. |

Only the application Entry Point reads `context.config`. Components receive selected values through their connection references. The set is deliberately minimal: the kit recognizes only the keys it actually renders, and components stay decoupled from the rest of the application's config.

## Dependency Contract

- Required in every consuming UI manifest: `pey.router.service`.
- Required UI event declaration: `ui:component-error`.
- Not part of the kit contract: `pey.storage.service`, product services, and product events.

Router is required because navigation lifecycle, deep-link handling, and back/forward behavior must stay uniform across every product. Even a single-page application includes Router deliberately so those semantics do not diverge per product; the kit mounts pages only on Router's `router:changed` events. Storage and product services are product-specific, so the kit never guesses what a product needs and leaves them to the application.

# Component Base Decisions

## Connection Envelope

`connect({ infrastructure: { events, logger? }, refs })` is the only way a component receives capabilities. The base class installs `connect` as a non-writable, non-configurable own method, validates the Event Bus facade once, and passes only `refs` to `onConnect(refs)`. A component never sees the Event Bus or logger. A second `connect()` call is rejected with `PEY_ELEMENT_ALREADY_CONNECTED`; connecting while already in the DOM is rejected with `PEY_ELEMENT_CONNECTED_TOO_EARLY`.

## Event Handling

Components declare delegated DOM listener types with `eventTypes()`; the base class registers exactly one listener per type on the shadow root during `connectedCallback` and removes them all on disconnect. Invalid or duplicate types are rejected at `connect()` time with `PEY_ELEMENT_EVENT_TYPES_INVALID`. Subscriptions are declared declaratively with `subscriptions()`, and the base class validates their shape (`PEY_ELEMENT_SUBSCRIPTIONS_INVALID`) and the unsubscribe function returned by `events.subscribe` (`PEY_ELEMENT_SUBSCRIBE_INVALID`). Every delegated listener and subscription runs inside the base class error boundary, so a throwing `handleEvent()` or listener never escapes into the browser.

`connectedCallback` first verifies a valid connection exists, then subscribes and binds listeners inside a transaction: if any step fails, every subscription and listener registered earlier in that same lifecycle is rolled back before the error escapes, leaving no half-connected state. Cleanup in `disconnectedCallback` is per-entry independent — a throwing `unsubscribe()` or `removeEventListener` logs `PEY_ELEMENT_UNSUBSCRIBE_FAILED` / `PEY_ELEMENT_LISTENER_REMOVE_FAILED` and never prevents the remaining entries from being cleaned up. Reconnecting the same instance (remove then re-append) re-subscribes and re-binds without a second `connect()` call.

## Render Coalescing

`requestRender()` schedules a render cycle on the microtask queue. Requests issued before that cycle runs are coalesced into a single `render()` call, and if any request carried `preserve: false` the whole cycle renders without preservation, so an intentional reset is never undone by a later preserving request. The cycle executes only if the element is still connected when the microtask is flushed — scheduling is always allowed, but a request whose element remains detached at flush time is dropped.

When a stylesheet-gated first render is pending, the cycle returns without writing the DOM and the settlement of the sheet load re-requests the render. Because of this, render timing is not observable from outside the base class: a component that must run against freshly rendered markup overrides the `afterRender()` hook instead of scheduling its own microtask next to `requestRender()`. The base class calls `afterRender()` synchronously after every successful contentful flush (gated re-renders included), isolates a throwing override behind `PEY_ELEMENT_AFTER_RENDER_FAILED` logging without touching the rendered content, and never calls the hook when `render()` itself failed.

## Error Boundary

`render()`, delegated `handleEvent()`, and subscription handlers run inside the base class boundary. A render failure replaces the shadow root with the fixed structural fallback and publishes `ui:component-error` with only `{ componentTag, code }`. A failed external stylesheet load is reported as `PEY_ELEMENT_STYLESHEET_FAILED`, and a stylesheet that loads but throws while being applied (for example, an invalid nonce) is contained and reported as `PEY_ELEMENT_STYLESHEET_APPLY_FAILED` without taking the error boundary down; in both cases the element still renders without the sheet, because availability wins over a styled first paint. The fallback is a markup-only `<div part="error">` with no user-facing text: displayable infrastructure messages are an i18n concern, so the base class ships no product-facing prose. A `{ success: false, error }` result from `events.publish` is logged, never silently dropped; a failure to publish `ui:component-error` is logged without retriggering the same event. The optional logger receives only controlled fields (`code`, `componentTag`, optional `preserveKey`) — no raw `Error` object and no error message. A throwing logger never breaks the component.

## Preserve Mechanism

Browser-held presentation state is preserved declaratively with `data-pey-preserve` (unique, stable key) and `data-pey-preserve-state` (space-separated tokens `value`, `checked`, `selection`, `focus`, `scroll`). This is a narrow exception to full re-render, not a diffing engine: only marked elements are snapshotted before `render()` and restored afterward, and restore is per-key independent. Only the intersection of old and new tokens is restored, so dropping a token in the new template also drops its restoration. Restore order is value/checked, focus, selection (clamped to the restored value length), then scroll. Markers without any state are invalid, `value` is only valid on `input`/`textarea`/`select`, and radio groups are keyed by `name` plus the actual form owner reference — two forms that share an id (or have none) never collapse into one group. Radio groups are reconciled so at most one radio stays checked; a snapshot with multiple checked radios in one group logs `PEY_PRESERVE_RADIO_CONFLICT`. Unsupported selection types, duplicate keys, empty state lists, and incompatible states are rejected with stable `PEY_PRESERVE_*` codes, falling back to the error markup. `requestRender({ preserve: false })` opts out of preservation for deliberate resets.

# Shared State Decisions

## Store Shape

`createSharedState()` returns one frozen UI-local store per running UI, exposing `get(key)`, `set(key, value)`, `subscribe(key, listener)` returning an idempotent unsubscribe, and `clear()`. The store is dedicated to shared presentation state (theme, direction, layout toggles) and replaces no service, Event Bus, or storage. The Entry Point creates the single instance and hands it only to components that need it. `clear()` is a deliberate extension of the fixed `get`/`set`/`subscribe` API: subscriber cleanup on Entry Point shutdown is required, and dropping the store reference alone cannot deterministically release the listeners it holds once components retain their `sharedState` refs. A previously issued unsubscribe remains a safe no-op after `clear()`.

## Validation And Stable Codes

Keys must be non-empty strings with no surrounding whitespace (trimmed, like service names; internal spaces like `my key` are allowed), listeners must be functions, and values must be strict JSON-compatible data: a plain JSON value whose items are themselves strict JSON-compatible, so `undefined` inside an object or array is rejected rather than coerced the way `JSON.stringify` would. Value validation walks arrays and plain objects recursively, rejecting functions, symbols, `bigint`, non-finite numbers, class instances, `Date`/`Map`/`Set`/`RegExp`, cycles, and a chain of more than 100 array/object containers. Depth is counted as the number of containers between the root value and its deepest leaf: exactly 100 containers is accepted, the 101st is rejected. Violations throw `PEY_SHARED_STATE_INVALID_KEY`, `PEY_SHARED_STATE_INVALID_LISTENER`, or `PEY_SHARED_STATE_INVALID_VALUE`.

## Equality Semantics

Values are compared with `Object.is`. Setting an equal value stores nothing and notifies no one; a new object or array reference always notifies, even when its content is identical to the stored value. This makes an immutable-replacement workflow observable: a consumer mutates nothing in place and calls `set()` with a fresh reference to signal a real change.

## No Mutation Enforcement

The base store neither `Object.freeze`s nor clones stored values. Immutable replacement with a new reference and a second `set()` is a documented consumer contract, and the store's equality semantics depend on it. Adding freeze/cloning later is a separate, explicit decision with its own cost and compatibility review.

## Listener Isolation

A throwing listener never escapes into `set()` and never prevents the remaining subscribers for that key from being notified. The failure is logged to the console as exactly the stable `PEY_SHARED_STATE_LISTENER_FAILED` code — no key, payload, or `error.message` — in line with the `PeyElement` boundary's non-sensitive logging. The store never re-emits or forwards the failure elsewhere. Subscribing the same listener function for the same key twice registers it once (backed by a `Set`), and a single unsubscribe removes it.

# Shell And Token Decisions

## Shell Neutrality

`pey-app-shell` is a regular component extending `PeyElement`. Its shadow structure only defines the slot/host contract — named slots `extension`, `page`, and `extension-end` around a semantic `<main>` page landmark — plus permissive chrome regions. It renders no header/nav/aside/footer markup, defines no product grid, and adds no focus order or focus trap: keyboard focus follows the natural DOM order of slotted content and nothing routes focus away from it.

## Shell Lifecycle Rollback

`AppShell.connectedCallback()` is transactional: it establishes the base lifecycle first, then connects the shared state; if that second step fails, the failure path deliberately runs the cleanup hooks early (rolling back base subscriptions/listeners and shared-state subscriptions) before surfacing the error. Because the browser may still call `disconnectedCallback()` later when the element is actually removed, all shell and base cleanup must remain idempotent — empty arrays, safe no-op unsubscribes, and re-entrant listener removal — so the early rollback never causes double-unsubscribe or double-removal.

## Presentation States In The Shell

`theme` and `direction` are the two base states the shell reflects onto the host as `data-theme` and `dir` attributes. They are seeded from the connection refs (`refs.theme` / `refs.direction`) and, when a `sharedState` ref is handed to the shell, re-read on connect and followed on store changes. The attributes are a styling hook for consumers, not a copy of Core config; product `theme` values stay undefined at the kit layer.

## Token Ownership

Design tokens are CSS Custom Properties on `:root` in `tokens.css`, consumed through `var(--pey-*)` across the Shadow DOM boundary. They are minimal and product-neutral; consumers override any token from their config/theme. Component styles use only logical properties (`min-block-size`, etc.), so LTR and RTL both render correctly without direction-conditional CSS.

## CSS Attach Method

The kit's final CSS-attach mechanism for a separate stylesheet is **preload-and-cache-`<style>`**: the sheet is preloaded once (`<link rel="preload" as="style">`), its text is inlined as a `<style>` inside the Shadow DOM before the styled content mounts, and only the successful text is cached by href — concurrent callers share one in-flight load, a failed load is evicted so a later call can retry, and the preload `<link>` is removed once it has loaded. `PeyElement` integrates formally through the `stylesheetHref()`/`stylesheetNonce()` hooks: the first contentful render waits for the sheet so first paint carries the rules, and every full render re-applies the cached text without re-fetching; the href is re-read each render, so a changed URL loads its own sheet and never inherits a previous sheet's cached text. On a load failure availability wins over no-flash: the component still renders without the stylesheet and the failure is reported through the component error pipeline (`PEY_ELEMENT_STYLESHEET_FAILED`); a failure stays sticky for that href until `retryStylesheet()` clears it. This is the outcome of the browser-driven decision spike (Chrome/Firefox/WebKit; run with `npm run spikes`). The spike is a decision spike, not a proof of success for the rejected candidate: it measures first contentful paint for both methods on a throttled network that jsdom cannot reproduce. The measured finding: a plain `<link rel="stylesheet">` applies the sheet after the styled element's first contentful paint — by a few milliseconds on a prompt sheet (racy) and by the full throttle delay under a slow network — so it cannot guarantee a no-flash first paint and is rejected for first paint. The selected method inlines the sheet before the box mounts, so no unstyled first paint is measured. Re-renders do not flash under either method because the loaded sheet/text is cached, so `<link>` remains acceptable for re-renders and in CSP-strict deployments.

Inlining imposes a documented CSP consequence: the deployment's `style-src` must permit the inlined `<style>` (e.g. `'unsafe-inline'`, or a hash/nonce). Under a `style-src 'self'` policy the inlined style is blocked — the spike records that enforcement explicitly on its target-CSP mount instead of hiding it. Inline `<style>` inside `render()` remains the kit's default for small components; it is the same mechanism family and carries the same CSP requirement.

## Icon Sprite Contract

The kit ships the shared sprite container `assets/icons.svg` and the markup contract in `base/icon-sprite.js`. One shared sprite is chosen over per-component inline SVG so icon usage stays auditable and uniform across components. The sprite URL is derived exclusively from `assetBaseUrl` via `resolveIconSpriteUrl()` — never from Router `basePath`, `document.baseURI`, or a hardcoded path. `createIconMarkup()` builds `<svg aria-hidden="true" focusable="false"><use href=".../icons.svg#symbol-id" /></svg>`. The `<svg><use>` approach inside Shadow DOM, resolution under a subpath deployment, and target CSP policies remain gated on the browser-driven spike (Chrome/Firefox/WebKit, run with `npm run spikes`). Accessibility-tree assertions in that spike run against the real browser tree only in Chromium (via CDP); Firefox and WebKit fall back to the DOM-level `aria-hidden`/`focusable`/`role` checks, and the decision records state which engine got which coverage. The harness existing is not enough: the contract is provisional until Chrome, Firefox and WebKit each record a passing run. Chromium and Firefox have each recorded passing runs in the development environment; WebKit is still unrecorded (no runnable Playwright WebKit build on the current system). Until that engine matrix passes, this contract is provisional and `assets/fonts` + `assets/images` carry no product assets.

# Routing Decisions

## Page Host Mounting

`createPageHost()` mounts pages into the shell and reacts to `router:changed` by reading the full route with `getCurrentRoute()`. Every async step is guarded by a generation counter: a stale slow page load that resolves after a newer route was requested is discarded, so the host never renders an outdated page over the current one. The host unmounts the current page before mounting the next.

`dispose()` transitions the host to a terminal disposed state: it bumps the generation counter so any in-flight `load()` is invalidated even if nothing new was requested, unsubscribes from `router:changed`, and unmounts the current page. Unmounting runs in a `finally` block, and a throwing `unsubscribe()` is contained and logged as `PEY_PAGE_UNSUBSCRIBE_FAILED` — `dispose()` itself never throws, so the Entry Point's synchronous shutdown contract is preserved while the current page is always removed. `mountForRoute()` and the fallback retry action are no-ops after disposal, so no late load can ever remount a page into a disposed host. The `router:changed` callback is itself contained, and it separates route read from mount invocation: a throwing `getCurrentRoute()` is logged as `PEY_PAGE_ROUTE_READ_FAILED` and the callback returns, while any failure in the mount flow — a synchronous invocation error or an asynchronous rejection — is logged as `PEY_PAGE_ROUTE_MOUNT_FAILED`; neither ever escapes the Event Bus listener. The router subscription is validated at construction: a subscription that throws or returns no unsubscribe function fails `createPageHost()` with the stable `PEY_PAGE_HOST_SUBSCRIBE_INVALID` code instead of leaving a half-constructed host.

## No Route Registration In The Host

The page host never registers route patterns and never owns a `/not-found` route. Route-pattern registration stays with application plugins, and resolving unresolved paths is the Router's own job through its own `notFoundPath` config — never through the UI's `config.fallbackPath`, which is only the safe-path action the fallback offers. The host only covers the two render states that have nowhere else to go: an unresolved not-found outcome and a page load/connect failure.

## Fallback Retry Policy

The `pey-page-fallback` load-failed state offers retry only when a real loader entry was attempted and its `load()`, element definition, or `connect()` failed — a transient condition. A route with no loader entry is a config error and renders load-failed without retry; the not-found state never offers retry. The notFound slot, when defined, is a real loader entry, so a failure inside it renders not-found without retry rather than suggesting the same route can be reloaded. Retry is not a distinct mounting path: the fallback's retry action simply calls `mountForRoute(route)` again, so it reuses the single generation-guarded mount flow instead of bypassing the host lifecycle. The retry callback returns the mount promise (never a dropped `void`), so the fallback can contain its rejection; a throwing or rejecting retry action is logged with the stable `PEY_PAGE_FALLBACK_RETRY_FAILED` code, never escaping into the browser. Because the fallback is the last safety net, building, connecting, or appending it is wrapped in its own boundary too: a failure there is contained and logged with the stable `PEY_PAGE_FALLBACK_MOUNT_FAILED` code so the mount flow never rejects as a side effect of a broken fallback — though the host may still be left empty, since there is no renderable output left to show.

## Message-Only Fallback

The fallback renders only stable message keys (`pey.webui.errors.page-not-found`, `pey.webui.errors.page-load-failed`) and action keys, translated by the injected `t` ref. The page host always supplies a `t` — the Entry Point's when injected, otherwise the kit's own catalog built from `config.language` — so the raw key is never shown in practice; a standalone element without any `t` renders the key itself as a last resort. Technical causes are never rendered: they are logged to the console with stable codes (`PEY_PAGE_LOAD_FAILED`, `PEY_PAGE_MOUNT_FAILED`, `PEY_PAGE_LOADER_NO_ENTRY`, `PEY_PAGE_ROUTE_READ_FAILED`, `PEY_PAGE_ROUTE_MOUNT_FAILED`, `PEY_PAGE_UNSUBSCRIBE_FAILED`, `PEY_PAGE_FALLBACK_MOUNT_FAILED`, `PEY_PAGE_FALLBACK_RENDER_FAILED`, `PEY_PAGE_FALLBACK_NAVIGATION_FAILED`, `PEY_PAGE_FALLBACK_RETRY_FAILED`, `PEY_PAGE_HOST_SHARED_STATE_READ_FAILED`, `PEY_PAGE_HOST_SHARED_STATE_SUBSCRIBE_FAILED`, `PEY_PAGE_HOST_SHARED_STATE_LANGUAGE_INVALID`) in line with the `PeyElement` boundary's non-sensitive logging — never a raw `error.message`. A rejected `router.back()`/`router.replace()` inside the fallback is caught and logged, never rethrown into the browser. Translated output is HTML-escaped before insertion, so a translation containing markup can never be injected as elements. The go-back action renders only when a router is actually provided, and go-to-fallback only when both a router and a `fallbackPath` exist.

# I18n Decisions

## Injectable I18n, Not An Engine

The kit ships a minimal injectable i18n contract, not a translation management engine. `createI18n()` builds one frozen `{ t, format, language }` instance; the Entry Point owns the application catalog and hands `t`/`format` to components as refs. Components never import the kit's i18n directly and the kit never imports a product catalog — matching the base-class decision that components receive capabilities only through the connection envelope.

## Kit-Owned Internal Catalog

The kit owns the internal infrastructure keys it renders (`pey.webui.errors.page-not-found`, `pey.webui.errors.page-load-failed`, `pey.webui.actions.retry`, `pey.webui.actions.go-back`, `pey.webui.actions.go-to-fallback`) in `i18n/catalog.js`, with `en` as the default language. Product keys are never added. An application catalog overrides kit keys for the same language, so the kit's infrastructure copy stays localizable without coupling the kit to any product language.

## Missing Language And Key Fallback

`t(key, params)` requires a non-empty trimmed string key and returns an empty string for any other input, so it always yields a string. Resolution runs active language → fallback language → kit `en` catalog → the key itself, and the whole lookup plus interpolation is contained: a parameter value whose stringification throws still resolves to the key, preserving the never-throw guarantee. Combined with the message-only fallback and code-only logging, a raw error message can never reach the UI: the only strings that render are resolved translations or the stable key.

Languages are validated structurally at `createI18n()` time through `Intl.getCanonicalLocales()` — both the active/fallback tags and every language key inside the catalog — so a malformed tag is rejected at startup with `PEY_I18N_INVALID_LANGUAGE`/`PEY_I18N_INVALID_CATALOG` instead of surfacing a `RangeError` later. `format(value, type, options)` renders through `Intl` for the active language and throws structured `PEY_I18N_*` errors for invalid usage (unsupported type, missing currency, non-plain-object options); any failure from the underlying `Intl` formatter is normalized into a single `PEY_I18N_FORMAT_FAILED` operational error, so the boundary only ever surfaces `PEY_I18N_*` codes.

## Format Options Are Not Overridable

`dateTime` renders both a date and a time by default (`dateStyle: 'medium'`, `timeStyle: 'short'`), so it is a real date-plus-time formatter rather than a copy of `date`. The currency branch spreads caller options first and pins `style: 'currency'` and the currency code afterwards, so a caller can never redirect a currency format to another style through `options`. `format` always targets the active language: a `locale` option is stripped from the options before they reach `Intl`, so the contract never depends on the runtime ignoring unknown options. `options` must be a plain object, enforced with `PEY_I18N_FORMAT_INVALID_OPTIONS`.

## `t()` Returns Raw Text

`t()` performs interpolation only; it does not escape. The returned value is plain text, and HTML-escaping before insertion is the caller's responsibility — `page-fallback.js` escapes, and other components that use `t()` directly must do the same. This is documented on the `t()` JSDoc so applications consuming the contract do not render translation output unescaped.

## Fallback Is Localized From The First Deploy

The page host builds the fallback's `t` from `config.language` using the kit catalog whenever the Entry Point injects no `t`, so not-found and load-failed outcomes render localized text without any application i18n setup. When a valid shared-state facade is provided (and no `t` is injected), its `language` key is authoritative for that default and a language change re-renders an active fallback — mirroring how the shell reacts to `theme`/`direction`. This shared-state path is best-effort: an invalid facade or a failing read/subscription is logged with a stable `PEY_PAGE_HOST_SHARED_STATE_*` code and the host falls back to `config.language`; an invalid language tag reported by the store is logged with `PEY_PAGE_HOST_SHARED_STATE_LANGUAGE_INVALID` and the current translation is kept. A language refresh rebuilds the fallback before swapping it in, so a failed rebuild (logged with `PEY_PAGE_FALLBACK_RENDER_FAILED`) leaves the existing fallback and translation in place rather than emptying the page slot. For direction, the shell reflects `dir` from config and components use logical CSS properties, so localized strings render correctly in LTR and RTL.

# Contract Test And Deliverable Decisions

## Deliverables Are Contracts, Not Just Code

The deliverables are the documentation set and the unit/integration test suite, gated by the contract checks. The gate does not merely assert that files exist: it runs the full `node --test` suite headlessly (jsdom-backed, no real Core, backend, or History API) and treats the runner's exit code as the source of truth for pass/fail — the summary line is only parsed (tolerantly, in either spec or TAP shape) for reporting, so the gate does not depend on any particular Node reporter format or on a brittle absolute pass count. The contract test files themselves are the baseline, and the gate also checks that the UI map (`component-index.md`) stays in sync by referencing every kit component and the shared/routing/i18n infrastructure. Test coverage therefore protects the delivered contracts, and the docs stay in sync as part of the same deliverable rather than as an afterthought.

## Browser Spikes Are A Deliverable

The two browser-dependent contracts — the shared SVG sprite and the stylesheet attach method — are judged by real browsers, not jsdom. The runnable harness (`npm run spikes`, Playwright) ships the two spikes. The icon-sprite spike proves `<svg><use>` renders inside an open Shadow DOM under a subpath deployment and a target CSP policy, stays out of the accessibility tree (verified against the real browser tree in Chromium and the DOM-level `aria-hidden`/`focusable`/`role` contract in the other engines), and bubbles a delegated click (exercised with a real Playwright click). The stylesheet spike implements the final preload-and-cache-`<style>` attach method, checks the scope/cache/missing-sheet contract on the fast and target-CSP mounts (the light probe shares the shadow rule's id, so a leak would actually match; the server request counter is the authoritative single-fetch assertion), and measures first contentful paint for both the rejected `<link rel="stylesheet">` method and the final `<style>` method on a throttled mount — recording the CSP consequence of the final method explicitly. Each run writes a timestamped decision record carrying an overall `passed` and a `decision` alongside the per-scenario results, the mount, and the per-engine accessibility-tree coverage; the contract checks verify the harness exists and covers that scenario/browser matrix. The icon-sprite contract stays provisional until Chrome, Firefox and WebKit each record a passing run; the CSS-attach decision is made and final.

## The Kit Is Not Core-Loadable

The webui kit ships no root `index.js` and no root `manifest.json`, so Core cannot load it as a plugin — it is consumed only as a library package. The application manifest template (`templates/application-manifest.json`) is the consumer-side contract: it declares no `type`/`provides`/`adapterType`, requires `pey.router.service`, and declares the `ui:component-error` event with structured `{ name, type }` data so a product app that copies the template into its own manifest remains a valid Core UI manifest. The contract checks verify this invariant so a future contributor cannot accidentally make the kit loadable.

## Failure Paths Carry The Same Contracts As Success Paths

The tests pin the failure behavior that the success-path tests only imply: the not-found slot's load/connect failures render the internal not-found fallback (never `page-load-failed`, never retry, logged with `PEY_PAGE_LOAD_FAILED`/`PEY_PAGE_MOUNT_FAILED`), a failed `events.publish` result is logged to the console and forwarded to the optional logger with `PEY_ELEMENT_EVENT_PUBLISH_FAILED`, and a failed `ui:component-error` publish is never retried. The base class additionally documents and tests that the initial render reads template attribute values (no stale snapshot) and that a changed `data-pey-preserve` key does not restore the previous state — preserving the snapshot-isolation decision under re-renders.
