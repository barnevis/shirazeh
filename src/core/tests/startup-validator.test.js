// Tests for StartupValidator — verifies architecture version, uniqueness, dependencies,
// adapterType rules, cross-manifest declaration validation, and settlement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  isArchitectureCompatible,
  validateDeclarations,
  settleRequiredDependencies,
} from '../src/startup-validator.js';
import { createInternalState } from '../src/internal-state.js';
import { createInternalLogger } from '../src/internal-logger.js';
import { createRegistry } from '../src/registry.js';
import { createStartupRegistry } from '../src/startup-registry.js';

const CORE_MANIFEST = {
  name: 'pey.core',
  version: '0.1.0',
  architecture: '0.5',
  description: 'Pey Core',
  type: 'infrastructure',
  dependencies: { required: [], optional: [] },
  provides: [],
  events: [],
  config: {},
};

function createManifest(overrides = {}) {
  return {
    name: 'acme.test',
    version: '1.0.0',
    architecture: '0.5',
    description: 'test plugin',
    type: 'product',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [],
    config: {},
    ...overrides,
  };
}

function createConfig(overrides = {}) {
  return {
    architecture: '0.5',
    core: { name: 'pey.core', version: '0.1.0' },
    adapters: {},
    ui: { path: './ui' },
    plugins: [],
    config: {},
    app: { name: 'Test', version: '1.0.0' },
    ...overrides,
  };
}

function setup() {
  const logger = createInternalLogger();
  const state = createInternalState();
  const registry = createRegistry(logger, CORE_MANIFEST);
  const config = createConfig();
  return { logger, state, registry, config };
}

// --- isArchitectureCompatible ---

test('isArchitectureCompatible returns true when MAJOR and MINOR match', () => {
  assert.equal(isArchitectureCompatible('0.5', '0.5'), true);
});

test('isArchitectureCompatible returns true when plugin MINOR is less than core MINOR', () => {
  assert.equal(isArchitectureCompatible('0.4', '0.5'), true);
});

test('isArchitectureCompatible returns false when MAJOR differs', () => {
  assert.equal(isArchitectureCompatible('1.0', '0.5'), false);
});

test('isArchitectureCompatible returns false when plugin MINOR is greater than core MINOR', () => {
  assert.equal(isArchitectureCompatible('0.6', '0.5'), false);
});

test('isArchitectureCompatible returns false for invalid version strings', () => {
  assert.equal(isArchitectureCompatible('invalid', '0.5'), false);
  assert.equal(isArchitectureCompatible('0.5', 'invalid'), false);
});

// --- validate: architecture version ---

test('validate fails with INCOMPATIBLE_ARCHITECTURE when MAJOR differs', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({ architecture: '1.0' });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('INCOMPATIBLE_ARCHITECTURE')));
});

test('validate fails when plugin MINOR is greater than core MINOR', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({ architecture: '0.6' });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('INCOMPATIBLE_ARCHITECTURE')));
});

test('validate passes when architecture is compatible', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({ architecture: '0.5' });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

// --- validate: plugin name uniqueness ---

test('validate fails with DUPLICATE_PLUGIN_NAME when name already exists', () => {
  const { state, registry, config } = setup();
  state.registerPlugin({
    name: 'acme.test',
    version: '1.0.0',
    manifest: createManifest(),
    context: {},
  });

  const manifest = createManifest({ name: 'acme.test' });
  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('DUPLICATE_PLUGIN_NAME')));
});

test('validate passes when plugin name is unique', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({ name: 'acme.unique' });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

// --- validate: required dependencies ---

test('validate fails with MISSING_REQUIRED_DEPENDENCY when a required dep is not in Registry', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({
    dependencies: { required: ['acme.missing.service'], optional: [] },
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('MISSING_REQUIRED_DEPENDENCY')));
});

