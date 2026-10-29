// Wires the preference service into Bonyan's two-phase plugin lifecycle.

import { createPrefsService } from './lib/prefs-service.js';

const CORE_SERVICE_UNAVAILABLE_EVENT = 'core:service-unavailable';
const REQUIRED_SERVICE_NAMES = ['pey.storage.service'];
const PLUGIN_NAME = 'shirazeh.prefs';
const DEFAULT_COLLECTION = 'prefs';

let lifecycleControls = null;

/**
 * Prepares the declared preference service.
 *
 * @param {object} prepareContext Bonyan preparation context.
 * @returns {Promise<Array<{name: string, object: object}>>} Declared service registrations.
 */
export async function prepare(prepareContext) {
  lifecycleControls = null;

  const prefs = createPrefsService({
    collection: prepareContext.config.collection || DEFAULT_COLLECTION,
  });
  lifecycleControls = prefs;

  prepareContext.onDeactivated = () => prefs.deactivate();
  prepareContext.onShutdown = async () => prefs.deactivate();

  // Losing the required storage dependency after activation is a critical
  // error this plugin must report itself.
  prepareContext.events.subscribe(CORE_SERVICE_UNAVAILABLE_EVENT, (event) => {
    const serviceName = event?.data?.serviceName;
    if (REQUIRED_SERVICE_NAMES.includes(serviceName)) {
      prepareContext.reportCriticalError({
        code: 'REQUIRED_DEPENDENCY_LOST',
        message: `Required service ${serviceName} is no longer available`,
        source: PLUGIN_NAME,
        type: 'critical',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return [{ name: 'shirazeh.prefs.service', object: prefs.service }];
}

/**
 * Binds the storage dependency after settlement.
 *
 * @param {Record<string, object>} services Bound declared dependencies.
 * @returns {Promise<void>}
 */
export async function activate(services) {
  lifecycleControls?.bindDependencies(services);
}
