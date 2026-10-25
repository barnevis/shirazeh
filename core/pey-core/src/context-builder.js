// ContextBuilder — assembles the contexts handed to plugins at startup.
// 0.11 two-phase contract:
//   - buildPrepareContext: config + scoped events + two-way hooks (NO services).
//     Handed to the plugin's prepare() phase.
//   - buildServiceMapForGroup: resolves declared dependencies from both the
//     private startup registry (same group) and the public registry (previous
//     groups). Handed to the plugin's activate() phase.

import { createScopedEventBus } from './security.js';

/**
 * Error thrown when a required dependency is missing after settlement.
 *
 * This is an invariant violation: settlement guarantees every surviving
 * plugin's required dependencies are available. If a required dependency is
 * not found in either registry at binding time, it indicates a logic bug in
 * the settlement or registry flow, not a normal startup condition.
 */
class RequiredDependencyMissingError extends Error {
  constructor(pluginName, serviceName) {
    super(`REQUIRED_DEPENDENCY_MISSING: ${serviceName} required by ${pluginName} was not found in any registry after settlement`);
    this.code = 'REQUIRED_DEPENDENCY_MISSING';
    this.pluginName = pluginName;
    this.serviceName = serviceName;
  }
}

/**
 * Builds the PrepareContext object handed to a plugin's prepare() phase.
 *
 * The prepare context contains exactly:
 * 1. Final merged configuration (manifest defaults overridden by project config).
 * 2. Scoped Event Bus access (publish auto-injects source from manifest name,
 *    subscribe delegates to the Event Bus).
 * 3. Two-way lifecycle hooks (onShutdown, onDeactivated) — initially null;
 *    the plugin may assign its own functions to these.
 * 4. reportCriticalError — a function the plugin calls to report a critical
 *    error to the Core.
 *
 * The `services` field is absent. Services are bound in phase 2 via
 * activate(services). During preparation the plugin must not call another
 * application plugin's service.
 *
 * @param {object} params - The context parameters.
 * @param {object} params.manifest - The plugin's manifest.
 * @param {object} params.eventBus - The Core's Event Bus instance.
 * @param {object} params.config - The plugin's final merged configuration.
 * @param {Function} params.reportCriticalError - The Core's critical error handler.
 * @returns {object} The assembled PrepareContext (no services field).
 */
export function buildPrepareContext({ manifest, eventBus, config, reportCriticalError }) {
  const events = createScopedEventBus(eventBus, manifest);

  return {
    config,
    events,
    onShutdown: null,
    onDeactivated: null,
    reportCriticalError,
  };
}

/**
 * Builds the service map for a plugin's activate() phase by resolving its
 * declared dependencies from both the private startup registry and the public
 * registry.
 *
 * The private startup registry is checked first (this enables required
 * dependency cycles within the same group), then the public registry (services
 * committed by previously processed groups). Required dependencies are always
 * present (validated during settlement). Optional dependencies are present only
 * if the service exists in either registry.
 *
 * @param {object} manifest - The plugin's manifest.
 * @param {object} startupRegistry - The private startup registry (same group).
 * @param {object} publicRegistry - The public Registry (previous groups).
 * @returns {Object<string, object>} A plain object mapping serviceName to serviceObject.
 */
export function buildServiceMapForGroup(manifest, startupRegistry, publicRegistry) {
  const services = {};
  const required = manifest.dependencies?.required ?? [];
  const optional = manifest.dependencies?.optional ?? [];

  for (const serviceName of required) {
    // Settlement guarantees every surviving plugin's required dependencies are
    // available. If a required dependency is not found in either registry at
    // binding time, it is an invariant violation (a logic bug in settlement or
    // the registry flow), not a normal startup condition. Throw so it is not
    // silently ignored.
    if (startupRegistry.has(serviceName)) {
      services[serviceName] = startupRegistry.get(serviceName);
    } else if (publicRegistry.has(serviceName)) {
      const result = publicRegistry.getForPlugin(serviceName, manifest.name, manifest);
      if (result.available) {
        services[serviceName] = result.service;
      } else {
        throw new RequiredDependencyMissingError(manifest.name, serviceName);
      }
    } else {
      throw new RequiredDependencyMissingError(manifest.name, serviceName);
    }
  }

  for (const serviceName of optional) {
    // Optional dependencies are absent by design — no invariant is violated.
    if (startupRegistry.has(serviceName)) {
      services[serviceName] = startupRegistry.get(serviceName);
    } else if (publicRegistry.has(serviceName)) {
      const result = publicRegistry.getForPlugin(serviceName, manifest.name, manifest);
      if (result.available) {
        services[serviceName] = result.service;
      }
    }
  }

  return services;
}