test('validate passes when all required dependencies exist in Registry', () => {
  const { state, registry, config } = setup();
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.foo.service' }],
  });
  registry.register('acme.foo.service', {}, 'acme.provider', providerManifest);

  const manifest = createManifest({
    dependencies: { required: ['acme.foo.service'], optional: [] },
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

test('validate passes when an optional dependency is absent', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({
    dependencies: { required: [], optional: ['acme.missing.service'] },
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

// --- validate: adapterType ---

test('validate fails with ADAPTER_TYPE_NOT_ALLOWED for non-infrastructure plugin', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({
    type: 'product',
    adapterType: 'storage',
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('ADAPTER_TYPE_NOT_ALLOWED')));
});

test('validate passes for infrastructure plugin with adapterType when adapter is configured', () => {
  const { state, registry, config } = setup();
  config.adapters = { storage: 'IndexedDBAdapter' };
  const manifest = createManifest({
    type: 'infrastructure',
    adapterType: 'storage',
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

test('validate fails with ADAPTER_NOT_CONFIGURED when adapterType has no adapter in config', () => {
  const { state, registry, config } = setup();
  config.adapters = {};
  const manifest = createManifest({
    type: 'infrastructure',
    adapterType: 'storage',
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.startsWith('ADAPTER_NOT_CONFIGURED')));
});

test('validate returns systemFatal for duplicate adapterType', () => {
  const { state, registry, config } = setup();
  config.adapters = { storage: 'IndexedDBAdapter' };

  // Register first infrastructure plugin with adapterType 'storage'
  state.registerPlugin({
    name: 'acme.first',
    version: '1.0.0',
    manifest: createManifest({ name: 'acme.first', type: 'infrastructure', adapterType: 'storage' }),
    context: {},
  });

  // Validate second plugin with same adapterType
  const manifest = createManifest({
    name: 'acme.second',
    type: 'infrastructure',
    adapterType: 'storage',
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.equal(result.systemFatal, true);
  assert.ok(result.errors.some((e) => e.startsWith('DUPLICATE_ADAPTER_TYPE')));
});

// --- validate: infrastructure failure is fatal ---

test('validate returns fatal: true when an infrastructure plugin fails', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({
    type: 'infrastructure',
    architecture: '1.0', // incompatible
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.equal(result.fatal, true);
});

test('validate returns fatal: false when a non-infrastructure plugin fails', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({
    type: 'product',
    architecture: '1.0', // incompatible
  });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, false);
  assert.equal(result.fatal, false);
});

// --- validate: no adapterType field ---

test('validate passes when adapterType is not declared', () => {
  const { state, registry, config } = setup();
  const manifest = createManifest({ type: 'product' });

  const result = validate(manifest, '0.5', state, registry, config);

  assert.equal(result.valid, true);
});

// --- validateDeclarations: cross-manifest declaration validation ---

function createManifestsMap(...manifests) {
  const map = new Map();
  for (const m of manifests) {
    map.set(m.name, m);
  }
  return map;
}

test('validateDeclarations passes when all manifests are valid', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.storage',
      type: 'infrastructure',
      provides: [{ name: 'acme.storage.service' }],
    }),
    createManifest({
      name: 'acme.transactions',
      type: 'product',
      dependencies: { required: ['acme.storage.service'], optional: [] },
      provides: [{ name: 'acme.transactions.service' }],
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, true);
});

test('validateDeclarations fails with INCOMPATIBLE_ARCHITECTURE for an incompatible plugin', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({ name: 'acme.bad', architecture: '1.0' }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'INCOMPATIBLE_ARCHITECTURE'));
  assert.equal(result.errors[0].plugin, 'acme.bad');
});

test('validateDeclarations returns systemFatal for a duplicate service provider', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.first',
      provides: [{ name: 'acme.shared.service' }],
    }),
    createManifest({
      name: 'acme.second',
      provides: [{ name: 'acme.shared.service' }],
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.equal(result.systemFatal, true);
  assert.ok(result.systemFatalErrors.some((e) => e.startsWith('DUPLICATE_SERVICE_PROVIDER')));
});

test('validateDeclarations fails when a required dependency has no declared provider', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.consumer',
      dependencies: { required: ['acme.missing.service'], optional: [] },
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'MISSING_REQUIRED_DEPENDENCY_DECLARATION'));
  assert.equal(result.errors[0].plugin, 'acme.consumer');
});

test('validateDeclarations passes when a required dependency is declared by another manifest', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.provider',
      provides: [{ name: 'acme.foo.service' }],
    }),
    createManifest({
      name: 'acme.consumer',
      dependencies: { required: ['acme.foo.service'], optional: [] },
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, true);
});

