// Registry — the index of addresses for all registered services.
// Provides register (with provides check), getForPlugin (with dependencies check),
// remove (silent cleanup), and deregisterByPlugin (publishes core:service-unavailable).
// The Registry is never handed to a plugin or the UI; it remains internal to the Core.

import { CORE_ERROR_EVENTS } from './error-manager.js';

/**
 * Creates a new Registry instance.
 *
 * The Registry maps service names to service objects (direct references) and
 * tracks which plugin provided each service. It is a discovery point, not a
 * communication intermediary — calls happen directly between the requesting
 * plugin and the service.
 *
 * @param {object} logger - The Core's internal logger for security and error events.
 * @param {object} coreManifest - The Core's own manifest, used as the source when
 *   publishing `core:service-unavailable` events via the Event Bus.
 * @returns {object} An object with register, getForPlugin, has, remove, and deregisterByPlugin methods.
 */
export function createRegistry(logger, coreManifest) {
  /** @type {Map<string, {serviceName: string, serviceObject: object, providerPlugin: string}>} */
  const entries = new Map();

  return {
    /**
     * Registers a service in the Registry.
     *
     * The service must be declared in the manifest's `provides` section.
     * If the service is not declared, the attempt is rejected and logged
     * as a security event. Duplicate service names are also rejected.
     *
     * @param {string} serviceName - The service name (vendor.name.service).
     * @param {object} serviceObject - The direct reference to the service instance.
     * @param {string} providerPlugin - The name of the providing plugin.
     * @param {object} manifest - The providing plugin's manifest.
     * @returns {{success: boolean, error?: string}} Success or failure with an error code.
     */
    register(serviceName, serviceObject, providerPlugin, manifest) {
      const declared = manifest.provides?.some((s) => s.name === serviceName);
      if (!declared) {
        logger.security('UNAUTHORIZED_REGISTER', {
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
     * Returns a service object for a requesting plugin, after access control.
     *
     * The plugin must have declared the service in its manifest's `dependencies`
     * (required or optional). Access control is enforced only at startup.
     * If the service does not exist, returns null (for optional dependencies).
     *
     * @param {string} serviceName - The service name to retrieve.
     * @param {string} requestingPlugin - The name of the requesting plugin.
     * @param {object} manifest - The requesting plugin's manifest.
     * @returns {{available: boolean, service?: object}} The service object or absent marker.
     */
    getForPlugin(serviceName, requestingPlugin, manifest) {
      const required = manifest.dependencies?.required ?? [];
      const optional = manifest.dependencies?.optional ?? [];
      const declared = [...required, ...optional];

      if (!declared.includes(serviceName)) {
        logger.security('UNAUTHORIZED_ACCESS', {
          requestingPlugin,
          serviceName,
        });
        return { available: false, error: 'SERVICE_NOT_DECLARED_IN_DEPENDENCIES' };
      }

      if (!entries.has(serviceName)) {
        return { available: false };
      }

      return { available: true, service: entries.get(serviceName).serviceObject };
    },

    /**
     * Returns true if a service is currently registered.
     *
     * @param {string} serviceName - The service name to check.
     * @returns {boolean}
     */
    has(serviceName) {
      return entries.has(serviceName);
    },

    /**
     * Silently removes a single service from the Registry.
     *
     * Does NOT publish `core:service-unavailable`. In the current group-based
     * startup flow, service removal is handled by `startupRegistry.remove`
     * (private registry) or `deregisterByPlugin` (public registry). This method
     * is retained for potential future use or testing.
     *
     * @param {string} serviceName - The service name to remove.
     * @returns {void}
     */
    remove(serviceName) {
      entries.delete(serviceName);
    },

    /**
     * Removes all services provided by a plugin and publishes
     * `core:service-unavailable` for each.
     *
     * Used when an active plugin is deactivated or crashes. The event is only
     * an announcement — plugins that already hold a direct reference still have
     * it, but calling methods on it is invalid (the service must return a
     * Pey error in that case).
     *
     * @param {string} pluginName - The name of the plugin being deactivated.
     * @param {object} eventBus - The Event Bus for publishing announcements.
     * @returns {string[]} The list of removed service names.
     */
    deregisterByPlugin(pluginName, eventBus) {
      const removedServices = [];

      for (const [serviceName, entry] of entries) {
        if (entry.providerPlugin === pluginName) {
          removedServices.push(serviceName);
          entries.delete(serviceName);
        }
      }

      for (const serviceName of removedServices) {
        eventBus.publish(
          {
            type: CORE_ERROR_EVENTS.SERVICE_UNAVAILABLE,
            data: { serviceName, providerPlugin: pluginName },
          },
          'core',
          coreManifest,
        );
      }

      return removedServices;
    },
  };
}
