# Pey Core Adapter Integration Guide

## Overview

Adapters are the bridge between the Pey Core and the outside world — databases, authentication providers, file systems, message queues, and similar infrastructure. The Core itself is platform-neutral and never instantiates an adapter directly. Instead, the Runtime Host supplies the adapter name through the bootstrap configuration, and the Core passes the adapter name (selection) and plugin config to the infrastructure plugin that declared the matching `adapterType`. The plugin is then responsible for loading and using the adapter.

This guide explains how adapters are declared, how the Core routes adapter names to infrastructure plugins, and how a plugin consumes its adapter at runtime.

## What is an Adapter?

An adapter is the layer between the application and the outside world (databases, auth providers, file systems, etc.). From the Core's perspective:

- The Core reads the `adapters` section of `bootstrap.json`
- The Core **does not instantiate adapters** — it passes the adapter name to the responsible infrastructure plugin
- The infrastructure plugin loads and uses the adapter

## Architecture

```
bootstrap.json                    Infrastructure Plugin
┌─────────────────────┐           ┌─────────────────────────┐
│ adapters: {         │           │ manifest: {             │
│   "storage":        │──────────▶│   adapterType: "storage"│
│     "IndexedDBAdapter"           │ }                       │
│ }                     │           │                         │
└─────────────────────┘           │ config.adapter =        │
                                  │   "IndexedDBAdapter"    │
                                  │                         │
                                  │ setup(context) {        │
                                  │   const adapterName =   │
                                  │     context.config.adapter│
                                  │   const Adapter =       │
                                  │     await import(adapterName)│
                                  │   // use adapter        │
                                  │ }                       │
                                  └─────────────────────────┘
```

## Declaring an Adapter

### 1. In bootstrap.json

```json
{
  "adapters": {
    "storage": "IndexedDBAdapter",
    "auth": "OAuthAdapter",
    "filesystem": "NodeFSAdapter"
  }
}
```

### 2. In Infrastructure Plugin Manifest

```json
{
  "name": "acme.storage",
  "version": "1.0.0",
  "architecture": "0.11",
  "type": "infrastructure",
  "adapterType": "storage",
  "provides": [
    { "name": "acme.storage.service", "description": "...", "methods": [...] }
  ]
}
```

## Rules

| Rule | Enforcement |
|------|-------------|
| `adapterType` only for `type: "infrastructure"` | StartupValidator |
| Each `adapterType` unique across infrastructure plugins | StartupValidator (system fatal) |
| Adapter must exist in `bootstrap.json` adapters | StartupValidator |
| Unused adapter in config is ignored (not error) | ConfigLoader |

## Receiving the Adapter

The Core passes the adapter name (selection) and merged config to the infrastructure plugin. The plugin owns the adapter lifecycle — loading, initializing, and cleaning up.

### Phase 1: prepare()

In the preparation phase, the plugin loads the adapter from the config:

```javascript
export async function prepare(prepareContext) {
  const adapterName = prepareContext.config.adapter; // e.g., "IndexedDBAdapter"
  
  // Dynamic import of the adapter
  const AdapterModule = await import(adapterName);
  const adapter = new AdapterModule.default(prepareContext.config);
  
  // Build service on top of adapter
  const service = {
    async get(key) { return adapter.get(key); },
    async set(key, value) { return adapter.set(key, value); },
    // ...
  };
  
  return [{ name: 'acme.storage.service', object: service }];
}
```

## Adapter Interface

Adapters are plain JavaScript modules. No specific interface is enforced by the Core, but a typical adapter might look like:

```javascript
// IndexedDBAdapter.js
export default class IndexedDBAdapter {
  constructor(config) {
    this.dbName = config.dbName || 'app-db';
    this.timeout = config.timeout || 5000;
  }
  
  async connect() { /* ... */ }
  async get(key) { /* ... */ }
  async set(key, value) { /* ... */ }
  async delete(key) { /* ... */ }
  async list(prefix) { /* ... */ }
}
```

## Multiple Adapters

A plugin can only declare **one** `adapterType`. If it needs multiple adapters, it should:
1. Declare one as `adapterType` (receives via config)
2. Access others through other infrastructure plugins' services

## Example: Storage Infrastructure Plugin

### manifest.json
```json
{
  "name": "acme.storage",
  "version": "1.0.0",
  "architecture": "0.11",
  "type": "infrastructure",
  "adapterType": "storage",
  "dependencies": {
    "required": ["acme.logger"],
    "optional": []
  },
  "provides": [
    { "name": "acme.storage.service", "description": "Key-value storage", "methods": ["get", "set", "delete"] }
  ],
  "config": {
    "dbName": "app-db",
    "timeout": 5000
  }
}
```

### index.js
```javascript
import { createStorageService } from './storage-service.js';

export async function prepare(prepareContext) {
  const adapterName = prepareContext.config.adapter; // "IndexedDBAdapter"
  const Adapter = (await import(adapterName)).default;
  
  const adapter = new Adapter({
    dbName: prepareContext.config.dbName,
    timeout: prepareContext.config.timeout
  });
  
  await adapter.connect();
  
  const service = createStorageService(adapter);
  
  return [{ name: 'acme.storage.service', object: service }];
}
```

## Best Practices

1. **Keep adapters simple** — They should only handle the external system communication
2. **Build services on top** — Infrastructure plugins build domain services on adapters
3. **Handle errors** — Adapters should throw standard errors; plugins convert to PeyError
4. **Use config for adapter options** — Pass adapter-specific config via manifest.config
5. **Clean up in onShutdown** — Close connections, release resources

## Security

- Adapter name comes from the configuration content provided by ConfigSource (controlled by the Runtime Host)
- Plugin cannot forge or change the adapter
- Only the declared infrastructure plugin receives the adapter name
- Adapters themselves are not validated by Core (plugin responsibility)