test('validateDeclarations does not fail for an absent optional dependency', () => {
  const config = createConfig();
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.consumer',
      dependencies: { required: [], optional: ['acme.maybe.service'] },
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, true);
});

test('validateDeclarations fails with ADAPTER_TYPE_NOT_ALLOWED for a non-infrastructure plugin', () => {
  const config = createConfig({ adapters: { storage: 'IndexedDBAdapter' } });
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.bad',
      type: 'product',
      adapterType: 'storage',
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'ADAPTER_TYPE_NOT_ALLOWED'));
});

test('validateDeclarations passes for an infrastructure plugin with a configured adapterType', () => {
  const config = createConfig({ adapters: { storage: 'IndexedDBAdapter' } });
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.storage',
      type: 'infrastructure',
      adapterType: 'storage',
      provides: [{ name: 'acme.storage.service' }],
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, true);
});

test('validateDeclarations fails with ADAPTER_NOT_CONFIGURED when adapterType has no adapter', () => {
  const config = createConfig({ adapters: {} });
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.storage',
      type: 'infrastructure',
      adapterType: 'storage',
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'ADAPTER_NOT_CONFIGURED'));
});

test('validateDeclarations returns systemFatal for a duplicate adapterType', () => {
  const config = createConfig({ adapters: { storage: 'IndexedDBAdapter' } });
  const manifests = createManifestsMap(
    createManifest({
      name: 'acme.first',
      type: 'infrastructure',
      adapterType: 'storage',
    }),
    createManifest({
      name: 'acme.second',
      type: 'infrastructure',
      adapterType: 'storage',
    }),
  );

  const result = validateDeclarations(manifests, '0.5', config);

  assert.equal(result.valid, false);
  assert.equal(result.systemFatal, true);
  assert.ok(result.systemFatalErrors.some((e) => e.startsWith('DUPLICATE_ADAPTER_TYPE')));
});

// --- settleRequiredDependencies: actual-availability settlement ---

function createSettlementSetup() {
  const logger = createInternalLogger();
  const startupRegistry = createStartupRegistry(logger);
  const publicRegistry = createRegistry(logger, CORE_MANIFEST);
  return { logger, startupRegistry, publicRegistry };
}

test('settleRequiredDependencies returns an empty set when all required deps are available', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.foo.service' }],
  });
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    dependencies: { required: ['acme.foo.service'], optional: [] },
  });
  startupRegistry.add('acme.foo.service', {}, 'acme.provider', providerManifest);
  const manifests = createManifestsMap(providerManifest, consumerManifest);

  const toDeactivate = settleRequiredDependencies(
    new Set(['acme.provider', 'acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  assert.equal(toDeactivate.size, 0);
});

test('settleRequiredDependencies deactivates a consumer whose provider did not prepare', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    dependencies: { required: ['acme.missing.service'], optional: [] },
  });
  const manifests = createManifestsMap(consumerManifest);

  const toDeactivate = settleRequiredDependencies(
    new Set(['acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  assert.ok(toDeactivate.has('acme.consumer'));
});

test('settleRequiredDependencies cascades deactivation to dependents', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  // provider fails to prepare; consumer depends on provider; dependent depends on consumer
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.base.service' }],
  });
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    provides: [{ name: 'acme.consumer.service' }],
    dependencies: { required: ['acme.base.service'], optional: [] },
  });
  const dependentManifest = createManifest({
    name: 'acme.dependent',
    dependencies: { required: ['acme.consumer.service'], optional: [] },
  });
  // Only the consumer and dependent prepared; the provider did NOT prepare its service.
  startupRegistry.add('acme.consumer.service', {}, 'acme.consumer', consumerManifest);
  const manifests = createManifestsMap(providerManifest, consumerManifest, dependentManifest);

  const toDeactivate = settleRequiredDependencies(
    new Set(['acme.consumer', 'acme.dependent']), manifests, startupRegistry, publicRegistry, logger,
  );

  // consumer is deactivated (its required dep acme.base.service is unavailable),
  // which cascades to dependent (its required dep acme.consumer.service is now gone).
  assert.ok(toDeactivate.has('acme.consumer'));
  assert.ok(toDeactivate.has('acme.dependent'));
});

