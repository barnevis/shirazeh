# pey.router Reference

The authoritative contract is [`manifest.json`](../manifest.json). If this reference and the manifest disagree, the manifest wins.

## Purpose

`pey.router` provides client-side navigation, route registration, route matching, and current-route state through a replaceable Router adapter. It is an infrastructure plugin for Bonyan architecture `0.11`.

## Structure

- `manifest.json` - authoritative plugin contract.
- `index.js` - Bonyan `prepare` and `activate` entry points.
- `lib/` - routing service, matching, path, error, constant, and adapter-loading logic.
- `adapters/` - technology-facing Router adapter implementations.
- `tests/` - unit, integration, lifecycle, manifest, and shared adapter-contract tests.
- `docs/` - complete plugin reference.
- `imp/` - requirements and implementation planning artifacts.

## Dependencies

- **Required:** None.
- **Optional:** None.

The plugin consumes the Router adapter selected by `bootstrap.json` through its `adapterType`, not another plugin service.

## Public API

The plugin provides `pey.router.service`. A consuming plugin must declare this exact service name in its own manifest dependencies before using it.

### `registerRoutes`

Registers route patterns cumulatively. Call it during the consuming plugin's local activation, after dependency binding. The complete batch is rejected without partial registration if any pattern is malformed.

```js
export async function activate(services) {
  const router = services['pey.router.service'];

  await router.registerRoutes([
    '/accounts',
    '/accounts/:id',
  ]);
}
```

### `navigate`

Pushes a new history entry. Query values may be strings, numbers, booleans, or `undefined`; `undefined` values are omitted. Put query data in `options.query`, not in `path`.

```js
await router.navigate('/accounts/42', {
  query: {
    tab: 'details',
    page: 2,
    archived: false,
    optional: undefined,
  },
});
```

If the path matches no registered pattern, the Promise still resolves successfully after the router falls back to `notFoundPath`.

### `replace`

Uses the same resolution rules as `navigate`, but replaces the current history entry.

```js
await router.replace('/accounts/42', {
  query: { tab: 'summary' },
});
```

There is intentionally no `replaceState` option on `navigate`. A caller that wants replace behavior calls `replace` directly — having two ways to trigger the same outcome was removed to keep the API surface minimal. `replace` is kept as a separate method because it is the only operation that replaces the current history entry; `navigate` never replaces, so there is no overlap between the two.

### `back`

Requests movement to the previous history entry. It is a no-op when no previous entry exists. Route resolution occurs when the adapter reports the resulting path through `onExternalChange`.

```js
await router.back();
```

### `forward`

Requests movement to the next history entry. It is a no-op when no next entry exists.

```js
await router.forward();
```

### `getCurrentRoute`

Synchronously returns a defensive copy of the resolved current route.

```js
const route = router.getCurrentRoute();

// {
//   path: '/accounts/42',
//   pattern: '/accounts/:id',
//   params: { id: '42' },
//   query: { tab: 'details' },
//   isNotFound: false,
// }
```

Before application plugins finish registering routes, the current route may have `isNotFound: true`.

### `matchRoute`

Synchronously matches an arbitrary well-formed pattern without consulting the registered pattern set. Query data is ignored. Unlike every other service method, which is Promise-based, `matchRoute` is the sole synchronous exception in this service's API.

```js
const match = router.matchRoute('/accounts/:id', '/accounts/42?tab=details');

// { params: { id: '42' } }
```

A valid non-match returns `null`. A malformed pattern throws `ROUTER_MALFORMED_PATTERN` synchronously.

## Route Registration

Route patterns are not known to this plugin in advance. Any plugin that owns one or more routes (typically product plugins, but not limited to them) must declare `pey.router.service` as a dependency in its own manifest — this is the standard Bonyan dependency mechanism, not a special exception granted to Router — and call `registerRoutes` with its patterns during its own local activation, after the Core has bound its declared dependencies. It cannot be called during preparation: no plugin holds any bound service reference during preparation, regardless of whether the target service belongs to an infrastructure or application plugin.

