# pey.router

[![AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)](#)
[![version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bonyan Architecture](https://img.shields.io/badge/bonyan-0.11-56c3bf)](https://github.com/barnevis/bonyan)

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

## See Also

See [`docs/reference.md`](docs/reference.md) for the complete API, events, errors, configuration, business rules, and constraints reference.
