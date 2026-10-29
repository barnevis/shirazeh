// SystemLifecycle — orchestrates the controlled startup and shutdown of the entire system.
// 0.11 group-based startup: load all manifests, declaration validation, process
// infrastructure group, process application group, start UI, publish core:ready.
// Platform-neutral: the Runtime Host injects envSource and moduleLoader (two-step contract).

import { createInternalLogger } from './internal-logger.js';
import { createInternalState } from './internal-state.js';
import { createRegistry } from './registry.js';
import { createEventBus } from './event-bus.js';
import { createStartupRegistry } from './startup-registry.js';
import { load } from './config-loader.js';
import {
  createPluginLifecycle,
  processGroup,
  handleDeclarationFailure,
  PLUGIN_GROUP,
} from './plugin-lifecycle.js';
import { validateDeclarations } from './startup-validator.js';
import { validateManifestStructure } from './manifest-structure-validator.js';
import { createUIHandler } from './ui-handler.js';
import { CORE_ERROR_EVENTS } from './error-manager.js';

const INFRASTRUCTURE_TYPE = 'infrastructure';

/**
 * Starts the Pey Core system.
 *
 * The Core is platform-neutral. The configuration content is provided by the
 * Runtime Host's ConfigSource (already parsed). The `envSource` provides
 * environment values and the `moduleLoader` provides the two-step
 * `loadManifest()` / `loadEntry()` contract for plugin and UI files.
 *
 * Startup sequence (0.11):
 * 1. Load and validate configuration.
 * 2. Load ALL manifests via moduleLoader.loadManifest() (must not execute plugin code).
 * 3. Declaration validation across all manifests (validateDeclarations).
 * 4. Process infrastructure group (processGroup).
 * 5. Process application group (processGroup).
 * 6. Start UI after both groups commit.
 * 7. Publish core:ready.
 *
 * @param {object} configContent - The parsed configuration object from the host.
 * @param {object} envSource - A platform-neutral runtime environment source with a `get(varName)` method.
 * @param {object} moduleLoader - The Runtime Host's module loader with `loadManifest(ref)` and `loadEntry(ref)`.
 * @returns {Promise<{shutdown: Function}>} An object with a shutdown function.
 */
