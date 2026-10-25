// PluginLifecycle — manages the startup and shutdown of plugins.
// 0.11 group-based startup: processGroup runs four phases (preparation,
// settlement, binding+activation, commit) for a group of plugins. Also
// implements reportCriticalError (runtime crash handling) and stopPlugin
// (shutdown). Platform-neutral: the Runtime Host's moduleLoader provides the
// two-step loadManifest() / loadEntry() contract. The manifest is loaded and
// validated before any plugin code is loaded.

import { settleRequiredDependencies } from './startup-validator.js';
import { mergePluginConfig } from './config-merger.js';
import { buildPrepareContext, buildServiceMapForGroup } from './context-builder.js';
import { CORE_ERROR_EVENTS, STARTUP_FAILURE_REASON } from './error-manager.js';
import { PLUGIN_STATUS } from './internal-state.js';
import { injectAdapterConfig } from './adapter-handler.js';

const INFRASTRUCTURE_TYPE = 'infrastructure';

/**
 * Startup group identifiers. Infrastructure plugins form one group; application
 * plugins (Product, Feature, Platform, Transport) form another.
 *
 * @readonly
 * @enum {string}
 */
export const PLUGIN_GROUP = Object.freeze({
  INFRASTRUCTURE: 'infrastructure',
  APPLICATION: 'application',
});

/**
 * Creates a new PluginLifecycle instance.
 *
 * @param {object} deps - The lifecycle dependencies.
 * @param {object} deps.logger - The Core's internal logger.
 * @param {object} deps.internalState - The Core's internal state.
 * @param {object} deps.registry - The Core's Registry instance.
 * @param {object} deps.eventBus - The Core's Event Bus instance.
 * @param {object} deps.coreManifest - The Core's own manifest.
 * @param {object} deps.moduleLoader - The Runtime Host's module loader exposing the
 *   two-step contract: `loadManifest(ref)` (must not execute plugin code) and
 *   `loadEntry(ref)` (called only after successful manifest validation).
 * @returns {object} An object with reportCriticalError and stopPlugin methods.
 */
export function createPluginLifecycle({ logger, internalState, registry, eventBus, coreManifest, moduleLoader }) {
  return {
    /**
     * Handles a critical error reported by a plugin at runtime.
     *
     * Deactivation order: notify the plugin via onDeactivated BEFORE removing
     * services from the Registry. Plugin errors during deactivation do not block
     * the process. The system continues with degraded capability.
     *
     * @param {string} pluginName - The name of the plugin reporting the error.
     * @param {object} peyError - The standard PeyError object.
     * @returns {void}
     */
    reportCriticalError(pluginName, peyError) {
      const record = internalState.getPlugin(pluginName);
      if (!record || record.status !== PLUGIN_STATUS.ACTIVE) {
        return;
      }

      logger.error('PLUGIN_CRASHED', { pluginName, error: peyError });

      // STEP 1: Set INACTIVE and notify the plugin via onDeactivated
      internalState.setPluginStatus(pluginName, PLUGIN_STATUS.INACTIVE);
      try {
        if (record.context.onDeactivated) {
          record.context.onDeactivated();
        }
      } catch (error) {
        logger.error('DEACTIVATION_ERROR', { pluginName, error: error.message });
      }

      // STEP 2: Remove the plugin's services from the Registry
      registry.deregisterByPlugin(pluginName, eventBus);

      // STEP 3: Publish core:plugin-crashed
      eventBus.publish(
        { type: CORE_ERROR_EVENTS.PLUGIN_CRASHED, data: { pluginName, code: peyError.code } },
        'core', coreManifest,
      );
    },

    /**
     * Shuts down a plugin in reverse startup order.
     *
     * Sets INACTIVE before deregistering services (consistent with reportCriticalError).
     * Plugin errors during shutdown do not block the process.
     *
     * @param {string} pluginName - The name of the plugin to stop.
     * @returns {void}
     */
    stopPlugin(pluginName) {
      const record = internalState.getPlugin(pluginName);
      if (!record || record.status !== PLUGIN_STATUS.ACTIVE) {
        return;
      }

      // Step 1: Notify the plugin via onShutdown
      try {
        if (record.context.onShutdown) {
          record.context.onShutdown();
        }
      } catch (error) {
        logger.error('SHUTDOWN_ERROR', { pluginName, error: error.message });
      }

      // Step 2: Set INACTIVE BEFORE deregistering (consistent with reportCriticalError)
      internalState.setPluginStatus(pluginName, PLUGIN_STATUS.INACTIVE);

      // Step 3: Remove the plugin's services from the Registry
      registry.deregisterByPlugin(pluginName, eventBus);

      // Step 4: Publish pluginname:stopped
      eventBus.publish(
        { type: `${getPluginEventName(pluginName)}:stopped`, data: {} },
        'core', coreManifest,
      );
    },
  };
}