**Known limitation, explicitly deferred:** this version does not track which plugin owns which registered pattern, and does not remove patterns if the owning plugin is later deactivated (e.g. via `core:plugin-failed` or a critical-error cascade). A route left registered by a now-inactive plugin will still be treated as "matched" by the router even though nothing can serve it. This is a UX gap, not a lifecycle-safety gap: any stale reference to the deactivated plugin's own service already returns the standard `unavailable` error to its caller regardless of what the Router reports, so no unsafe or undefined behavior results — a consumer just reaches a route that reports as valid but whose underlying service call fails cleanly. Addressing this at the routing level (e.g. an `unregisterRoutes` method, or automatic cleanup tied to plugin deactivation) is left for a future version and is not required for the first implementation.

## Route Pattern Syntax

The `:paramName` syntax (e.g. `/accounts/:id`) is not an example — it is the fixed, mandatory convention for declaring path parameters in a route pattern across this entire project. Every pattern passed to `registerRoutes` or `matchRoute`, and the `pattern` field of `Route`, must all follow this same syntax. No alternative pattern syntax is permitted unless a future MINOR version of this plugin explicitly extends the convention.

- **Regex patterns are rejected** because a regex can express path shapes no fixed segment syntax can describe, which would break the guarantee that every registered pattern is written in the same predictable, declarative form; it would also force the matching utility and every future adapter target to embed regex semantics — with all their escaping and ambiguity — for no benefit this project needs.
- **`{param}` braces are rejected** because the convention must be single and unambiguous: allowing a second brace-based syntax gives two different ways to declare the same parameter, forces the matcher to disambiguate between them, and opens the door for different consumers to invent different shapes for the same concept.
- **Wildcard (`*`) patterns are rejected** because an unmatched path must remain detectable: a catch-all would swallow every path and make the `notFoundPath` sentinel fallback unreachable, contradicting the plugin's core unmatched-navigation behavior.

## Data Shapes

### `NavigateOptions`

```text
NavigateOptions {
  query?: Record<string, string | number | boolean | undefined>
}
```

`null`, arrays, and objects are invalid query values and cause `navigate` or `replace` to reject with `ROUTER_MALFORMED_QUERY`.

### `Route`

```text
Route {
  path: string
  pattern: string
  params: object
  query: object
  isNotFound: boolean
}
```

### `RouteMatch`

```text
RouteMatch {
  params: object
}
```

## Events

### `router:changed`

Published whenever the resolved active route changes through navigate, replace, back, forward, direct URL change, registration that resolves a prior fallback, or not-found fallback.

```js
{
  type: 'router:changed',
  data: { path: '/accounts/42' },
}
```

The payload contains only the resolved path relative to `basePath`. Call `getCurrentRoute()` for pattern, params, query, or `isNotFound`.

### `router:navigation-failed`

Published when a requested or reached path matches no registered route and fallback begins.

```js
{
  type: 'router:navigation-failed',
  data: {
    path: '/missing',
    reason: 'ROUTE_NOT_FOUND',
  },
}
```

For unmatched navigation, `router:navigation-failed` is published before `router:changed` for `notFoundPath`. Query values are excluded from both event payloads.

## Errors Reference

### Service Errors

| Code | Type | Situation |
|---|---|---|
| `ROUTER_MALFORMED_PATH` | Operational | `navigate` or `replace` receives an invalid path. |
| `ROUTER_MALFORMED_QUERY` | Operational | `navigate` or `replace` receives a query value that is not a string, number, boolean, or `undefined`. |
| `ROUTER_MALFORMED_PATTERN` | Operational | `registerRoutes` receives a malformed pattern, or `matchRoute` is called with one. |
| `ROUTER_NAVIGATION_FAILED` | Operational | The adapter fails a push, replace, back, or forward operation. |

`registerRoutes`, `navigate`, `replace`, `back`, and `forward` reject their Promises on failure. `matchRoute` is synchronous and throws its listed error directly.

### External Change Failures

A failure while resolving a path reported through `onExternalChange` (for example, the adapter refuses to replace an unmatched entry with `notFoundPath`) is handled as an ordinary Operational event inside the plugin: it is logged via `console.error` and contained, never escapes the callback or the plugin boundary, and is never returned by a service method. Escalating a single failed external-change resolution to Critical would deactivate the Router — on which most product plugins depend — over a transient, recoverable event.

