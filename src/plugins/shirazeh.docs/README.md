# shirazeh.docs

## Purpose

Product plugin for the Shirazeh documentation application: resolves documentation routes to markdown documents, renders them through the markdown service, and returns pages with sidebar-derived navigation context.

## Structure

- `manifest.json` — plugin contract (identity, service, events, config).
- `index.js` — Bonyan two-phase entry point (`prepare` / `activate`).
- `lib/constants.js` — plugin names, error codes, defaults.
- `lib/error.js` — standard Bonyan error factory.
- `lib/sidebar.js` — sidebar parsing and path resolution.
- `lib/docs-service.js` — the documentation service.
- `tests/` — unit tests (`node:test`).

## Dependencies

- **Required:** `shirazeh.http.service` — fetching markdown and sidebar documents over HTTP.
- **Required:** `pey.markdown.service` — rendering markdown to sanitized HTML with a table of contents.

## See Also

See [docs/reference.md](docs/reference.md) for the full API, events, errors, config, business rules, and constraints.
