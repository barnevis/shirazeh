# Overview

This document introduces `pey.webui` from scratch. If you have never seen this package before, start here — the rest of `docs/` assumes the context built in this page.

## What Is This Project And Why Does It Exist?

`pey.webui` is a **shared UI infrastructure kit** for application UIs built in the Pey architecture. It provides the common, product-neutral building blocks that every such UI needs — a component base class, page routing, a shared-state store, i18n and formatting, design tokens, and an icon sprite — so that each product team does not re-implement the same plumbing.

Without the kit, every application UI would repeat the same base-class logic, the same page-host wiring, the same state store, and the same translation lookup. The kit exists precisely to avoid that duplication: a team consumes the shared pieces, owns only its product pages and translations, and composes the kit's modules from its own UI Entry Point.

`pey.webui` is a **source kit**, not an application and not a Core plugin. It is consumed as a plain package of ES Modules that the consuming application imports directly.

## Where Does It Sit In The Bonyan Architecture And The Pey Framework?

The picture has two layers you need to keep straight:

- **Bonyan** is the name of the overall *architecture*: a set of standards   that any project can implement (service contracts, the Event Bus shape, plugin boundaries, and so on). It is not itself a runtime.
- **Pey** is the name of a *specific framework* built on the Bonyan architecture. It includes **Pey Core** — the runtime that loads plugins — and framework plugins such as **Pey Storage** (`pey.storage`) and **Pey
  Router** (`pey.router`).

`pey.webui` sits exactly in this spot:

- It is a **UI kit that mounts on Pey Core**: Core loads a consuming application's own UI Entry Point, and that Entry Point composes `pey.webui` modules.
- It depends on the **Pey Router plugin** — every consuming UI manifest must declare `pey.router.service` — because the kit mounts pages in reaction to the Router's `router:changed` events.
- It is **not** part of Core and **not** a Core plugin: it ships no Core-loadable `manifest.json` or `index.js`. It is an independent source package that each consuming application imports into its own UI.

In short: Bonyan is the standard, Pey (Core + plugins) is the framework built on it, and `pey.webui` is a reusable UI kit consumed by applications running on that framework.

## Project Folder Structure

The package root is flat. Each top-level folder has one role:

```text
pey.webui/
├── assets/     Icon sprite file plus fonts/images placeholders.
├── base/       Shared component base class (`PeyElement`), the external
│               stylesheet runtime, and the icon-sprite markup contract.
├── components/ Placeholder for kit-level components (currently empty).
├── i18n/       The injectable `createI18n()` contract and the kit-owned
│               internal translation catalog.
├── pages/      Placeholder for kit-level page components (currently empty).
├── routing/    Page-loader registry, generation-guarded page host, and the
│               internal not-found / load-failed fallback element.
├── shell/      The neutral `AppShell` component and the
│               `createApplicationSetup()` bootstrap helper.
├── templates/  Application-owned Core manifest and Entry Point starting
│               points that a product copies into its own UI root.
├── tests/      The jsdom-backed unit/integration test suite, one test file
│               per source file.
├── docs/       This documentation set (of which this file is the entry).
├── scripts/    Contract check scripts and the real-browser spike harness.
├── contracts.js        Stable kit names, config defaults, and error codes.
├── shared-state.js     The UI-local shared-state store.
└── tokens.css          Minimal design tokens as CSS Custom Properties.
```

## Where To Go Next

This document gives the big picture. For a deep understanding, read the docs in this order:

1. `entry-point.md` — the lifecycle contract your application's UI Entry Point must satisfy, and how `createApplicationSetup()` implements it.
2. `public-api.md` — the package boundaries and the stable exports, with usage notes for every runtime API.
3. `decisions.md` — the architectural decisions behind each contract, including the rejected alternatives and the rationale for each choice.

The remaining docs — `configuration.md`, `component-index.md`, and `shared-infrastructure.md` — are reference material to consult as needed.
