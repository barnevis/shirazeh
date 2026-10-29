// UIHandler — loads the UI manifest via moduleLoader.loadManifest(), validates it
// (no type, no provides), builds the UIContext, and invokes the UI entry point via
// moduleLoader.loadEntry(). UI failure does not stop the system.
// Also handles UI shutdown via the two-way onShutdown hook.
// Platform-neutral: the Runtime Host's moduleLoader provides the two-step contract.

import { createScopedEventBus } from './security.js';

/**
 * Creates a new UIHandler instance.
 *
 * @param {object} deps - The UI handler dependencies.
 * @param {object} deps.logger - The Core's internal logger.
 * @param {object} deps.registry - The Core's Registry instance.
 * @param {object} deps.eventBus - The Core's Event Bus instance.
 * @param {object} deps.coreManifest - The Core's own manifest.
 * @param {object} deps.moduleLoader - The Runtime Host's module loader exposing the
 *   two-step contract: `loadManifest(ref)` (must not execute UI code) and
 *   `loadEntry(ref)` (called only after successful manifest validation).
 * @returns {object} An object with startUI and stopUI methods.
 */
export function createUIHandler({ logger, registry, eventBus, coreManifest, moduleLoader }) {
  return {
    /**
     * Starts the UI.
     *
     * @param {object} config - The full bootstrap configuration.
     * @returns {Promise<{success: boolean, error?: string, uiContext?: object}>}
     */
    async startUI(config) {
      // Step 1: Load UI manifest via moduleLoader.loadManifest() — must not execute UI code.
      let uiManifest;
      try {
        uiManifest = await moduleLoader.loadManifest(config.ui.path);
      } catch {
        return { success: false, error: 'INVALID_UI_MANIFEST' };
      }

      // Step 2: Validate UI manifest (no type, no provides, no adapterType section).
      // If validation fails, loadEntry() is never called and no UI code runs.
      if (uiManifest.type !== undefined || uiManifest.provides !== undefined || uiManifest.adapterType !== undefined) {
        return { success: false, error: 'INVALID_UI_MANIFEST' };
      }

      // Build service map for UI (access-controlled, same as plugins)
      const services = buildServiceMap(uiManifest, registry);

      // Build UI context (same three things as plugins, plus onShutdown hook)
      const uiContext = {
        services,
        events: createScopedEventBus(eventBus, uiManifest),
        config: config.config?.ui ?? {},
        onShutdown: null,
      };

      // Step 3: Load UI entry point via moduleLoader.loadEntry() and invoke setup().
      // Only reached after successful manifest validation (two-step contract).
      try {
        await invokeEntryPoint(config.ui.path, uiContext, moduleLoader);
        return { success: true, uiContext };
      } catch (error) {
        // UI failure does NOT stop the system.
        // SystemLifecycle will publish core:ui-failed and continue to core:ready.
        return { success: false, error: 'UI_STARTUP_FAILED', detail: error.message };
      }
    },

    /**
     * Stops the UI.
     *
     * @param {object|null} uiContext - The UI context returned by startUI.
     * @returns {void}
     */
    stopUI(uiContext) {
      if (!uiContext) {
        return; // UI never started successfully
      }
      try {
        if (uiContext.onShutdown) {
          uiContext.onShutdown();
        }
      } catch (error) {
        // UI error during shutdown does NOT block the process.
        // Core logs and moves on to plugin shutdown.
        logger.error('UI_SHUTDOWN_ERROR', { error: error.message });
      }
    },
  };

  /**
   * Builds the service map for the UI by resolving its declared dependencies.
   *
   * @param {object} uiManifest - The UI manifest.
   * @param {object} registry - The Core's Registry instance.
   * @returns {object} A map of serviceName to serviceObject.
   * @private
   */
  function buildServiceMap(uiManifest, registry) {
    const services = {};
    const required = uiManifest.dependencies?.required ?? [];
    const optional = uiManifest.dependencies?.optional ?? [];

    for (const serviceName of required) {
      const result = registry.getForPlugin(serviceName, 'ui', uiManifest);
      if (result.available) {
        services[serviceName] = result.service;
      }
    }

    for (const serviceName of optional) {
      if (registry.has(serviceName)) {
        const result = registry.getForPlugin(serviceName, 'ui', uiManifest);
        if (result.available) {
          services[serviceName] = result.service;
        }
      }
    }

    return services;
  }
}

/**
 * Invokes the UI's entry point.
 *
 * The entry point is loaded via the Runtime Host's `moduleLoader.loadEntry(ref)`,
 * which is only called after successful manifest validation (two-step contract).
 *
 * @param {string} uiPath - The path to the UI's root folder.
 * @param {object} uiContext - The UIContext.
 * @param {object} moduleLoader - The Host's module loader (two-step contract).
 * @returns {Promise<void>}
 * @private
 */
async function invokeEntryPoint(uiPath, uiContext, moduleLoader) {
  const module = await moduleLoader.loadEntry(uiPath);
  return module.setup(uiContext);
}