export async function start(configContent, envSource, moduleLoader, options = {}) {
  const { onEvent } = options;

  // Step 1: Load and validate configuration
  const config = load(configContent, envSource);
  const coreVersion = config.architecture;

  // Create core manifest
  const coreManifest = createCoreManifest(config);

  // Create core modules
  const logger = createInternalLogger();
  const internalState = createInternalState();
  const eventBus = createEventBus(logger, { onEvent });
  const registry = createRegistry(logger, coreManifest);
  const startupRegistry = createStartupRegistry(logger);

  // Create lifecycle handlers — both receive the Host's moduleLoader (two-step contract)
  const pluginLifecycle = createPluginLifecycle({
    logger,
    internalState,
    registry,
    eventBus,
    coreManifest,
    moduleLoader,
  });

  const uiHandler = createUIHandler({
    logger,
    registry,
    eventBus,
    coreManifest,
    moduleLoader,
  });

  let uiResult = { success: false, uiContext: null };
  let startupFailed = false;

  try {
    // Step 2: Load ALL manifests via moduleLoader.loadManifest() — must not execute plugin code.
    const manifests = await loadAllManifests(config, moduleLoader, internalState, eventBus, coreManifest, logger);
    if (manifests === null) {
      // A fatal declaration failure occurred during manifest loading — stop.
      startupFailed = true;
    } else {
      // Step 3: Declaration validation across ALL validated manifests
      const declarationResult = validateDeclarations(manifests, coreVersion, config);
      if (declarationResult.systemFatal) {
        logger.error('SYSTEM_FATAL', { errors: declarationResult.systemFatalErrors });
        eventBus.publish(
          { type: CORE_ERROR_EVENTS.STARTUP_FAILED, data: { reason: declarationResult.systemFatalErrors } },
          'core', coreManifest,
        );
        startupFailed = true;
      } else if (!declarationResult.valid) {
        // Deactivate plugins that failed declaration validation (entry point never loaded).
        // Group errors by plugin name so each plugin is handled exactly once —
        // a plugin may have multiple declaration errors (e.g. INCOMPATIBLE_ARCHITECTURE
        // and MISSING_REQUIRED_DEPENDENCY_DECLARATION), but handleDeclarationFailure
        // must be called once per plugin to avoid a second call seeing a deleted
        // manifest and misclassifying it as fatal.
        const errorsByPlugin = new Map();
        for (const error of declarationResult.errors) {
          if (!errorsByPlugin.has(error.plugin)) {
            errorsByPlugin.set(error.plugin, []);
          }
          errorsByPlugin.get(error.plugin).push(error);
        }

        let fatalFailure = false;
        for (const [pluginName, pluginErrors] of errorsByPlugin) {
          const manifest = manifests.get(pluginName);
          const firstError = pluginErrors[0];
          const result = handleDeclarationFailure(
            { name: pluginName }, manifest, firstError.code, firstError.message,
            internalState, eventBus, coreManifest, logger,
          );
          if (result.fatal) {
            fatalFailure = true;
            break;
          }
          manifests.delete(pluginName);
        }
        if (fatalFailure) {
          startupFailed = true;
        } else {
          // Step 4 & 5: Process groups
          startupFailed = await processAllGroups(
            config, manifests, startupRegistry, registry, internalState, eventBus,
            coreManifest, moduleLoader, logger, pluginLifecycle,
          );
        }
      } else {
        // Step 4 & 5: Process groups (all declarations valid)
        startupFailed = await processAllGroups(
          config, manifests, startupRegistry, registry, internalState, eventBus,
          coreManifest, moduleLoader, logger, pluginLifecycle,
        );
      }
    }

    if (!startupFailed) {
      // Step 6: Start UI (after both groups have committed)
      uiResult = await uiHandler.startUI(config);
      if (!uiResult.success) {
        eventBus.publish(
          { type: CORE_ERROR_EVENTS.UI_FAILED, data: { reason: uiResult.error } },
          'core', coreManifest,
        );
      }

      // Step 7: Publish core:ready — the only global success event
      eventBus.publish(
        { type: CORE_ERROR_EVENTS.READY, data: {} },
        'core', coreManifest,
      );
    }
  } catch (error) {
    logger.error('STARTUP_FAILED', { error: error.message });
    startupFailed = true;
  }

  // Return shutdown function
  return {
    shutdown: async () => {
      await shutdown(internalState, pluginLifecycle, uiHandler, uiResult.uiContext, eventBus, coreManifest);
    },
  };
}

/**
 * Loads all plugin manifests via moduleLoader.loadManifest().
 *
 * Returns a Map of plugin name → manifest, or null if a fatal declaration
 * failure occurred (an infrastructure plugin or unreadable manifest).
 *
 * @param {object} config - The bootstrap configuration.
 * @param {object} moduleLoader - The Host's module loader.
 * @param {object} internalState - The Core's internal state.
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} coreManifest - The Core's manifest.
 * @param {object} logger - The Core's internal logger.
 * @returns {Promise<Map<string, object>|null>} The manifests map, or null on fatal failure.
 * @private
 */
async function loadAllManifests(config, moduleLoader, internalState, eventBus, coreManifest, logger) {
  const manifests = new Map();
  const plugins = config.plugins ?? [];

  for (const pluginEntry of plugins) {
    let manifest;
    try {
      manifest = await moduleLoader.loadManifest(pluginEntry.path);
    } catch {
      const result = handleDeclarationFailure(
        pluginEntry, null, 'INVALID_MANIFEST', 'manifest could not be read',
        internalState, eventBus, coreManifest, logger,
      );
      if (result.fatal) {
        return null;
      }
      continue;
    }

    // Check for duplicate plugin names before storing the manifest.
    if (manifests.has(pluginEntry.name)) {
      const result = handleDeclarationFailure(
        pluginEntry, manifest, 'DUPLICATE_PLUGIN_NAME', 'plugin name already registered',
        internalState, eventBus, coreManifest, logger,
      );
      if (result.fatal) {
        return null;
      }
      continue;
    }

    const structureResult = validateManifestStructure(manifest);
    if (!structureResult.valid) {
      const result = handleDeclarationFailure(
        pluginEntry, manifest, 'INVALID_MANIFEST_STRUCTURE', structureResult.errors.join('; '),
        internalState, eventBus, coreManifest, logger,
      );
      if (result.fatal) {
        return null;
      }
      continue;
    }

    manifests.set(pluginEntry.name, manifest);
  }

  return manifests;
}

