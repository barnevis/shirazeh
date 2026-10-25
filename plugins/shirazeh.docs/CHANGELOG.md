# Changelog

All notable changes to `shirazeh.docs` are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows the Bonyan architecture rules.

## [0.2.0] - 2026-10-26

### Added

- Persian markdown dialect (parsneshan) injection into every `getPage` render: admonitions (`هشدار/توجه/نکته/مهم/احتیاط`), Persian ordered lists (`۱.`), Persian poetry blocks, and Persian footnote labels (`پاورقی`), each toggleable through the new `extensions` configuration flags (`admonitions`, `persianList`, `persianPoem`, `persianFootnote`; all default to true). Extensions are injected through `pey.markdown.service`'s `syntaxExtensions`/`htmlExtensions`/`footnoteOptions` parameters; the parsneshan package is vendored at `vendor/node_modules/parsneshan`.

## [0.1.0] - 2026-10-25

Initial experimental release. The 0.x range marks a plugin whose contract may still change.

### Added

- `shirazeh.docs.service` with:
  - `getPage(path)` — maps a route path to a markdown document under `docsRoot`, fetches it through `shirazeh.http.service`, renders it through `pey.markdown.service`, and returns `{ path, html, toc, title, previous, next }`; publishes `docs:page-loaded` (path only) on success.
  - `getSidebar()` — parses the docsify-style sidebar file into link entries, cached after the first load.
- Required dependencies on `shirazeh.http.service` and `pey.markdown.service`; runtime loss of a required dependency is reported as a critical error via `core:service-unavailable`.
- Errors `DOC_PAGE_NOT_FOUND`, `DOC_PATH_INVALID`, `DOC_RENDER_FAILED`, `SIDEBAR_NOT_FOUND`, `SIDEBAR_PARSE_FAILED`, `SERVICE_UNAVAILABLE`.
- Config keys `docsRoot` (`./docs`), `homePage` (`README.md`), `sidebarFile` (`_sidebar.md`).
- Unit tests with fake HTTP/markdown services, and the manifest contract test.