/**
 * Invokes the prepare() phase of a plugin's two-phase entry point (0.11 contract).
 *
 * Phase 1 — prepare(prepareContext): the plugin prepares its declared services
 *   without calling another application plugin's service. Returns the prepared
 *   service instances.
 *
 * The entry module is loaded once via moduleLoader.loadEntry(); both phases are
 * invoked on the same module. The caller is responsible for calling prepare()
 * and activate() at the right points in the group startup flow.
 *
 * @param {object} entryModule - The already-loaded entry module (with prepare and activate).
 * @param {object} prepareContext - The PrepareContext (config + events + hooks, no services).
 * @returns {Promise<Array<{name: string, object: object}>>} The prepared service instances.
 * @throws {Error} If prepare() fails or does not return an array.
 */
export async function invokePrepare(entryModule, prepareContext) {
  const providedServices = await entryModule.prepare(prepareContext);
  if (!Array.isArray(providedServices)) {
    throw new Error('prepare() must return an array of service instances');
  }
  return providedServices;
}

/**
 * Invokes the activate() phase of a plugin's two-phase entry point (0.11 contract).
 *
 * Phase 2 — activate(services): the Core binds the plugin's declared
 *   dependencies (resolved from the startup registry and public registry) and
 *   the plugin performs local activation.
 *
 * @param {object} entryModule - The already-loaded entry module (with activate).
 * @param {Object<string, object>} services - The bound declared dependencies.
 * @returns {Promise<void>}
 * @throws {Error} If activate() fails.
 */
export async function invokeActivate(entryModule, services) {
  await entryModule.activate(services);
}

/**
 * Extracts the event name segment from a plugin name (without vendor).
 *
 * @param {string} pluginName - The full plugin name (vendor.name).
 * @returns {string} The name segment after the dot.
 * @private
 */
function getPluginEventName(pluginName) {
  const parts = pluginName.split('.');
  return parts.length > 1 ? parts[1] : pluginName;
}

/**
 * Handles a plugin that failed during preparation, binding, or activation
 * within a group. Publishes `core:plugin-failed` and marks the plugin inactive.
 *
 * If the plugin was prepared (its `prepare()` ran successfully), the Core calls
 * the `onDeactivated` hook before marking it INACTIVE. This gives the plugin a
 * chance to release resources (e.g. close a database connection) even when it
 * never reaches `activate()` — for example when it is cascaded during
 * settlement, fails during activation, or is skipped by an infrastructure
 * group short-circuit.
 *
 * @param {object} pluginEntry - The plugin entry (with name).
 * @param {object} manifest - The plugin's manifest.
 * @param {string} code - The error code.
 * @param {string} detail - The error detail.
 * @param {object} internalState - The Core's internal state.
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} coreManifest - The Core's manifest.
 * @param {object} logger - The Core's internal logger.
 * @returns {void}
 */
export function handleGroupFailure(pluginEntry, manifest, code, detail, internalState, eventBus, coreManifest, logger) {
  logger.error('PLUGIN_FAILED', { pluginName: pluginEntry.name, code, detail });

  const record = internalState.getPlugin(pluginEntry.name);

  // If the plugin was prepared, notify it via onDeactivated BEFORE setting
  // INACTIVE — the plugin may have acquired real resources in prepare() and
  // needs a chance to release them even if activate() was never called.
  // Plugin errors during deactivation do not block the process.
  if (record?.prepared && record.context?.onDeactivated) {
    try {
      record.context.onDeactivated();
    } catch (error) {
      logger.error('DEACTIVATION_ERROR', { pluginName: pluginEntry.name, error: error.message });
    }
  }

  if (internalState.hasPlugin(pluginEntry.name)) {
    internalState.setPluginStatus(pluginEntry.name, PLUGIN_STATUS.INACTIVE);
  }

  eventBus.publish(
    { type: CORE_ERROR_EVENTS.PLUGIN_FAILED, data: { pluginName: pluginEntry.name, code } },
    'core', coreManifest,
  );
}