The sole exception is the condition defined in the Router Adapter Contract: an adapter error carrying `detail.fatal === true`, meaning the underlying navigation technology itself has become entirely and unrecoverably unusable. Only an adapter error with this flag — from any of the six adapter primitives, including a failure delivered indirectly through the `onExternalChange` error path — is reported to the Core as a Critical error (`ROUTER_EXTERNAL_CHANGE_FAILED`) through `reportCriticalError`. Every other adapter error, regardless of which primitive produced it, is Operational only and must not trigger a Critical report.

A failure of the initial `onExternalChange` subscription while the service is being constructed is a Startup Error: it happens during preparation, so the plugin rejects preparation with the structured adapter error and never reports it as Critical.

### Startup And Adapter Errors

| Code | Type | Situation |
|---|---|---|
| `ROUTER_ADAPTER_NOT_FOUND` | Startup | The configured adapter identifier is unsupported. |
| `ROUTER_ADAPTER_INVALID` | Startup | The loaded adapter does not implement all required Router methods. |
| `ROUTER_ADAPTER_INITIALIZATION_FAILED` | Startup | Loading or creating the configured adapter fails. |
| `ROUTER_ADAPTER_UNAVAILABLE` | Startup | The Browser History API is unavailable. |
| `ROUTER_ADAPTER_OPERATION_FAILED` | Operational | A raw Browser History API or event-listener operation fails. Adapter errors consumed by public navigation methods are normalized to `ROUTER_NAVIGATION_FAILED`. |

### Service Lifecycle Errors

| Code | Type | Situation |
|---|---|---|
| `SERVICE_UNAVAILABLE` | Operational | A stale service reference is called after plugin deactivation. |

All errors crossing an adapter or plugin boundary use the standard Bonyan error structure. Raw browser errors, stack traces, paths containing query data, and other sensitive details are not propagated.

## Config

| Key | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `basePath` | `string` | No | `/` | Deployment path prefix added before adapter writes and removed after adapter reads. |
| `notFoundPath` | `string` | No | `/not-found` | Terminal fallback sentinel used when no registered pattern matches. |

Both values must be valid absolute paths.

## Adapter Selection

The manifest declares `adapterType: "router"`, so the project must configure a Router adapter in `bootstrap.json`. Two web implementations are included:

- **`BrowserHistoryAdapter`** — keeps the path in the real URL path (`/docs/intro`). Requires a server-side SPA fallback so deep links resolve.
- **`HashHistoryAdapter`** — keeps the path in the URL fragment (`/#/docs/intro`). Works on any static host without server rewrite rules, including GitHub Pages. Programmatic navigation goes through the History API, so `pushEntry`/`replaceEntry` fire no `hashchange`; only externally reached fragment changes notify the service.

```json
{
  "adapters": {
    "router": "HashHistoryAdapter"
  },
  "config": {
    "pey.router": {
      "basePath": "/",
      "notFoundPath": "/not-found"
    }
  }
}
```

