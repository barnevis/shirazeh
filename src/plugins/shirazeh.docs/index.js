// Wires the documentation service into Bonyan's two-phase plugin lifecycle.

import { SERVICE_NAME } from './lib/constants.js';
import { createDocsService } from './lib/docs-service.js';

const CORE_SERVICE_UNAVAILABLE_EVENT = 'core:service-unavailable';
const REQUIRED_SERVICE_NAMES = ['shirazeh.http.service', 'pey.markdown.service'];

let lifecycleControls = null;

/**
 * Prepares the declared documentation service.
 *
 * @param {object} prepareContext Bonyan preparation context.
 * @returns {Promise<Array<{name: string, object: object}>>} Declared service registrations.
 */
export async function prepare(prepareContext) {
  lifecycleControls = null;

  const docs = createDocsService({
    config: prepareContext.config,
    publish: (type, data) => prepareContext.events.publish(type, data),
  });
  lifecycleControls = docs;

  prepareContext.onDeactivated = () => docs.deactivate();
  prepareContext.onShutdown = async () => docs.deactivate();

  // Losing a required dependency after activation is a critical error the
  // plugin must report itself; the Core only broadcasts the announcement.
  prepareContext.events.subscribe(CORE_SERVICE_UNAVAILABLE_EVENT, (event) => {
    const serviceName = event?.data?.serviceName;
    if (REQUIRED_SERVICE_NAMES.includes(serviceName)) {
      prepareContext.reportCriticalError({
        code: 'REQUIRED_DEPENDENCY_LOST',
        message: `Required service ${serviceName} is no longer available`,
        source: 'shirazeh.docs',
        type: 'critical',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return [{ name: SERVICE_NAME, object: docs.service }];
}

/**
 * Binds the declared HTTP and markdown dependencies after settlement.
 *
 * @param {Record<string, object>} services Bound declared dependencies.
 * @returns {Promise<void>}
 */
export async function activate(services) {
  lifecycleControls?.bindDependencies(services);
}
