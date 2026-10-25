# Pey Core

[![AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)](#)
[![version](https://img.shields.io/badge/version-0.2.2-blue.svg)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bonyan Architecture](https://img.shields.io/badge/bonyan-0.11-56c3bf)](https://github.com/barnevis/bonyan)

Pey Core is the platform-neutral foundational runtime for the Pey plugin architecture. It provides the communication infrastructure (Registry, Event Bus), lifecycle management, configuration loading, and security enforcement for a modular application built from plugins.

The Core is constructed by the **Runtime Host** — a thin, platform-specific layer that injects three sources at construction time: `configSource`, `envSource`, and `moduleLoader`. The Core never reads files, accesses `process.env`, or loads modules directly.

## Features

- **Platform-neutral** — Runs on browser, Node.js, Capacitor, and Tauri without changes
- **Runtime Host architecture** — Three injected sources (ConfigSource, EnvSource, ModuleLoader)
- **Two-step ModuleLoader contract** — Manifest is loaded and validated before any plugin code runs
- **Group-based startup** — Infrastructure group starts first, then Application group. Each group: preparation → settlement → binding+activation → commit
- **Two-phase entry point** — Plugins export `prepare(prepareContext)` and `activate(services)`
- **Private StartupRegistry** — Holds prepared services until group commit; not exposed to plugins
- **Two-stage dependency validation** — Cross-manifest declaration validation + actual availability check
- **Cascading deactivation** — Failed required dependencies cascade to dependents at startup
- **Required dependency cycles** — Supported within groups via prepare-then-bind approach
- **Plugin Lifecycle Management** — Controlled startup, shutdown, and crash handling with group-based ordering
- **Service Registry** — Type-safe service registration and discovery with access control
- **Event Bus** — Publish/subscribe with enrichment, source forging prevention, and declaration validation
- **Configuration** — Environment variable substitution, per-plugin config merge
- **Security** — Manifest-based access control, sensitive data protection, audit logging, Registry isolation
- **UI Integration** — First-class UI layer with same contract as plugins (minus service provision), starts after both groups commit

## Installation

```bash
npm install @pey/core
```

## Quick Start

The Core is constructed by the Runtime Host with three injected sources:

```javascript
import { PeyCore } from '@pey/core';

// The Runtime Host provides three platform-neutral sources:
const configSource = {
  async getConfig() {
    // Return the parsed bootstrap.json content (platform-specific)
  },
};

const envSource = {
  get(varName) {
    // Return the environment value (platform-specific)
  },
};

const moduleLoader = {
  // Two-step contract: loadManifest() then loadEntry()
  async loadManifest(ref) {
    // Return the parsed manifest — must NOT execute plugin/UI code
  },
  async loadEntry(ref) {
    // Load and return the entry module — only called after successful validation
  },
};

const core = new PeyCore({ configSource, envSource, moduleLoader });
const { shutdown } = await core.start();

// ... application runs ...

await core.shutdown();
```

### Node.js Host Example

```javascript
import { PeyCore } from '@pey/core';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const configSource = {
  async getConfig() {
    const raw = readFileSync('./bootstrap.json', 'utf-8');
    return JSON.parse(raw);
  },
};

const envSource = {
  get(varName) { return process.env[varName]; },
};

const moduleLoader = {
  async loadManifest(ref) {
    const raw = readFileSync(join(ref, 'manifest.json'), 'utf-8');
    return JSON.parse(raw);
  },
  async loadEntry(ref) {
    return await import(pathToFileURL(join(ref, 'index.js')).href);
  },
};

const core = new PeyCore({ configSource, envSource, moduleLoader });
const { shutdown } = await core.start();
```

## Bootstrap Configuration

Create a `bootstrap.json` file (its content is provided to the Core via ConfigSource):

```json
{
  "architecture": "0.11",
  "core": { "name": "pey.core", "version": "0.2.0" },
  "adapters": { "storage": "IndexedDBAdapter" },
  "ui": { "path": "./ui" },
  "plugins": [
    { "name": "acme.storage", "version": "1.0.0", "path": "./plugins/storage" },
    { "name": "acme.app", "version": "1.0.0", "path": "./plugins/app" }
  ],
  "config": { "acme.storage": { "timeout": 5000 } },
  "app": { "name": "MyApp", "version": "1.0.0" }
}
```

## Documentation

- [Architecture Specification](docs/architecture.md)
- [API Reference](docs/api.md)
- [Configuration Guide](docs/configuration.md)
- [Manifest Schema](docs/manifest-schema.md)
- [Error Codes](docs/error-codes.md)
- [Core Events](docs/events.md)
- [Security Model](docs/security.md)
- [Testing Guide](docs/testing.md)
- [Adapter Integration](docs/adapters.md)
- [Plugin Authoring](docs/plugin-authoring.md)
- [UI Integration](docs/ui-integration.md)
- [Versioning & Compatibility](docs/versioning.md)
- [Changelog](CHANGELOG.md)

## License

MIT
