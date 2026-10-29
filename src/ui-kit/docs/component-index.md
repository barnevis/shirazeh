# Component Index

The package contracts and the application bootstrap define no runtime components; the components below are the kit's runtime units. The contract test suite and documentation set are delivered and gated by the contract checks.

## Components

| Component | Module |
|---|---|
| `PeyElement` | `pey.webui/base/pey-element` |
| `AppShell` | `pey.webui/shell/app-shell` |
| `PageFallback` | `pey.webui/routing/page-fallback` (tag `pey-page-fallback`) |

Non-component kit infrastructure:

| Infrastructure module | Export |
|---|---|
| Shared SVG sprite contract | `pey.webui/base/icon-sprite`, `pey.webui/assets/icons.svg` |
| Stylesheet attach runtime | `pey.webui/base/attach-style-sheet` |
| Design tokens | `pey.webui/tokens.css` |
| Page-loader registry | `pey.webui/routing/page-loader` |
| Page host | `pey.webui/routing/page-host` |
| I18n contract | `pey.webui/i18n` |
| Kit translation catalog | `pey.webui/i18n/catalog` |

Product pages and components are never part of this kit index.