/**
 * Handles a plugin that failed declaration validation or manifest loading.
 * The entry point is never loaded. An infrastructure plugin failing at this
 * stage is fatal — it stops the entire system, just as it would during
 * preparation or activation.
 *
 * @param {object} pluginEntry - The plugin entry (with name).
 * @param {object|null} manifest - The manifest (null if it could not be read).
 * @param {string} code - The error code.
 * @param {string} detail - The error detail.
 * @param {object} internalState - The Core's internal state.
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} coreManifest - The Core's manifest.
 * @param {object} logger - The Core's internal logger.
 * @returns {{fatal: boolean}} Whether the failure is fatal (infrastructure or unreadable type).
 */
export function handleDeclarationFailure(pluginEntry, manifest, code, detail, internalState, eventBus, coreManifest, logger) {
  logger.error('DECLARATION_FAILED', { pluginName: pluginEntry.name, code, detail });

  // Plugin is INACTIVE — no "failed" state exists. No entry point is loaded.
  if (internalState.hasPlugin(pluginEntry.name)) {
    internalState.setPluginStatus(pluginEntry.name, PLUGIN_STATUS.INACTIVE);
  }

  eventBus.publish(
    { type: CORE_ERROR_EVENTS.PLUGIN_FAILED, data: { pluginName: pluginEntry.name, code } },
    'core', coreManifest,
  );

  // An infrastructure plugin failing at ANY stage — including declaration
  // validation and manifest loading — is fatal and stops the entire system.
  // When the manifest could not be read at all (manifest is null), the type
  // cannot be determined; treat that as fatal too, to be safe.
  const isInfrastructure = manifest?.type === INFRASTRUCTURE_TYPE;
  const isTypeMissing = manifest === null || manifest?.type === undefined;
  if (isInfrastructure || isTypeMissing) {
    eventBus.publish(
      { type: CORE_ERROR_EVENTS.STARTUP_FAILED, data: { reason: code } },
      'core', coreManifest,
    );
    return { fatal: true };
  }

  return { fatal: false };
}

/**
 * Processes a startup group through four phases: preparation, settlement,
 * binding+activation, and commit.
 *
 * For the infrastructure group, a failure at ANY phase is fatal: the group
 * stops immediately (short-circuit) and { failed: true } is returned. For the
 * application group, a failure deactivates only that plugin and processing
 * continues (cascading deactivation handles dependents).
 *
 * `pluginname:ready` is published only after the group commits, in
 * configuration order for all surviving plugins.
 *
 * @param {object} params - The group processing parameters.
 * @param {Array<object>} params.pluginEntries - Plugin entries in configuration order.
 * @param {Map<string, object>} params.manifests - All validated manifests, keyed by plugin name.
 * @param {object} params.config - The bootstrap configuration.
 * @param {object} params.startupRegistry - The private startup registry.
 * @param {object} params.registry - The public Registry.
 * @param {object} params.internalState - The Core's internal state.
 * @param {object} params.eventBus - The Core's Event Bus instance.
 * @param {object} params.coreManifest - The Core's manifest.
 * @param {object} params.moduleLoader - The Host's module loader (two-step contract).
 * @param {object} params.logger - The Core's internal logger.
 * @param {string} params.group - One of the PLUGIN_GROUP values.
 * @param {Function} [params.reportCriticalErrorFor] - Builds a reportCriticalError fn for a plugin name.
 * @returns {Promise<{failed: boolean, reason?: string}>}
 */
