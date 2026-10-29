// StartupRegistry — the private registry that holds prepared services during startup.
// Prepared services live here until the startup group commits; only then are they
// promoted to the public Registry. This registry is internal to the Core: no plugin
// or UI can query it, and a service held here is not yet publicly available.
// Removal is silent — core:service-unavailable is never published from here,
// because these services were never public.

/**
 * Creates a new StartupRegistry instance.
 *
 * The startup registry maps service names to prepared service objects (direct
 * references) and tracks which plugin prepared each service. It is a holding
 * area used during group startup, not a discovery point for plugins.
 *
 * @param {object} logger - The Core's internal logger for security events.
 * @returns {object} An object with add, has, get, getProvider, remove,
 *   removeByPlugin, and promoteToPublic methods.
 */
export function createStartupRegistry(logger) {
  /** @type {Map<string, {serviceName: string, serviceObject: object, providerPlugin: string}>} */
  const entries = new Map();

  return {
    /**
     * Adds a prepared service to the startup registry.
     *
     * The service must be declared in the manifest's `provides` section.
     * If the service is not declared, the attempt is rejected and logged
     * as a security event. Duplicate service names are also rejected.
     *
     * @param {string} serviceName - The service name (vendor.name.service).
     * @param {object} serviceObject - The direct reference to the prepared service instance.
     * @param {string} providerPlugin - The name of the preparing plugin.
     * @param {object} manifest - The preparing plugin's manifest.
     * @returns {{success: boolean, error?: string}} Success or failure with an error code.
     */
    add(serviceName, serviceObject, providerPlugin, manifest) {
      const declared = manifest.provides?.some((s) => s.name === serviceName);
      if (!declared) {
        logger.security('UNAUTHORIZED_PREPARE', {
          providerPlugin,
          serviceName,
        });
        return { success: false, error: 'SERVICE_NOT_DECLARED_IN_MANIFEST' };
      }

      if (entries.has(serviceName)) {
        const existing = entries.get(serviceName);
        logger.error('DUPLICATE_SERVICE', {
          serviceName,
          existingProvider: existing.providerPlugin,
          newProvider: providerPlugin,
        });
        return { success: false, error: 'DUPLICATE_SERVICE' };
      }

      entries.set(serviceName, { serviceName, serviceObject, providerPlugin });
      return { success: true };
    },

    /**
     * Returns true if a prepared service is held in the startup registry.
     *
     * @param {string} serviceName - The service name to check.
     * @returns {boolean}
     */
    has(serviceName) {
      return entries.has(serviceName);
    },

    /**
     * Returns the prepared service object, or null if not present.
     *
     * @param {string} serviceName - The service name to retrieve.
     * @returns {object|null} The service object, or null.
     */
    get(serviceName) {
      const entry = entries.get(serviceName);
      return entry ? entry.serviceObject : null;
    },

    /**
     * Returns the name of the plugin that prepared a service, or null.
     *
     * Used by the settlement algorithm to check whether a provider is still
     * among the surviving plugins.
     *
     * @param {string} serviceName - The service name to inspect.
     * @returns {string|null} The preparing plugin name, or null.
     */
    getProvider(serviceName) {
      const entry = entries.get(serviceName);
      return entry ? entry.providerPlugin : null;
    },

    /**
     * Silently removes a single service from the startup registry.
     *
     * Does NOT publish `core:service-unavailable`. Used during rollback or
     * settlement when a plugin is deactivated before group commit — these
     * services were never public.
     *
     * @param {string} serviceName - The service name to remove.
     * @returns {void}
     */
    remove(serviceName) {
      entries.delete(serviceName);
    },

    /**
     * Silently removes all services prepared by a given plugin.
     *
     * Does NOT publish `core:service-unavailable`. Used when a plugin is
     * deactivated during settlement (before group commit).
     *
     * @param {string} pluginName - The name of the plugin whose services to remove.
     * @returns {string[]} The list of removed service names.
     */
    removeByPlugin(pluginName) {
      const removedServices = [];

      for (const [serviceName, entry] of entries) {
        if (entry.providerPlugin === pluginName) {
          removedServices.push(serviceName);
          entries.delete(serviceName);
        }
      }

      return removedServices;
    },

    /**
     * Promotes a plugin's prepared services to the public Registry.
     *
     * Called during group commit. Each prepared service is registered in the
     * public Registry (which re-checks it is declared in manifest.provides)
     * and then removed from the private startup registry.
     *
     * @param {object} registry - The public Registry instance.
     * @param {string} pluginName - The name of the plugin whose services to promote.
     * @param {object} manifest - The providing plugin's manifest.
     * @returns {string[]} The list of promoted service names.
     */
    promoteToPublic(registry, pluginName, manifest) {
      const promotedServices = [];

      for (const [serviceName, entry] of entries) {
        if (entry.providerPlugin === pluginName) {
          const regResult = registry.register(
            serviceName, entry.serviceObject, pluginName, manifest,
          );
          if (!regResult.success) {
            // Public registration failed — do NOT remove from the private
            // registry. Stop promotion and return what was promoted so far
            // so the caller can handle the failure (e.g. deactivate the
            // plugin). Leaving the service in the private registry keeps
            // state consistent: it is still prepared, just not public.
            return { success: false, error: regResult.error, promotedServices };
          }
          promotedServices.push(serviceName);
          entries.delete(serviceName);
        }
      }

      return { success: true, promotedServices };
    },
  };
}