Every Router adapter must implement exactly the shared methods defined in the [Router Adapter Contract](#router-adapter-contract) below.

## Router Adapter Contract

Unlike Storage, the architecture documents do not enumerate a base method set for a router adapter — this project defines it here, and any future router adapter (e.g. a Capacitor or Tauri navigation adapter) must implement this same set identically, so swapping the active adapter remains a configuration-only change.

### Adapter layer (raw, technology-facing, no decisions)

Required primitives, named for this project's contract:

- **`getCurrentPath`** — params: none. Returns: the current raw path as a string. Errors: standard Bonyan error if the underlying technology cannot report a current path.
- **`pushEntry`** — params: a raw path string. Returns: void. Errors: standard Bonyan error if the underlying technology refuses or fails the operation (e.g. a browser-imposed restriction on history manipulation).
- **`replaceEntry`** — params: a raw path string. Returns: void. Errors: same as `pushEntry`.
- **`goBack`** — params: none. Returns: void. Errors: standard Bonyan error only for an unexpected underlying failure; moving back with no previous entry is not an error, it is a no-op.
- **`goForward`** — params: none. Returns: void. Errors: same as `goBack`, and moving forward with no next entry is likewise a no-op, not an error.
- **`onExternalChange`** — params: a callback function with the fixed signature `(rawPath: string) => void`. This is the single, uniform mechanism for reporting any path change whose result is not known synchronously from the triggering call — this includes both a call to `goBack`/`goForward` and any navigation not initiated through this adapter at all (e.g. the browser's own back/forward buttons). On the web target, both cases fire through the same underlying `popstate` mechanism and are not distinguishable from each other, so the adapter must not attempt to treat them differently. The adapter must invoke this callback exactly once for each `goBack`/`goForward` call that actually results in a path change, and must not invoke it when `goBack`/`goForward` is a no-op (no previous/next entry, so the path does not change). `pushEntry`/`replaceEntry` are the only two operations whose result is known synchronously from the call itself, so they never trigger this callback. Every implementation of this adapter must call the callback with exactly this single-argument shape — no additional arguments, no wrapping object. Returns: an unsubscribe function taking no parameters and returning void. Errors: standard Bonyan error if the underlying technology offers no way to observe these changes.

The adapter converts any raw failure from the underlying technology into the standard Bonyan error structure before it leaves the adapter. The adapter has no concept of "route patterns," "matching," or "not found" — those are decisions and belong entirely to the plugin layer.

### Signaling an unrecoverable adapter failure

Any of the six adapter primitives above may fail with the standard Bonyan error structure. In the ordinary case, this reflects a single failed operation (e.g. one blocked `pushEntry` call) and the plugin treats it as Operational, per the handling described in the Errors Reference section. There is one distinct case the adapter contract must let the plugin detect: the underlying navigation technology itself has become entirely and unrecoverably unusable (e.g. the browser context this adapter depends on has been torn down), as opposed to one operation failing. To signal this specific case, the adapter sets `detail.fatal: true` on the standard Bonyan error object it returns from whichever primitive surfaced the failure. The plugin treats any adapter error carrying `detail.fatal === true` — from any of the six primitives, including a failure delivered indirectly through the `onExternalChange` error path — as the sole trigger for reporting a Critical error to the Core. Every other adapter error, regardless of which primitive produced it, is Operational only and must not trigger a Critical report.

### Plugin layer (orchestration and decisions)

Owns all decision logic, built on top of the adapter's raw primitives. This includes: maintaining the registry of patterns supplied via `registerRoutes`, matching a raw path against that registry (using the same standalone matching utility exposed as `matchRoute`), parsing query strings, deciding when a path is unmatched, and executing the `notFoundPath` fallback (including which events to publish and in what order). The plugin relies on `onExternalChange` as its sole signal for any path change it did not learn synchronously — including one it caused itself via `goBack`/`goForward` — and resolves and publishes `router:changed` (or the notFoundPath fallback) from that single signal, rather than trying to separately track the outcome of its own `goBack`/`goForward` calls. None of this decision logic belongs in the adapter — it must behave identically regardless of which navigation adapter is active.

### Test replaceability

The adapter must be replaceable in tests with a simple in-memory implementation of the same primitives (`getCurrentPath`, `pushEntry`, `replaceEntry`, `goBack`, `goForward`, `onExternalChange`), so the plugin's resolution, registration, and fallback logic can be tested without a real browser environment.

## Business Rules

- Route parameters use the fixed `:paramName` segment syntax.
- Registration is cumulative, duplicate patterns are ignored, and a malformed batch causes no partial mutation.
- Registered patterns and all service-facing paths are relative to `basePath`.
- Paths read from outside `basePath` use the not-found fallback.
- `notFoundPath` is a terminal sentinel; it is never rematched against registered patterns.
- Unmatched navigation is a routing outcome, not a caller-facing operational error.
- Push and replace are resolved synchronously from their adapter calls; back, forward, and external navigation are resolved only from `onExternalChange`.
- A successful back or forward path change produces exactly one external-change notification; a no-op produces none.
- Query values are available through `getCurrentRoute`, never through the Event Bus.
- The current `Route` is returned as a defensive copy.
- Service calls through stale references fail after deactivation.

## Constraints

- Do not call `registerRoutes` during preparation. Consumers receive service references only after dependency binding.
- Do not include query strings directly in the `path` argument to `navigate` or `replace`; use `options.query`.
- Do not use regex, `{param}`, wildcard, or parenthesized route-pattern syntax.
- Do not use this plugin for authorization or access-control decisions.
- Do not use this plugin for visual transitions, page rendering, product-specific deep-link rules, server-side routing, or server-side rendering.
- Route ownership and route removal on owner deactivation are not implemented in version `1.0.0`.
