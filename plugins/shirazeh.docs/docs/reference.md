# shirazeh.docs — Reference

Self-contained reference for the `shirazeh.docs` product plugin. The manifest (`manifest.json`) is always the authoritative contract; this document explains it.

## Purpose

Owns the documentation domain of the Shirazeh application: mapping route paths to markdown documents, loading them through the HTTP transport, rendering them through the markdown service, and deriving navigation context (sidebar tree, previous/next links, page title) from the sidebar file.

## Structure

- `manifest.json` — plugin contract (identity, service, events, config).
- `index.js` — Bonyan two-phase entry point (`prepare` / `activate`), including the `core:service-unavailable` subscription.
- `lib/constants.js` — plugin name, service name, event and error codes, defaults.
- `lib/error.js` — standard Bonyan error factory.
- `lib/sidebar.js` — docsify-style sidebar parsing, path validation, path→URL mapping, neighbors.
- `lib/docs-service.js` — the documentation service and dependency binding.
- `tests/sidebar.test.js`, `tests/docs-service.test.js`, `tests/entry.test.js` — unit tests.

## Dependencies

- **Required:** `shirazeh.http.service` — every document and the sidebar file are fetched over HTTP; without it no page can load.
- **Required:** `pey.markdown.service` — markdown is rendered to sanitized HTML with heading ids and a toc; without it no page can be produced.

## Public API

The service `shirazeh.docs.service` provides two methods. Both resolve to a standard Bonyan error object on failure (never a thrown raw error).

### `getPage(path)`

```js
const page = await docsService.getPage('/guide/setup');

if (page.code !== undefined) {
  // e.g. DOC_PAGE_NOT_FOUND
}

// page = {
//   path: '/guide/setup',
//   html: '<h1 id="user-content-h-...">...</h1>...',
//   toc: [{ id, level, text }, ...],
//   title: 'نصب',              // first h1/h2 text, '' when no headings
//   previous: { href, title, level } | null,
//   next: { href, title, level } | null,
// }
```

- `/` maps to the configured `homePage` under `docsRoot`; other paths append `.md` unless the final segment already has an extension.
- `previous`/`next` come from the sidebar link order; both are `null` when the path is not in the sidebar or the sidebar failed to load.
- A missing sidebar reduces capability (no title/neighbors) but does not fail the page.

### `getSidebar()`

```js
const links = await docsService.getSidebar();
// [{ href: '/', title: 'خانه', level: 1 },
//  { href: 'guide', title: 'راهنما', level: 2 }, ...]
```

- The sidebar file is fetched once and cached for the plugin's lifetime; repeated calls reuse the cache.

## Events

| Event | When | Data |
|---|---|---|
| `docs:page-loaded` | A page was successfully loaded and rendered (never on failure). | `{ path: string }` — the route path that was loaded. |

Listens to (no declaration required):

- `core:service-unavailable` — when a required dependency's service disappears after activation, the plugin reports `REQUIRED_DEPENDENCY_LOST` as a critical error to the Core (the Core does not cascade automatically after group commit).

## Errors Reference

| Code | Situation | Type |
|---|---|---|
| `DOC_PAGE_NOT_FOUND` | The document for the requested path returned 404. | operational |
| `DOC_PATH_INVALID` | The path is not a string starting with `/`, or contains `..`, `#`, `?`, or a null byte. | operational |
| `DOC_RENDER_FAILED` | The document could not be loaded (transport error) or the markdown service failed/unavailable. | operational |
| `SIDEBAR_NOT_FOUND` | `getSidebar` was called and the sidebar file returned 404. | operational |
| `SIDEBAR_PARSE_FAILED` | The sidebar file is not text, has an unexpected type, or contains no links. | operational |
| `SERVICE_UNAVAILABLE` | The plugin is deactivated/shut down, or dependencies are not bound yet. | operational |
| `REQUIRED_DEPENDENCY_LOST` | Reported to the Core as a critical error when a required dependency becomes unavailable at runtime. | critical |

## Config

| Key | Type | Required | Default | Purpose |
|---|---|---|---|---|
| `docsRoot` | `string` | No | `./docs` | Folder (relative to the application origin) holding all documents. |
| `homePage` | `string` | No | `README.md` | Document served for the route `/`. |
| `sidebarFile` | `string` | No | `_sidebar.md` | Sidebar file name under `docsRoot`. |

## Business Rules

- A route path must start with `/`; traversal (`..`), fragments, and query strings are refused.
- Sidebar hrefs are reported exactly as authored (`guide`, `./guide`, or `/guide`); route normalization is the caller's concern.
- The title is the first level ≤ 2 heading from the rendered toc.
- The sidebar is loaded at most once per plugin lifetime.
- `docs:page-loaded` is published only after a successful render, carrying only the path.

## Constraints

- Do not call this plugin from the HTTP transport or markdown plugin (dependency direction is fixed: docs → http, docs → markdown).
- Do not put UI decisions here (which link to highlight, how to render the pager); this plugin returns data, the UI displays it.
- Markdown documents themselves are untrusted content; they are sanitized by `pey.markdown` before being returned as `html`.