/**
 * Processes the infrastructure and application groups in order.
 *
 * @param {object} config - The bootstrap configuration.
 * @param {Map<string, object>} manifests - All validated manifests.
 * @param {object} startupRegistry - The private startup registry.
 * @param {object} registry - The public Registry.
 * @param {object} internalState - The Core's internal state.
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} coreManifest - The Core's manifest.
 * @param {object} moduleLoader - The Host's module loader.
 * @param {object} logger - The Core's internal logger.
 * @param {object} pluginLifecycle - The PluginLifecycle instance (for reportCriticalError).
 * @returns {Promise<boolean>} True if a fatal (infrastructure) failure occurred.
 * @private
 */
async function processAllGroups(
  config, manifests, startupRegistry, registry, internalState, eventBus,
  coreManifest, moduleLoader, logger, pluginLifecycle,
) {
  // Separate into groups based on manifest type
  const infrastructureEntries = [];
  const applicationEntries = [];
  for (const pluginEntry of config.plugins ?? []) {
    if (!manifests.has(pluginEntry.name)) {
      continue; // failed declaration validation
    }
    const manifest = manifests.get(pluginEntry.name);
    if (manifest.type === INFRASTRUCTURE_TYPE) {
      infrastructureEntries.push(pluginEntry);
    } else {
      applicationEntries.push(pluginEntry);
    }
  }

  const reportCriticalErrorFor = (pluginName) => (error) => pluginLifecycle.reportCriticalError(pluginName, error);

  // Step 4: Process infrastructure group
  const infraResult = await processGroup({
    pluginEntries: infrastructureEntries,
    manifests,
    config,
    startupRegistry,
    registry,
    internalState,
    eventBus,
    coreManifest,
    moduleLoader,
    logger,
    group: PLUGIN_GROUP.INFRASTRUCTURE,
    reportCriticalErrorFor,
  });

  if (infraResult.failed) {
    eventBus.publish(
      { type: CORE_ERROR_EVENTS.STARTUP_FAILED, data: { reason: infraResult.reason } },
      'core', coreManifest,
    );
    return true;
  }

  // Step 5: Process application group
  // Application failures are NOT fatal — cascading deactivation handles dependents.
  await processGroup({
    pluginEntries: applicationEntries,
    manifests,
    config,
    startupRegistry,
    registry,
    internalState,
    eventBus,
    coreManifest,
    moduleLoader,
    logger,
    group: PLUGIN_GROUP.APPLICATION,
    reportCriticalErrorFor,
  });

  return false;
}

/**
 * Shuts down the Pey Core system.
 *
 * @param {object} internalState - The Core's internal state.
 * @param {object} pluginLifecycle - The PluginLifecycle instance.
 * @param {object} uiHandler - The UIHandler instance.
 * @param {object|null} uiContext - The UI context from startUI.
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} coreManifest - The Core's manifest.
 * @returns {Promise<void>}
 */
async function shutdown(internalState, pluginLifecycle, uiHandler, uiContext, eventBus, coreManifest) {
  // Publish core:shutdown before shutdown begins
  eventBus.publish(
    { type: CORE_ERROR_EVENTS.SHUTDOWN, data: {} },
    'core', coreManifest,
  );

  // Stop UI first
  uiHandler.stopUI(uiContext);

  // Stop plugins in reverse startup order
  const startupOrder = internalState.getStartupOrder();
  for (let i = startupOrder.length - 1; i >= 0; i--) {
    const pluginName = startupOrder[i];
    pluginLifecycle.stopPlugin(pluginName);
  }
}

/**
 * Creates the Core's own manifest.
 *
 * @param {object} config - The bootstrap configuration.
 * @returns {object} The Core manifest.
 */
function createCoreManifest(config) {
  return {
    name: config.core.name,
    version: config.core.version,
    architecture: config.architecture,
    description: 'Pey Core',
    type: 'infrastructure',
    dependencies: { required: [], optional: [] },
    provides: [],
    events: [
      { name: CORE_ERROR_EVENTS.READY, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.SHUTDOWN, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.PLUGIN_FAILED, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.PLUGIN_CRASHED, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.UI_FAILED, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.STARTUP_FAILED, description: '', data: [] },
      { name: CORE_ERROR_EVENTS.SERVICE_UNAVAILABLE, description: '', data: [] },
    ],
    config: {},
  };
}