test('settleRequiredDependencies treats a service in the public registry as available', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.base.service' }],
  });
  publicRegistry.register('acme.base.service', {}, 'acme.provider', providerManifest);
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    dependencies: { required: ['acme.base.service'], optional: [] },
  });
  const manifests = createManifestsMap(consumerManifest);

  const toDeactivate = settleRequiredDependencies(
    new Set(['acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  assert.equal(toDeactivate.size, 0);
});

test('settleRequiredDependencies removes a deactivated plugin services from the startup registry', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    provides: [{ name: 'acme.consumer.service' }],
    dependencies: { required: ['acme.missing.service'], optional: [] },
  });
  startupRegistry.add('acme.consumer.service', {}, 'acme.consumer', consumerManifest);
  const manifests = createManifestsMap(consumerManifest);

  settleRequiredDependencies(
    new Set(['acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  assert.equal(startupRegistry.has('acme.consumer.service'), false);
});

test('settleRequiredDependencies does not deactivate a plugin whose provider is still surviving', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.base.service' }],
  });
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    dependencies: { required: ['acme.base.service'], optional: [] },
  });
  startupRegistry.add('acme.base.service', {}, 'acme.provider', providerManifest);
  const manifests = createManifestsMap(providerManifest, consumerManifest);

  const toDeactivate = settleRequiredDependencies(
    new Set(['acme.provider', 'acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  assert.equal(toDeactivate.size, 0);
});

test('settleRequiredDependencies does not log a warning in the normal case', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  const providerManifest = createManifest({
    name: 'acme.provider',
    provides: [{ name: 'acme.base.service' }],
  });
  const consumerManifest = createManifest({
    name: 'acme.consumer',
    dependencies: { required: ['acme.base.service'], optional: [] },
  });
  startupRegistry.add('acme.base.service', {}, 'acme.provider', providerManifest);
  const manifests = createManifestsMap(providerManifest, consumerManifest);

  settleRequiredDependencies(
    new Set(['acme.provider', 'acme.consumer']), manifests, startupRegistry, publicRegistry, logger,
  );

  const warnings = logger.getEntries().filter((e) => e.level === 'warn');
  assert.equal(warnings.length, 0);
});

test('settleRequiredDependencies terminates even with a deep dependency chain', () => {
  const { logger, startupRegistry, publicRegistry } = createSettlementSetup();
  // A chain of 5 plugins, each depending on the previous one's service.
  // The first provider did NOT prepare, so the whole chain must cascade.
  const manifests = createManifestsMap();
  const prepared = new Set();
  for (let i = 0; i < 5; i++) {
    const manifest = createManifest({
      name: `acme.level${i}`,
      provides: i < 4 ? [{ name: `acme.level${i}.service` }] : [],
      dependencies: i === 0
        ? { required: ['acme.root.service'], optional: [] }
        : { required: [`acme.level${i - 1}.service`], optional: [] },
    });
    manifests.set(manifest.name, manifest);
    prepared.add(manifest.name);
    if (i < 4) {
      startupRegistry.add(`acme.level${i}.service`, {}, `acme.level${i}`, manifest);
    }
  }

  // Should not hang or throw; all 5 are deactivated via cascade.
  const toDeactivate = settleRequiredDependencies(
    prepared, manifests, startupRegistry, publicRegistry, logger,
  );

  assert.equal(toDeactivate.size, 5);
});