export async function processGroup({
  pluginEntries, manifests, config, startupRegistry, registry,
  internalState, eventBus, coreManifest, moduleLoader, logger, group,
  reportCriticalErrorFor,
}) {
  // ── Phase 1: Preparation ──────────────────────────────────────────
  // Each plugin prepares its own declared services without calling another
  // application plugin's service. Prepared services go into the private startup registry.
  const prepared = new Map();

  for (const pluginEntry of pluginEntries) {
    const manifest = manifests.get(pluginEntry.name);

    // Merge configuration (manifest defaults + project config + adapter injection)
    const finalConfig = mergePluginConfig(manifest.config, config.config?.[pluginEntry.name]);
    const adapterResult = injectAdapterConfig(manifest, config, finalConfig);
    if (!adapterResult.success) {
      handleGroupFailure(pluginEntry, manifest, 'ADAPTER_SELECTION_INVALID', adapterResult.error, internalState, eventBus, coreManifest, logger);
      startupRegistry.removeByPlugin(manifest.name);
      if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
        return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
      }
      continue;
    }

    // Build preparation context (config + events, NO services)
    const prepareContext = buildPrepareContext({
      manifest,
      eventBus,
      config: finalConfig,
      reportCriticalError: reportCriticalErrorFor
        ? reportCriticalErrorFor(manifest.name)
        : () => {},
    });

    // Register in internal state (INACTIVE, group set)
    internalState.registerPlugin({
      name: manifest.name,
      version: manifest.version,
      manifest,
      context: prepareContext,
      group,
    });

    // Load entry point via moduleLoader.loadEntry() — only after declaration validation
    let entryModule;
    try {
      entryModule = await moduleLoader.loadEntry(pluginEntry.path);
    } catch (error) {
      handleGroupFailure(pluginEntry, manifest, 'ENTRY_POINT_FAILED', error.message, internalState, eventBus, coreManifest, logger);
      if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
        return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
      }
      continue;
    }

    // Phase 1: prepare — plugin returns its declared services
    try {
      const providedServices = await invokePrepare(entryModule, prepareContext);

      // Validate each service is declared in manifest.provides, add to startup registry
      for (const serviceInstance of providedServices) {
        const regResult = startupRegistry.add(
          serviceInstance.name, serviceInstance.object, manifest.name, manifest,
        );
        if (!regResult.success) {
          throw new Error(regResult.error);
        }
      }

      prepared.set(manifest.name, { entryModule, context: prepareContext, providedServices });
      internalState.markPrepared(manifest.name, true);
    } catch (error) {
      // Preparation failure — plugin is deactivated
      handleGroupFailure(pluginEntry, manifest, 'PREPARATION_FAILED', error.message, internalState, eventBus, coreManifest, logger);
      // Its services (if any were added) are removed from the startup registry
      startupRegistry.removeByPlugin(manifest.name);
      // Infrastructure failure is fatal — short-circuit the group immediately.
      if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
        return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
      }
    }
  }

  // ── Phase 2: Settlement ───────────────────────────────────────────
  // Check actual availability of required dependencies. Cascade-deactivate
  // plugins whose required provider did not prepare the service.
  const toDeactivate = settleRequiredDependencies(
    new Set(prepared.keys()), manifests, startupRegistry, registry, logger,
  );

  for (const pluginName of toDeactivate) {
    const manifest = manifests.get(pluginName);
    handleGroupFailure(
      { name: pluginName }, manifest, STARTUP_FAILURE_REASON.REQUIRED_DEPENDENCY_UNAVAILABLE,
      'a required dependency was not available', internalState, eventBus, coreManifest, logger,
    );
    startupRegistry.removeByPlugin(pluginName);
    prepared.delete(pluginName);
    internalState.markPrepared(pluginName, false);
  }

  // In the infrastructure group, any deactivation (including cascaded) is fatal.
  if (group === PLUGIN_GROUP.INFRASTRUCTURE && toDeactivate.size > 0) {
    return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
  }

  // ── Phase 3: Dependency Binding + Local Activation ─────────────────
  // The Core binds direct service references for surviving plugins, then
  // each plugin performs local activation. During this phase, an application
  // plugin must not call another application plugin's service.
  for (const pluginEntry of pluginEntries) {
    if (!prepared.has(pluginEntry.name)) {
      continue; // was deactivated
    }

    const manifest = manifests.get(pluginEntry.name);
    const data = prepared.get(pluginEntry.name);

    // Bind declared dependencies (from startup registry + public registry)
    const services = buildServiceMapForGroup(manifest, startupRegistry, registry);

    // Phase 2: activate — plugin receives services, performs local activation
    try {
      await invokeActivate(data.entryModule, services);
    } catch (error) {
      // Activation failure — deactivate and re-settle
      handleGroupFailure(pluginEntry, manifest, 'ACTIVATION_FAILED', error.message, internalState, eventBus, coreManifest, logger);
      startupRegistry.removeByPlugin(manifest.name);
      prepared.delete(manifest.name);
      internalState.markPrepared(manifest.name, false);

      // Infrastructure failure is fatal — short-circuit the group immediately.
      if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
        return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
      }

      // Re-settle: other plugins that depended on this plugin's services must also be deactivated
      const additionalDeactivations = settleRequiredDependencies(
        new Set(prepared.keys()), manifests, startupRegistry, registry, logger,
      );
      for (const depName of additionalDeactivations) {
        handleGroupFailure(
          { name: depName }, manifests.get(depName), STARTUP_FAILURE_REASON.REQUIRED_DEPENDENCY_UNAVAILABLE,
          'a required dependency was not available', internalState, eventBus, coreManifest, logger,
        );
        startupRegistry.removeByPlugin(depName);
        prepared.delete(depName);
        internalState.markPrepared(depName, false);
      }
    }
  }

  // ── Phase 4: Group Commit ─────────────────────────────────────────
  // Promote prepared services to the public Registry, mark plugins ACTIVE,
  // and publish pluginname:ready in configuration order.
  for (const pluginEntry of pluginEntries) {
    if (!prepared.has(pluginEntry.name)) {
      continue;
    }

    const manifest = manifests.get(pluginEntry.name);
    const data = prepared.get(pluginEntry.name);

    // Promote services from private startup registry to public Registry.
    // promoteToPublic checks the registration result and only removes a
    // service from the private registry on success, keeping state consistent.
    const promoteResult = startupRegistry.promoteToPublic(registry, manifest.name, manifest);
    if (promoteResult.success) {
      // Record each promoted service in internal state
      for (const serviceName of promoteResult.promotedServices) {
        internalState.addProvidedService(manifest.name, serviceName);
      }
    }
    if (!promoteResult.success) {
      // Public registration failed — the service remains in the private
      // registry. Treat this as a group failure: deactivate the plugin and
      // (for infrastructure) short-circuit.
      handleGroupFailure(pluginEntry, manifest, 'SERVICE_REGISTRATION_FAILED', promoteResult.error, internalState, eventBus, coreManifest, logger);
      startupRegistry.removeByPlugin(manifest.name);
      prepared.delete(manifest.name);
      internalState.markPrepared(manifest.name, false);
      if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
        return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
      }

      // Re-settle: other plugins that depended on this plugin's services must
      // also be deactivated, consistent with the activation failure path.
      // In the commit phase, some plugins may have already been committed
      // (their services promoted to the public Registry). For those, we must
      // deregister from the public Registry (which publishes
      // core:service-unavailable). For not-yet-committed plugins, we remove
      // from the startup registry (silent, since they were never public).
      const additionalDeactivations = settleRequiredDependencies(
        new Set(prepared.keys()), manifests, startupRegistry, registry, logger,
      );
      for (const depName of additionalDeactivations) {
        const depRecord = internalState.getPlugin(depName);
        handleGroupFailure(
          { name: depName }, manifests.get(depName), STARTUP_FAILURE_REASON.REQUIRED_DEPENDENCY_UNAVAILABLE,
          'a required dependency was not available', internalState, eventBus, coreManifest, logger,
        );
        if (depRecord?.committed) {
          // Already committed — remove from the public Registry (publishes
          // core:service-unavailable for each removed service).
          registry.deregisterByPlugin(depName, eventBus);
        } else {
          // Not yet committed — remove from the startup registry (silent).
          startupRegistry.removeByPlugin(depName);
        }
        prepared.delete(depName);
        internalState.markPrepared(depName, false);
      }
      continue;
    }

    // Mark ACTIVE
    internalState.setPluginStatus(manifest.name, PLUGIN_STATUS.ACTIVE);
    internalState.markCommitted(manifest.name, true);
  }

  // Publish pluginname:ready in configuration order for committed plugins
  for (const pluginEntry of pluginEntries) {
    if (prepared.has(pluginEntry.name)) {
      eventBus.publish(
        { type: `${getPluginEventName(pluginEntry.name)}:ready`, data: {} },
        'core', coreManifest,
      );
    }
  }

  // For infrastructure group: return failure if any plugin failed (fatal)
  // For application group: failures are not fatal
  if (group === PLUGIN_GROUP.INFRASTRUCTURE) {
    const failedCount = pluginEntries.length - prepared.size;
    if (failedCount > 0) {
      return { failed: true, reason: 'INFRASTRUCTURE_PLUGIN_FAILED' };
    }
  }

  return { failed: false };
}
